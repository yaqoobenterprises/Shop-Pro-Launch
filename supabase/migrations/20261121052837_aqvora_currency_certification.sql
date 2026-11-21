-- Preserve the complete invoice/receipt/GL certifier behind currency certification.
CREATE FUNCTION private.aqvora_certify_currency_base(p_org uuid,p_from date,p_to date,p_currency text,p_token text)
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
REVOKE ALL ON FUNCTION private.aqvora_certify_currency_base(uuid,date,date,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.aqvora_certify_read(p_org uuid,p_from date,p_to date,p_currency text,p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET datestyle='ISO,YMD' AS $$
DECLARE result jsonb; policy jsonb; revisions jsonb; timeline text; token text; complete boolean;
BEGIN
  -- Every underlying reader and this wrapper share one statement MVCC snapshot.
  result := private.aqvora_certify_currency_base(p_org,p_from,p_to,p_currency,NULL);
  policy := private.aqvora_currency_at(p_org,p_to,p_currency);
  IF EXISTS(SELECT 1 FROM public.aqvora_journals j WHERE j.organization_id=p_org AND j.business_date<=p_to
    AND NOT private.aqvora_currency_matches(p_org,j.currency_policy_revision,j.business_date,j.currency,j.payload->'currency_policy'))
    OR (SELECT count(DISTINCT (currency,exponent)) FROM private.aqvora_currency_policies WHERE organization_id=p_org)>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='AQVORA journal currency policy is incomplete or inconsistent';
  END IF;
  SELECT coalesce(jsonb_agg(private.aqvora_currency_json(p) ORDER BY p.revision),'[]') INTO revisions
    FROM private.aqvora_currency_policies p WHERE p.organization_id=p_org AND p.effective_from<=p_to;
  timeline := encode(sha256(convert_to(revisions::text,'UTF8')),'hex');
  complete := policy IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.aqvora_journals
    WHERE organization_id=p_org AND business_date<=p_to AND currency_policy_revision IS NULL);
  token := encode(sha256(convert_to(jsonb_build_array('aqvora-currency-report-v1',
    result->>'snapshot_token',timeline,complete)::text,'UTF8')),'hex');
  IF p_token IS NOT NULL AND p_token IS DISTINCT FROM token THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='AQVORA currency or report source changed; restart pagination';
  END IF;
  RETURN result || jsonb_build_object('snapshot_token',token,'currency_policy',policy,
    'currency_policy_revisions',revisions,'currency_policy_timeline_fingerprint',timeline,
    'currency_evidence_version','aqvora-currency-report-v1','display_complete',complete,
    'currency_policy_status',CASE WHEN complete THEN 'configured' ELSE 'unconfigured' END);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_certify_read(uuid,date,date,text,text) FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION private.aqvora_invoice_allocation_state(p_org uuid,p_invoice uuid,p_asof date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.aqvora_sales_invoices;total numeric;dated numeric;control numeric;refs jsonb;fingerprint text;
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
  -- Independent GL dimension check also detects a missing receipt AND allocation
  -- while its AR journal survives. This stays indexed to the touched open item.
  SELECT coalesce(sum(l.debit_minor::numeric-l.credit_minor),0) INTO control FROM public.aqvora_journal_lines l
    WHERE l.organization_id=p_org AND l.open_item_id=p_invoice::text AND l.account_id=(d.policy_snapshot->>'ar_account_id')::uuid;
  IF control<>d.face_minor-total THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invoice allocation and AR control are inconsistent'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array('invoice-open-v1',p_org,d.id,d.revision::text,d.fingerprint,p_asof,refs)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('organization_id',p_org,'invoice_id',d.id,'customer_id',d.customer_id,'currency',d.currency,'currency_policy',private.aqvora_currency_bound(p_org,d.currency_policy_revision),
    'display_complete',d.currency_policy_revision IS NOT NULL,
    'business_date',d.business_date,'due_date',d.due_date,'as_of_date',p_asof,'face_minor',d.face_minor::text,
    'allocated_minor',dated::text,'outstanding_minor',(d.face_minor-dated)::text,'all_posted_allocated_minor',total::text,
    'status',CASE WHEN dated=0 THEN 'unpaid' WHEN dated=d.face_minor THEN 'settled' ELSE 'partial' END,
    'allocations',refs,'source_complete',true,'scope','v2_invoice_allocations','fingerprint',fingerprint,
    'legacy_included',false,'opening_migration_verified',false);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_invoice_allocation_state(uuid,uuid,date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.list_aqvora_open_invoices(p_organization_id uuid,p_customer_id uuid,p_currency text,p_as_of_date date,
  p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100,p_snapshot_token text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;result jsonb;
BEGIN
  source:=private.aqvora_certify_read(p_organization_id,date '0001-01-01',p_as_of_date,p_currency,p_snapshot_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_customer_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.aqvora_customers WHERE organization_id=p_organization_id AND id=p_customer_id) THEN
    RAISE EXCEPTION 'Invalid open-invoice customer or page'; END IF;
  IF p_after_id IS NOT NULL AND p_snapshot_token IS NULL THEN RAISE EXCEPTION 'Open invoice continuation requires its snapshot token'; END IF;
  IF p_after_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.aqvora_sales_invoices d
    WHERE d.organization_id=p_organization_id AND d.id=p_after_id AND d.customer_id=p_customer_id
      AND d.currency=p_currency AND d.state='issued' AND d.business_date<=p_as_of_date
      AND (private.aqvora_invoice_allocation_state(p_organization_id,d.id,p_as_of_date)->>'outstanding_minor')::numeric>0) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid open-invoice continuation cursor'; END IF;
  WITH balances AS MATERIALIZED(
    SELECT d.id,private.aqvora_invoice_allocation_state(p_organization_id,d.id,p_as_of_date) AS item
      FROM public.aqvora_sales_invoices d WHERE d.organization_id=p_organization_id AND d.customer_id=p_customer_id
        AND d.currency=p_currency AND d.state='issued' AND d.business_date<=p_as_of_date
  ), page AS(SELECT * FROM balances WHERE (item->>'outstanding_minor')::numeric>0 AND (p_after_id IS NULL OR id>p_after_id)
    ORDER BY id LIMIT p_limit)
  SELECT jsonb_build_object('source',source,'matched_count',(SELECT count(*)::text FROM balances WHERE (item->>'outstanding_minor')::numeric>0),
    'returned_count',(SELECT count(*) FROM page),'rows',coalesce((SELECT jsonb_agg(item ORDER BY id) FROM page),'[]'),
    'has_more',EXISTS(SELECT 1 FROM balances WHERE (item->>'outstanding_minor')::numeric>0 AND id>(SELECT id FROM page ORDER BY id DESC LIMIT 1)),
    'next_after_id',(SELECT id FROM page ORDER BY id DESC LIMIT 1)) INTO result;
  RETURN result;
END $$;
