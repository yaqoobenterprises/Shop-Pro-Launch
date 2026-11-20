CREATE FUNCTION private.aqvora_invoice_allocation_state(p_org uuid,p_invoice uuid,p_asof date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.aqvora_sales_invoices;total numeric;dated numeric;refs jsonb;fingerprint text;
BEGIN
  SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_org AND id=p_invoice AND state='issued';
  IF NOT FOUND OR NOT private.aqvora_sales_source_valid(p_org,p_invoice) THEN RAISE EXCEPTION 'Invoice source is unavailable or inconsistent'; END IF;
  IF p_asof IS NOT NULL AND (p_asof NOT BETWEEN date '0001-01-01' AND date '9999-12-31' OR p_asof<d.business_date) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invoice did not exist at this cutoff or date is invalid'; END IF;
  IF EXISTS(SELECT 1 FROM public.aqvora_customer_receipts r WHERE r.organization_id=p_org AND r.state='posted'
      AND r.allocations @> jsonb_build_array(jsonb_build_object('invoice_id',p_invoice))
      AND NOT private.aqvora_customer_receipt_source_valid(p_org,r.id))
    OR EXISTS(SELECT 1 FROM public.aqvora_receipt_allocations a LEFT JOIN public.aqvora_customer_receipts r
    ON r.organization_id=p_org AND r.id=a.receipt_id WHERE a.organization_id=p_org AND a.invoice_id=p_invoice
      AND (r.id IS NULL OR r.state<>'posted' OR NOT private.aqvora_customer_receipt_source_valid(p_org,r.id))) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invoice allocation source is incomplete or inconsistent'; END IF;
  SELECT coalesce(sum(a.amount_minor),0),coalesce(sum(a.amount_minor) FILTER(WHERE p_asof IS NULL OR r.business_date<=p_asof),0),
    coalesce(jsonb_agg(jsonb_build_object('allocation_id',a.id,'receipt_id',r.id,'collection_id',r.collection_id,
      'receipt_number','CR-'||r.receipt_number::text,'business_date',r.business_date,'amount_minor',a.amount_minor::text,
      'journal_id',a.journal_id,'line_no',a.line_no) ORDER BY r.business_date,r.id,a.line_no)
      FILTER(WHERE p_asof IS NULL OR r.business_date<=p_asof),'[]') INTO total,dated,refs
    FROM public.aqvora_receipt_allocations a JOIN public.aqvora_customer_receipts r
      ON r.organization_id=p_org AND r.id=a.receipt_id WHERE a.organization_id=p_org AND a.invoice_id=p_invoice;
  IF total>d.face_minor OR dated>d.face_minor THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invoice is over-allocated'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array('invoice-open-v1',p_org,d.id,d.revision::text,d.fingerprint,p_asof,refs)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('organization_id',p_org,'invoice_id',d.id,'customer_id',d.customer_id,'currency',d.currency,
    'business_date',d.business_date,'due_date',d.due_date,'as_of_date',p_asof,'face_minor',d.face_minor::text,
    'allocated_minor',dated::text,'outstanding_minor',(d.face_minor-dated)::text,'all_posted_allocated_minor',total::text,
    'status',CASE WHEN dated=0 THEN 'unpaid' WHEN dated=d.face_minor THEN 'settled' ELSE 'partial' END,
    'allocations',refs,'source_complete',true,'scope','v2_invoice_allocations','fingerprint',fingerprint,
    'legacy_included',false,'opening_migration_verified',false);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_invoice_allocation_state(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_aqvora_invoice_open_balance(p_organization_id uuid,p_invoice_id uuid,p_as_of_date date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  IF p_as_of_date IS NULL THEN RAISE EXCEPTION 'Explicit open-balance cutoff is required'; END IF;
  RETURN private.aqvora_invoice_allocation_state(p_organization_id,p_invoice_id,p_as_of_date);
END $$;
CREATE FUNCTION public.list_aqvora_open_invoices(p_organization_id uuid,p_customer_id uuid,p_currency text,p_as_of_date date,
  p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100,p_snapshot_token text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;result jsonb;
BEGIN
  source:=private.aqvora_certify_read(p_organization_id,date '0001-01-01',p_as_of_date,p_currency,p_snapshot_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_customer_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.aqvora_customers WHERE organization_id=p_organization_id AND id=p_customer_id) THEN
    RAISE EXCEPTION 'Invalid open-invoice customer or page'; END IF;
  IF p_after_id IS NOT NULL AND p_snapshot_token IS NULL THEN RAISE EXCEPTION 'Open invoice continuation requires its snapshot token'; END IF;
  WITH balances AS MATERIALIZED(
    SELECT d.id,private.aqvora_invoice_allocation_state(p_organization_id,d.id,p_as_of_date) AS item
      FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_organization_id AND d.customer_id=p_customer_id
        AND d.currency=p_currency AND d.state='issued' AND d.business_date<=p_as_of_date
  ), page AS(SELECT * FROM balances WHERE (item->>'outstanding_minor')::numeric>0 AND (p_after_id IS NULL OR id>p_after_id)
    ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('source',source,'matched_count',(SELECT count(*)::text FROM balances WHERE (item->>'outstanding_minor')::numeric>0),
    'rows',coalesce((SELECT jsonb_agg(item ORDER BY id) FROM page),'[]'),
    'has_more',EXISTS(SELECT 1 FROM balances WHERE (item->>'outstanding_minor')::numeric>0 AND id>(SELECT id FROM page ORDER BY id DESC LIMIT 1)),
    'next_after_id',(SELECT id FROM page ORDER BY id DESC LIMIT 1)) INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.read_aqvora_receivables(p_organization_id uuid,p_currency text,p_as_of_date date,p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;face numeric:=0;allocated numeric:=0;outstanding numeric:=0;control numeric;n bigint;balance jsonb;
BEGIN
  source:=private.aqvora_certify_read(p_organization_id,date '0001-01-01',p_as_of_date,p_currency,NULL);
  IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.aqvora_customers WHERE organization_id=p_organization_id AND id=p_customer_id) THEN
    RAISE EXCEPTION 'Receivable customer is unavailable in this company'; END IF;
  n:=0;
  FOR balance IN SELECT private.aqvora_invoice_allocation_state(p_organization_id,d.id,p_as_of_date)
    FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_organization_id AND d.state='issued'
      AND d.business_date<=p_as_of_date AND d.currency=p_currency AND (p_customer_id IS NULL OR d.customer_id=p_customer_id) LOOP
    face:=face+(balance->>'face_minor')::numeric;allocated:=allocated+(balance->>'allocated_minor')::numeric;
    outstanding:=outstanding+(balance->>'outstanding_minor')::numeric;n:=n+1;
  END LOOP;
  SELECT coalesce(sum(l.debit_minor::numeric-l.credit_minor),0) INTO control
    FROM public.aqvora_journals j JOIN public.aqvora_journal_lines l ON l.organization_id=p_organization_id AND l.journal_id=j.id
    JOIN public.aqvora_accounts a ON a.organization_id=p_organization_id AND a.id=l.account_id
    WHERE j.organization_id=p_organization_id AND j.business_date<=p_as_of_date AND a.control_role='receivable'
      AND (p_customer_id IS NULL OR l.party_id=p_customer_id::text);
  IF face<>allocated+outstanding OR outstanding<>control THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Customer subledger does not reconcile to certified AR control'; END IF;
  RETURN jsonb_build_object('source',source,'customer_id',p_customer_id,'as_of_date',p_as_of_date,'invoice_count',n::text,
    'face_minor',face::text,'allocated_minor',allocated::text,'outstanding_minor',outstanding::text,'ar_control_minor',control::text,
    'scope',CASE WHEN p_customer_id IS NULL THEN 'company' ELSE 'customer' END,'aging_supported',false);
END $$;
REVOKE ALL ON FUNCTION public.get_aqvora_invoice_open_balance(uuid,uuid,date),
  public.list_aqvora_open_invoices(uuid,uuid,text,date,uuid,integer,text),public.read_aqvora_receivables(uuid,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_aqvora_invoice_open_balance(uuid,uuid,date),
  public.list_aqvora_open_invoices(uuid,uuid,text,date,uuid,integer,text),public.read_aqvora_receivables(uuid,text,date,uuid) TO authenticated;
