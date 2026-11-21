-- Bind currency meaning into existing source snapshots, fingerprints and audit.
CREATE OR REPLACE FUNCTION private.aqvora_sales_json(p public.aqvora_sales_invoices) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT (to_jsonb(p)-ARRAY['creation_request','currency_policy_revision']) || jsonb_build_object('revision',p.revision::text,
    'gross_minor',p.gross_minor::text,'discount_minor',p.discount_minor::text,'face_minor',p.face_minor::text,
    'document_number',CASE WHEN p.document_number IS NULL THEN NULL ELSE 'SI-' || p.document_number::text END) || CASE WHEN p.currency_policy_revision IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
    'currency_policy',private.aqvora_currency_bound(p.organization_id,p.currency_policy_revision)) END;
$$;

CREATE OR REPLACE FUNCTION private.aqvora_cash_json(c public.aqvora_cash_collections) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT (to_jsonb(c)-ARRAY['creation_request','currency_policy_revision'])||jsonb_build_object('revision',c.revision::text,'amount_minor',c.amount_minor::text,
    'collection_number','CC-'||c.collection_number::text,'source_kind','controlled_cash',
    'evidence_method',CASE WHEN c.state='confirmed' THEN 'dual_control_cash_attestation' ELSE 'unconfirmed_claim' END) || CASE WHEN c.currency_policy_revision IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
    'currency_policy',private.aqvora_currency_bound(c.organization_id,c.currency_policy_revision)) END;
$$;

CREATE OR REPLACE FUNCTION private.aqvora_customer_receipt_json(r public.aqvora_customer_receipts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT (to_jsonb(r)-ARRAY['creation_request','currency_policy_revision'])||jsonb_build_object('revision',r.revision::text,'amount_minor',r.amount_minor::text,
    'receipt_number',CASE WHEN r.receipt_number IS NULL THEN NULL ELSE 'CR-'||r.receipt_number::text END) || CASE WHEN r.currency_policy_revision IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
    'currency_policy',private.aqvora_currency_bound(r.organization_id,r.currency_policy_revision)) END;
$$;

CREATE OR REPLACE FUNCTION private.aqvora_sales_fingerprint(p public.aqvora_sales_invoices) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
  SELECT encode(sha256(convert_to((jsonb_build_array(p.organization_id,p.id,p.created_by,p.customer_id,
    p.business_date,p.due_date,p.currency,p.lines,p.gross_minor::text,p.discount_minor::text,p.face_minor::text,
    p.customer_snapshot,p.policy_snapshot) || CASE WHEN p.currency_policy_revision IS NULL THEN '[]'::jsonb ELSE
    jsonb_build_array(private.aqvora_currency_bound(p.organization_id,p.currency_policy_revision)) END)::text,'UTF8')),'hex');
$$;

CREATE OR REPLACE FUNCTION private.aqvora_cash_fingerprint(c public.aqvora_cash_collections) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT encode(sha256(convert_to((jsonb_build_array('controlled-cash-v1',c.organization_id,c.id,c.collection_number::text,
    c.customer_id,c.business_date,c.currency,c.amount_minor::text,c.created_by,c.confirmed_by,c.maker_session_fingerprint,
    c.checker_session_fingerprint,c.confirmed_at,c.customer_snapshot,c.policy_snapshot) || CASE WHEN c.currency_policy_revision IS NULL THEN '[]'::jsonb ELSE
    jsonb_build_array(private.aqvora_currency_bound(c.organization_id,c.currency_policy_revision)) END)::text,'UTF8')),'hex');
$$;

CREATE OR REPLACE FUNCTION private.aqvora_receipt_fingerprint(r public.aqvora_customer_receipts) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to((jsonb_build_array('customer-receipt-v1',r.organization_id,r.id,r.collection_id,
    r.collection_fingerprint,r.customer_id,r.business_date,r.currency,r.amount_minor::text,r.created_by,
    r.allocations,r.policy_snapshot) || CASE WHEN r.currency_policy_revision IS NULL THEN '[]'::jsonb ELSE
    jsonb_build_array(private.aqvora_currency_bound(r.organization_id,r.currency_policy_revision)) END)::text,'UTF8')),'hex');
