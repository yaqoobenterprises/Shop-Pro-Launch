CREATE FUNCTION private.aqvora_receipt_audit_valid(p_org uuid,p_type text,p_id uuid,p_rev bigint,p_action text,p_actor uuid,p_after jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT count(*)=p_rev AND min(revision)=1 AND max(revision)=p_rev
    AND bool_and(coalesce(after_row->>'revision'=revision::text AND after_row->>'id'=p_id::text
      AND ((revision=1 AND action='CREATE' AND before_row IS NULL) OR (revision>1 AND before_row=previous_row)),false))
    FROM (SELECT a.*,lag(after_row) OVER(ORDER BY revision) previous_row FROM public.aqvora_receipt_audit a
      WHERE a.organization_id=p_org AND a.entity_type=p_type AND a.entity_id=p_id) history),false)
    AND EXISTS(SELECT 1 FROM public.aqvora_receipt_audit a WHERE a.organization_id=p_org AND a.entity_type=p_type
      AND a.entity_id=p_id AND a.revision=p_rev AND a.action=p_action AND a.actor_id=p_actor AND a.after_row=p_after);
$$;
CREATE FUNCTION private.aqvora_cash_source_valid(p_org uuid,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.aqvora_cash_collections c WHERE c.organization_id=p_org AND c.id=p_id AND c.state='confirmed'
    AND c.revision=2 AND c.confirmed_by<>c.created_by AND c.confirmed_at>=c.created_at
    AND c.fingerprint=private.aqvora_cash_fingerprint(c) AND c.policy_snapshot->>'source_kind'='controlled_cash'
    AND c.policy_snapshot->>'currency'=c.currency AND c.customer_snapshot->>'id'=c.customer_id::text
    AND private.aqvora_receipt_audit_valid(p_org,'collection',c.id,c.revision,'CONFIRM',c.confirmed_by,private.aqvora_cash_json(c))
    AND EXISTS(SELECT 1 FROM public.aqvora_receipt_audit a WHERE a.organization_id=p_org AND a.entity_type='collection'
      AND a.entity_id=c.id AND a.revision=1 AND a.actor_id=c.created_by
      AND a.after_row @> jsonb_build_object('customer_id',c.customer_id,'business_date',c.business_date,
        'currency',c.currency,'amount_minor',c.amount_minor::text,'collection_number','CC-'||c.collection_number::text)));
