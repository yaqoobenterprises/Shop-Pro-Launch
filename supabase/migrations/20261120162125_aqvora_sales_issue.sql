-- Restricted verified-source route. Generic posting and its AR rejection stay intact.
CREATE FUNCTION public.issue_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid,
  p_expected_revision bigint,p_fingerprint text,p_intent_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE actor uuid; d public.aqvora_sales_invoices; prior jsonb; context jsonb;
  request jsonb; saved public.aqvora_sales_issue_receipts; response jsonb;
  new_journal uuid := gen_random_uuid(); journal_intent text; journal_lines jsonb;
  payload jsonb; fiscal_period uuid; sequence_number bigint; posted_time timestamptz := now();
BEGIN
  actor := private.aqvora_sales_authorize(p_organization_id);
  IF p_intent_key IS NULL OR length(p_intent_key) NOT BETWEEN 1 AND 100 OR p_intent_key<>btrim(p_intent_key)
    OR p_expected_revision IS NULL OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'Invalid sales issuance request'; END IF;
  request := jsonb_build_object('invoice_id',p_invoice_id,'expected_revision',p_expected_revision::text,
    'fingerprint',p_fingerprint,'actor_id',actor);
  -- Same-source retries wait here. The receipt is re-read after acquiring the lock.
  SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_organization_id AND id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales invoice is unavailable in this company'; END IF;
  SELECT * INTO saved FROM public.aqvora_sales_issue_receipts WHERE organization_id=p_organization_id AND intent_key=p_intent_key;
  IF FOUND THEN
    IF saved.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Sales issuance idempotency payload mismatch'; END IF;
    IF NOT private.aqvora_sales_source_valid(p_organization_id,d.id) THEN RAISE EXCEPTION 'Sales source is inconsistent'; END IF;
    RETURN saved.response;
  END IF;
  IF d.state<>'approved' OR d.revision IS DISTINCT FROM p_expected_revision OR d.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'Sales source is unapproved, immutable or stale';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.aqvora_sales_audit a WHERE a.organization_id=p_organization_id
    AND a.entity_type='invoice' AND a.entity_id=d.id AND a.revision=d.revision AND a.action='APPROVE'
    AND a.actor_id=d.approved_by AND a.after_row=private.aqvora_sales_json(d))
    OR (SELECT count(*) FROM public.aqvora_sales_audit a WHERE a.organization_id=p_organization_id
      AND a.entity_type='invoice' AND a.entity_id=d.id) <> d.revision THEN
    RAISE EXCEPTION 'Sales approval audit does not certify the current source';
  END IF;
  PERFORM 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=d.approved_by
    AND role='OWNER' AND is_active FOR SHARE;
  IF NOT FOUND OR d.approved_by=d.created_by THEN RAISE EXCEPTION 'Sales checker authorization is no longer valid'; END IF;
  PERFORM 1 FROM public.aqvora_enabled_companies WHERE organization_id=p_organization_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AQVORA posting is not enabled for this company'; END IF;
  context := private.aqvora_sales_context(d);
  IF d.customer_snapshot IS DISTINCT FROM context->'customer' OR d.policy_snapshot IS DISTINCT FROM context->'policy'
    OR d.fingerprint IS DISTINCT FROM private.aqvora_sales_fingerprint(d) THEN
    RAISE EXCEPTION 'Sales source or policy changed; approval is stale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.aqvora_journals WHERE organization_id=p_organization_id AND currency<>d.currency) THEN
    RAISE EXCEPTION 'Company base currency differs from posted history';
  END IF;
  SELECT id INTO fiscal_period FROM public.aqvora_periods WHERE organization_id=p_organization_id
    AND d.business_date BETWEEN starts_on AND ends_on AND state='open';
  INSERT INTO private.aqvora_sales_numbers(organization_id,last_number) VALUES(p_organization_id,1)
    ON CONFLICT (organization_id) DO UPDATE SET last_number=private.aqvora_sales_numbers.last_number+1
    RETURNING last_number INTO sequence_number;
  journal_intent := 'sales-invoice:' || new_journal::text;
  journal_lines := jsonb_build_array(
    jsonb_build_object('account_id',d.policy_snapshot->>'ar_account_id','debit_minor',d.face_minor::text,'credit_minor','0',
      'party_id',d.customer_id::text,'open_item_id',d.id::text,'stock_movement_id',NULL),
    jsonb_build_object('account_id',d.policy_snapshot->>'revenue_account_id','debit_minor','0','credit_minor',d.face_minor::text,
      'party_id',NULL,'open_item_id',NULL,'stock_movement_id',NULL));
  payload := jsonb_build_object('business_date',d.business_date,'currency',d.currency,'lines',journal_lines,
    'reversal_of',NULL,'reason',NULL,'sales_invoice_id',d.id,'source_revision',d.revision::text,'source_fingerprint',d.fingerprint);
  INSERT INTO public.aqvora_journals(organization_id,id,intent_key,business_date,currency,period_id,payload,total_minor,
    posted_by,posted_at,source_kind,source_id,source_revision,source_fingerprint)
    VALUES(p_organization_id,new_journal,journal_intent,d.business_date,d.currency,fiscal_period,payload,d.face_minor,
      actor,posted_time,'sales_invoice',d.id,d.revision,d.fingerprint);
  INSERT INTO public.aqvora_journal_lines(organization_id,journal_id,line_no,account_id,debit_minor,credit_minor,party_id,open_item_id)
    VALUES (p_organization_id,new_journal,1,(d.policy_snapshot->>'ar_account_id')::uuid,d.face_minor,0,d.customer_id::text,d.id::text),
      (p_organization_id,new_journal,2,(d.policy_snapshot->>'revenue_account_id')::uuid,0,d.face_minor,NULL,NULL);
  INSERT INTO public.aqvora_posting_receipts(organization_id,intent_key,journal_id,payload)
    VALUES(p_organization_id,journal_intent,new_journal,payload);
  INSERT INTO public.aqvora_journal_audit(organization_id,journal_id,action,actor_id,details)
    VALUES(p_organization_id,new_journal,'POST',actor,jsonb_build_object('reversal_of',NULL,'reason',NULL));
  prior := private.aqvora_sales_json(d);
  UPDATE public.aqvora_sales_invoices SET state='issued',revision=revision+1,journal_id=new_journal,document_number=sequence_number
    WHERE organization_id=p_organization_id AND id=p_invoice_id RETURNING * INTO d;
  response := jsonb_build_object('organization_id',p_organization_id,'invoice_id',d.id,
    'intent_key',p_intent_key,'document_number','SI-' || sequence_number::text,'journal_id',new_journal,
    'journal_intent_key',journal_intent,'customer_id',d.customer_id,'business_date',d.business_date,
    'currency',d.currency,'face_minor',d.face_minor::text,'source_revision',p_expected_revision::text,
    'issued_revision',d.revision::text,'fingerprint',d.fingerprint,'posted_by',actor,'posted_at',posted_time);
  INSERT INTO public.aqvora_sales_issue_receipts(organization_id,intent_key,invoice_id,journal_id,request,response)
    VALUES(p_organization_id,p_intent_key,d.id,new_journal,request,response);
  PERFORM private.aqvora_sales_audit_event(p_organization_id,'invoice',d.id,d.revision,'ISSUE',actor,prior,private.aqvora_sales_json(d));
  RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.issue_aqvora_sales_invoice(uuid,uuid,bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_aqvora_sales_invoice(uuid,uuid,bigint,text,text) TO authenticated;