$$;

CREATE OR REPLACE FUNCTION private.aqvora_sales_context(p public.aqvora_sales_invoices) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE policy private.aqvora_sales_policies; customer jsonb;
BEGIN
  customer := private.aqvora_sales_customer(p.organization_id,p.customer_id,p.business_date,p.due_date,p.currency);
  SELECT * INTO policy FROM private.aqvora_sales_policies
    WHERE organization_id=p.organization_id AND is_active FOR SHARE;
  IF NOT FOUND OR policy.currency <> p.currency OR p.business_date NOT BETWEEN policy.starts_on AND policy.ends_on THEN
    RAISE EXCEPTION 'Verified jurisdiction tax policy is unknown or unavailable';
  END IF;
  PERFORM 1 FROM public.aqvora_periods WHERE organization_id=p.organization_id
    AND p.business_date BETWEEN starts_on AND ends_on AND state='open' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales fiscal period is missing or closed'; END IF;
  PERFORM 1 FROM public.aqvora_accounts WHERE organization_id=p.organization_id AND id=policy.ar_account_id
    AND is_posting AND is_active AND account_class='asset' AND normal_side='debit' AND control_role='receivable' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trusted sales AR mapping is unavailable'; END IF;
  PERFORM 1 FROM public.aqvora_accounts WHERE organization_id=p.organization_id AND id=policy.revenue_account_id
    AND is_posting AND is_active AND account_class='revenue' AND normal_side='credit' AND control_role IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trusted sales revenue mapping is unavailable'; END IF;
  IF private.aqvora_currency_at(p.organization_id,p.business_date,p.currency) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved currency unit policy is unconfigured'; END IF;
  RETURN jsonb_build_object('customer',customer,'policy',to_jsonb(policy) || jsonb_build_object('revision',policy.revision::text,
    'currency_policy',private.aqvora_currency_at(p.organization_id,p.business_date,p.currency)));
END $$;

CREATE OR REPLACE FUNCTION private.aqvora_receipt_context(p_org uuid,p_customer uuid,p_date date,p_currency text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE customer jsonb; policy private.aqvora_receipt_policies; today date;
BEGIN
  customer:=private.aqvora_sales_customer(p_org,p_customer,p_date,p_date,p_currency);
  SELECT (statement_timestamp() AT TIME ZONE coalesce(nullif(timezone,''),'UTC'))::date INTO today
    FROM public.organizations WHERE id=p_org;
  IF p_date>today THEN RAISE EXCEPTION 'Actual cash collection cannot be future dated'; END IF;
  SELECT * INTO policy FROM private.aqvora_receipt_policies WHERE organization_id=p_org AND is_active FOR SHARE;
  IF NOT FOUND OR policy.currency<>p_currency OR p_date NOT BETWEEN policy.starts_on AND policy.ends_on THEN
    RAISE EXCEPTION 'Verified controlled-cash policy is unavailable; bank deposits are unsupported'; END IF;
  PERFORM 1 FROM public.aqvora_periods WHERE organization_id=p_org AND p_date BETWEEN starts_on AND ends_on AND state='open' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt fiscal period is missing or closed'; END IF;
  PERFORM 1 FROM public.aqvora_accounts WHERE organization_id=p_org AND id=policy.cash_account_id
    AND is_posting AND is_active AND account_class='asset' AND normal_side='debit' AND control_role='cash' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trusted cash mapping is unavailable'; END IF;
  PERFORM 1 FROM public.aqvora_accounts WHERE organization_id=p_org AND id=policy.ar_account_id
    AND is_posting AND is_active AND account_class='asset' AND normal_side='debit' AND control_role='receivable' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trusted receipt AR mapping is unavailable'; END IF;
  IF private.aqvora_currency_at(p_org,p_date,p_currency) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved currency unit policy is unconfigured'; END IF;
  RETURN jsonb_build_object('customer',customer,'policy',to_jsonb(policy)||jsonb_build_object('revision',policy.revision::text,
    'currency_policy',private.aqvora_currency_at(p_org,p_date,p_currency)));
END $$;