$$;
CREATE FUNCTION private.aqvora_customer_receipt_source_valid(p_org uuid,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.aqvora_customer_receipts r
    JOIN public.aqvora_cash_collections c ON c.organization_id=p_org AND c.id=r.collection_id
    JOIN public.aqvora_journals j ON j.organization_id=p_org AND j.id=r.journal_id
    JOIN public.aqvora_receipt_issues issue ON issue.organization_id=p_org AND issue.receipt_id=r.id AND issue.journal_id=j.id
    JOIN public.aqvora_posting_receipts pr ON pr.organization_id=p_org AND pr.journal_id=j.id AND pr.intent_key=j.intent_key
    WHERE r.organization_id=p_org AND r.id=p_id AND r.state='posted' AND c.created_by=r.created_by
      AND (c.customer_id,c.business_date,c.currency,c.amount_minor)=(r.customer_id,r.business_date,r.currency,r.amount_minor)
      AND c.fingerprint=r.collection_fingerprint AND private.aqvora_cash_source_valid(p_org,c.id)
      AND r.policy_snapshot->>'source_kind'='controlled_cash' AND r.policy_snapshot->>'currency'=r.currency
      AND r.policy_snapshot->>'cash_account_id'=c.policy_snapshot->>'cash_account_id'
      AND r.fingerprint=private.aqvora_receipt_fingerprint(r) AND r.approved_by<>r.created_by
      AND r.allocations=private.aqvora_receipt_normalize(p_org,r.customer_id,r.currency,r.business_date,
        (r.policy_snapshot->>'ar_account_id')::uuid,private.aqvora_receipt_raw_allocations(r.allocations))
      AND (SELECT sum((a->>'amount_minor')::numeric) FROM jsonb_array_elements(r.allocations)x(a))=r.amount_minor
      AND (SELECT count(*) FROM public.aqvora_customer_receipts rr WHERE rr.organization_id=p_org AND rr.collection_id=c.id AND rr.state='posted')=1
      AND j.source_kind='customer_receipt' AND j.source_id=r.id AND j.source_revision=r.revision-1
      AND j.source_fingerprint=r.fingerprint AND j.total_minor=r.amount_minor AND j.currency=r.currency
      AND j.business_date=r.business_date AND j.reversal_of IS NULL
      AND j.payload=jsonb_build_object('business_date',r.business_date,'currency',r.currency,
        'lines',private.aqvora_receipt_journal_lines(r),'reversal_of',NULL,'reason',NULL,
        'customer_receipt_id',r.id,'collection_id',r.collection_id,'source_revision',(r.revision-1)::text,'source_fingerprint',r.fingerprint)
      AND pr.payload=j.payload
      AND EXISTS(SELECT 1 FROM public.aqvora_periods p WHERE p.organization_id=p_org AND p.id=j.period_id
        AND r.business_date BETWEEN p.starts_on AND p.ends_on)
      AND (SELECT jsonb_agg(jsonb_build_object('account_id',l.account_id,'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text,
        'party_id',l.party_id,'open_item_id',l.open_item_id,'stock_movement_id',l.stock_movement_id) ORDER BY l.line_no)
        FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id)=private.aqvora_receipt_journal_lines(r)
      AND (SELECT min(line_no)=1 AND max(line_no)=count(*) AND count(*)=jsonb_array_length(r.allocations)+1
        FROM public.aqvora_journal_lines WHERE organization_id=p_org AND journal_id=j.id)
      AND (SELECT count(*) FROM public.aqvora_receipt_allocations a WHERE a.organization_id=p_org AND a.receipt_id=r.id)=jsonb_array_length(r.allocations)
      AND NOT EXISTS(SELECT 1 FROM public.aqvora_receipt_allocations a WHERE a.organization_id=p_org AND a.receipt_id=r.id
        AND (a.journal_id<>j.id OR coalesce(jsonb_build_object('invoice_id',a.invoice_id,'amount_minor',a.amount_minor::text,
          'invoice_revision',a.invoice_revision::text,'invoice_fingerprint',a.invoice_fingerprint)
            <>r.allocations->(a.line_no-2),true)))
      AND (SELECT count(*) FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id)=1
      AND EXISTS(SELECT 1 FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id AND a.action='POST'
        AND a.actor_id=j.posted_by AND a.details=jsonb_build_object('reversal_of',NULL,'reason',NULL))
      AND private.aqvora_receipt_audit_valid(p_org,'receipt',r.id,r.revision,'POST',j.posted_by,private.aqvora_customer_receipt_json(r))
      AND EXISTS(SELECT 1 FROM public.aqvora_receipt_audit a WHERE a.organization_id=p_org AND a.entity_type='receipt' AND a.entity_id=r.id
        AND a.revision=r.revision-1 AND a.action='APPROVE' AND a.actor_id=r.approved_by AND a.after_row->>'fingerprint'=r.fingerprint)
      AND issue.request=jsonb_build_object('receipt_id',r.id,'expected_revision',(r.revision-1)::text,'fingerprint',r.fingerprint,'actor_id',j.posted_by)
      AND issue.response @> jsonb_build_object('organization_id',p_org,'receipt_id',r.id,'collection_id',c.id,
        'source_ref','CC-'||c.collection_number::text,'receipt_number','CR-'||r.receipt_number::text,'intent_key',issue.intent_key,
        'journal_id',j.id,'journal_intent_key',j.intent_key,'customer_id',r.customer_id,'business_date',r.business_date,
        'currency',r.currency,'amount_minor',r.amount_minor::text,'source_revision',(r.revision-1)::text,'posted_revision',r.revision::text,
        'fingerprint',r.fingerprint,'posted_by',j.posted_by,'posted_at',j.posted_at,'evidence_method','dual_control_cash_attestation')
      AND issue.response->'allocations'=(SELECT jsonb_agg(jsonb_build_object('allocation_id',a.id,'invoice_id',a.invoice_id,
        'amount_minor',a.amount_minor::text,'journal_id',a.journal_id,'line_no',a.line_no) ORDER BY a.line_no)
        FROM public.aqvora_receipt_allocations a WHERE a.organization_id=p_org AND a.receipt_id=r.id)
  );
