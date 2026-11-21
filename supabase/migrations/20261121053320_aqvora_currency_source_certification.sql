-- Validate claimed evidence against immutable company-owned policy, including legacy absence.
CREATE FUNCTION private.aqvora_currency_matches(p_org uuid,p_revision bigint,p_date date,p_currency text,p_claim jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN p_revision IS NULL THEN p_claim IS NULL ELSE
    coalesce(p_claim=private.aqvora_currency_bound(p_org,p_revision)
      AND p_claim=private.aqvora_currency_at(p_org,p_date,p_currency),false) END;
$$;
REVOKE ALL ON FUNCTION private.aqvora_currency_matches(uuid,bigint,date,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.aqvora_sales_source_valid(p_org uuid,p_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aqvora_sales_invoices d
    JOIN public.aqvora_journals j ON j.organization_id=p_org AND j.id=d.journal_id
    JOIN public.aqvora_sales_issue_receipts r ON r.organization_id=p_org AND r.invoice_id=d.id AND r.journal_id=j.id
    JOIN public.aqvora_posting_receipts pr ON pr.organization_id=p_org AND pr.journal_id=j.id AND pr.intent_key=j.intent_key
    WHERE d.organization_id=p_org AND d.id=p_invoice AND d.state='issued'
      AND j.source_kind='sales_invoice' AND j.source_id=d.id AND j.source_revision=d.revision-1
      AND j.source_fingerprint=d.fingerprint AND d.fingerprint=private.aqvora_sales_fingerprint(d)
      AND j.business_date=d.business_date AND j.currency=d.currency AND j.total_minor=d.face_minor AND j.reversal_of IS NULL
      AND private.aqvora_currency_matches(p_org,d.currency_policy_revision,d.business_date,d.currency,d.policy_snapshot->'currency_policy')
      AND j.currency_policy_revision IS NOT DISTINCT FROM d.currency_policy_revision
      AND private.aqvora_currency_matches(p_org,j.currency_policy_revision,j.business_date,j.currency,j.payload->'currency_policy')
      AND private.aqvora_currency_matches(p_org,d.currency_policy_revision,d.business_date,d.currency,r.response->'currency_policy')
      AND d.policy_snapshot->>'tax_treatment'='verified_out_of_scope'
      AND d.policy_snapshot->>'currency'=d.currency AND d.customer_snapshot->>'id'=d.customer_id::text
      AND (private.aqvora_sales_lines((SELECT jsonb_agg(jsonb_build_object(
        'description',l->>'description','quantity_millionths',l->>'quantity_millionths',
        'unit_price_minor',l->>'unit_price_minor','discount_minor',l->>'discount_minor') ORDER BY ord)
        FROM jsonb_array_elements(d.lines) WITH ORDINALITY AS x(l,ord)))) =
        jsonb_build_object('lines',d.lines,'gross_minor',d.gross_minor::text,'discount_minor',d.discount_minor::text,'face_minor',d.face_minor::text)
      AND j.payload @> jsonb_build_object('sales_invoice_id',d.id,'source_revision',(d.revision-1)::text,'source_fingerprint',d.fingerprint)
      AND pr.payload=j.payload
      AND j.payload @> jsonb_build_object('business_date',d.business_date,'currency',d.currency,'reversal_of',NULL,'reason',NULL)
      AND j.payload->'lines'=jsonb_build_array(
        jsonb_build_object('account_id',d.policy_snapshot->>'ar_account_id','debit_minor',d.face_minor::text,'credit_minor','0',
          'party_id',d.customer_id::text,'open_item_id',d.id::text,'stock_movement_id',NULL),
        jsonb_build_object('account_id',d.policy_snapshot->>'revenue_account_id','debit_minor','0','credit_minor',d.face_minor::text,
          'party_id',NULL,'open_item_id',NULL,'stock_movement_id',NULL))
      AND EXISTS (SELECT 1 FROM public.aqvora_periods p WHERE p.organization_id=p_org AND p.id=j.period_id
        AND d.business_date BETWEEN p.starts_on AND p.ends_on)
      AND r.request=jsonb_build_object('invoice_id',d.id,'expected_revision',(d.revision-1)::text,
        'fingerprint',d.fingerprint,'actor_id',j.posted_by)
      AND r.response @> jsonb_build_object('organization_id',p_org,'invoice_id',d.id,'journal_id',j.id,
        'journal_intent_key',j.intent_key,'customer_id',d.customer_id,'business_date',d.business_date,'currency',d.currency,
        'face_minor',d.face_minor::text,'source_revision',(d.revision-1)::text,'issued_revision',d.revision::text,
        'document_number','SI-' || d.document_number::text,'fingerprint',d.fingerprint,'intent_key',r.intent_key,
        'posted_by',j.posted_by,'posted_at',j.posted_at)
      AND (SELECT count(*) FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id)=2
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id AND l.line_no=1
        AND l.account_id=(d.policy_snapshot->>'ar_account_id')::uuid AND l.debit_minor=d.face_minor AND l.credit_minor=0
        AND l.party_id=d.customer_id::text AND l.open_item_id=d.id::text AND l.stock_movement_id IS NULL)
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_lines l WHERE l.organization_id=p_org AND l.journal_id=j.id AND l.line_no=2
        AND l.account_id=(d.policy_snapshot->>'revenue_account_id')::uuid AND l.debit_minor=0 AND l.credit_minor=d.face_minor
        AND l.party_id IS NULL AND l.open_item_id IS NULL AND l.stock_movement_id IS NULL)
      AND (SELECT count(*) FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id)=1
      AND EXISTS (SELECT 1 FROM public.aqvora_journal_audit a WHERE a.organization_id=p_org AND a.journal_id=j.id
        AND a.action='POST' AND a.actor_id=j.posted_by AND a.details=jsonb_build_object('reversal_of',NULL,'reason',NULL))
      AND (SELECT count(*)=d.revision AND min(revision)=1 AND max(revision)=d.revision
        AND bool_and(coalesce(after_row->>'revision'=revision::text AND after_row->>'id'=d.id::text
          AND ((revision=1 AND action='CREATE' AND before_row IS NULL) OR
               (revision>1 AND before_row=previous_row)),false))
        FROM (SELECT a.*,lag(after_row) OVER (ORDER BY revision) AS previous_row FROM public.aqvora_sales_audit a
          WHERE a.organization_id=p_org AND a.entity_type='invoice' AND a.entity_id=d.id) history)
      AND EXISTS (SELECT 1 FROM public.aqvora_sales_audit a WHERE a.organization_id=p_org AND a.entity_type='invoice'
        AND a.entity_id=d.id AND a.revision=d.revision AND a.action='ISSUE' AND a.actor_id=j.posted_by
        AND a.after_row=private.aqvora_sales_json(d))
      AND EXISTS (SELECT 1 FROM public.aqvora_sales_audit a WHERE a.organization_id=p_org AND a.entity_type='invoice'
        AND a.entity_id=d.id AND a.revision=d.revision-1 AND a.action='APPROVE' AND a.actor_id=d.approved_by
        AND a.after_row->>'fingerprint'=d.fingerprint)
  );