$$;
REVOKE ALL ON FUNCTION private.aqvora_receipt_audit_valid(uuid,text,uuid,bigint,text,uuid,jsonb),
  private.aqvora_cash_source_valid(uuid,uuid),private.aqvora_customer_receipt_source_valid(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.aqvora_certify_read(p_org uuid,p_from date,p_to date,p_currency text,p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  result:=private.aqvora_certify_journal_read(p_org,p_from,p_to,p_currency,p_token);
  IF EXISTS(SELECT 1 FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_org AND d.state='issued'
      AND d.business_date<=p_to AND NOT private.aqvora_sales_source_valid(p_org,d.id))
    OR EXISTS(SELECT 1 FROM public.aqvora_customer_receipts r WHERE r.organization_id=p_org AND r.business_date<=p_to
      AND r.state='posted' AND NOT private.aqvora_customer_receipt_source_valid(p_org,r.id))
    OR EXISTS(SELECT 1 FROM public.aqvora_journals j WHERE j.organization_id=p_org AND j.business_date<=p_to AND
      ((j.source_kind='sales_invoice' AND NOT EXISTS(SELECT 1 FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_org AND d.id=j.source_id AND d.state='issued' AND d.journal_id=j.id))
      OR (j.source_kind='customer_receipt' AND NOT EXISTS(SELECT 1 FROM public.aqvora_customer_receipts r WHERE r.organization_id=p_org AND r.id=j.source_id AND r.state='posted' AND r.journal_id=j.id))))
    OR EXISTS(SELECT 1 FROM public.aqvora_journals j JOIN public.aqvora_journal_lines l ON l.organization_id=p_org AND l.journal_id=j.id
      JOIN public.aqvora_accounts a ON a.organization_id=p_org AND a.id=l.account_id WHERE j.organization_id=p_org AND j.business_date<=p_to
        AND a.control_role='receivable' AND (j.source_kind IS NULL OR j.source_kind NOT IN ('sales_invoice','customer_receipt')))
    OR EXISTS(SELECT 1 FROM public.aqvora_receipt_allocations a JOIN public.aqvora_customer_receipts r
      ON r.organization_id=p_org AND r.id=a.receipt_id WHERE a.organization_id=p_org AND r.business_date<=p_to AND r.state<>'posted')
    OR EXISTS(SELECT 1 FROM public.aqvora_receipt_allocations a JOIN public.aqvora_sales_invoices d ON d.organization_id=p_org AND d.id=a.invoice_id
      WHERE a.organization_id=p_org GROUP BY d.id,d.face_minor HAVING sum(a.amount_minor)>d.face_minor) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='AQVORA source/receipt/allocation reconciliation is incomplete or inconsistent';
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_certify_read(uuid,date,date,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.aqvora_protect_pending_cash() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS(SELECT 1 FROM public.aqvora_cash_collections c
    WHERE c.organization_id=OLD.organization_id AND c.customer_id=OLD.id AND c.state IN ('draft','confirmed')
      AND NOT EXISTS(SELECT 1 FROM public.aqvora_customer_receipts r WHERE r.organization_id=OLD.organization_id AND r.collection_id=c.id AND r.state='posted')) THEN
    RAISE EXCEPTION 'Resolve pending cash collections before archiving this customer'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aqvora_protect_pending_cash BEFORE UPDATE OF is_active ON public.aqvora_customers
  FOR EACH ROW EXECUTE FUNCTION private.aqvora_protect_pending_cash();
REVOKE ALL ON FUNCTION private.aqvora_protect_pending_cash() FROM PUBLIC,anon,authenticated;