$$;
REVOKE ALL ON FUNCTION private.aqvora_sales_source_valid(uuid,uuid) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION private.aqvora_cash_source_valid(p_org uuid,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
  SELECT EXISTS(SELECT 1 FROM public.aqvora_cash_collections c WHERE c.organization_id=p_org AND c.id=p_id AND c.state='confirmed'
    AND c.revision=2 AND c.confirmed_by<>c.created_by AND c.confirmed_at>=c.created_at
    AND private.aqvora_currency_matches(p_org,c.currency_policy_revision,c.business_date,c.currency,c.policy_snapshot->'currency_policy')
    AND c.fingerprint=private.aqvora_cash_fingerprint(c) AND c.policy_snapshot->>'source_kind'='controlled_cash'
    AND c.policy_snapshot->>'currency'=c.currency AND c.customer_snapshot->>'id'=c.customer_id::text
    AND private.aqvora_receipt_audit_valid(p_org,'collection',c.id,c.revision,'CONFIRM',c.confirmed_by,private.aqvora_cash_json(c))
    AND EXISTS(SELECT 1 FROM public.aqvora_receipt_audit a WHERE a.organization_id=p_org AND a.entity_type='collection'
      AND a.entity_id=c.id AND a.revision=1 AND a.actor_id=c.created_by
      AND a.after_row @> jsonb_build_object('customer_id',c.customer_id,'business_date',c.business_date,
        'currency',c.currency,'amount_minor',c.amount_minor::text,'collection_number','CC-'||c.collection_number::text)));
$$;
CREATE OR REPLACE FUNCTION private.aqvora_customer_receipt_source_valid(p_org uuid,p_id uuid) RETURNS boolean
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
      AND r.currency_policy_revision IS NOT DISTINCT FROM c.currency_policy_revision
      AND j.currency_policy_revision IS NOT DISTINCT FROM r.currency_policy_revision
      AND private.aqvora_currency_matches(p_org,r.currency_policy_revision,r.business_date,r.currency,r.policy_snapshot->'currency_policy')
      AND private.aqvora_currency_matches(p_org,j.currency_policy_revision,j.business_date,j.currency,j.payload->'currency_policy')
      AND private.aqvora_currency_matches(p_org,r.currency_policy_revision,r.business_date,r.currency,issue.response->'currency_policy')
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
      AND j.payload=(jsonb_build_object('business_date',r.business_date,'currency',r.currency,
        'lines',private.aqvora_receipt_journal_lines(r),'reversal_of',NULL,'reason',NULL,
        'customer_receipt_id',r.id,'collection_id',r.collection_id,'source_revision',(r.revision-1)::text,'source_fingerprint',r.fingerprint) || CASE WHEN r.currency_policy_revision IS NULL THEN '{}'::jsonb ELSE
        jsonb_build_object('currency_policy',private.aqvora_currency_bound(p_org,r.currency_policy_revision)) END)
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
