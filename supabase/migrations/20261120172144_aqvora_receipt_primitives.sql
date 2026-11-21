CREATE FUNCTION private.aqvora_receipt_minor(p jsonb) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'string' OR p#>>'{}' !~ '^[1-9][0-9]{0,18}$'
    OR (p#>>'{}')::numeric>9223372036854775807 THEN
    RAISE EXCEPTION 'Receipt money requires a positive canonical BIGINT minor-unit string'; END IF;
  RETURN (p#>>'{}')::bigint;
END $$;
CREATE FUNCTION private.aqvora_receipt_next(p_org uuid,p_kind text) RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO private.aqvora_receipt_numbers(organization_id,kind,last_number) VALUES(p_org,p_kind,1)
  ON CONFLICT(organization_id,kind) DO UPDATE SET last_number=private.aqvora_receipt_numbers.last_number+1 RETURNING last_number;
$$;
CREATE FUNCTION private.aqvora_receipt_context(p_org uuid,p_customer uuid,p_date date,p_currency text) RETURNS jsonb
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
  RETURN jsonb_build_object('customer',customer,'policy',to_jsonb(policy)||jsonb_build_object('revision',policy.revision::text));
END $$;
CREATE FUNCTION private.aqvora_cash_json(c public.aqvora_cash_collections) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT (to_jsonb(c)-'creation_request')||jsonb_build_object('revision',c.revision::text,'amount_minor',c.amount_minor::text,
    'collection_number','CC-'||c.collection_number::text,'source_kind','controlled_cash',
    'evidence_method',CASE WHEN c.state='confirmed' THEN 'dual_control_cash_attestation' ELSE 'unconfirmed_claim' END);
$$;
CREATE FUNCTION private.aqvora_cash_fingerprint(c public.aqvora_cash_collections) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array('controlled-cash-v1',c.organization_id,c.id,c.collection_number::text,
    c.customer_id,c.business_date,c.currency,c.amount_minor::text,c.created_by,c.confirmed_by,c.maker_session_fingerprint,
    c.checker_session_fingerprint,c.confirmed_at,c.customer_snapshot,c.policy_snapshot)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION private.aqvora_customer_receipt_json(r public.aqvora_customer_receipts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT (to_jsonb(r)-'creation_request')||jsonb_build_object('revision',r.revision::text,'amount_minor',r.amount_minor::text,
    'receipt_number',CASE WHEN r.receipt_number IS NULL THEN NULL ELSE 'CR-'||r.receipt_number::text END);
$$;
CREATE FUNCTION private.aqvora_receipt_fingerprint(r public.aqvora_customer_receipts) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array('customer-receipt-v1',r.organization_id,r.id,r.collection_id,
    r.collection_fingerprint,r.customer_id,r.business_date,r.currency,r.amount_minor::text,r.created_by,
    r.allocations,r.policy_snapshot)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION private.aqvora_receipt_event(p_org uuid,p_type text,p_id uuid,p_rev bigint,p_action text,p_actor uuid,
  p_before jsonb,p_after jsonb,p_reason text DEFAULT NULL) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO public.aqvora_receipt_audit(organization_id,entity_type,entity_id,revision,action,actor_id,before_row,after_row,reason)
    VALUES(p_org,p_type,p_id,p_rev,p_action,p_actor,p_before,p_after,p_reason);
$$;
CREATE FUNCTION private.aqvora_receipt_journal_lines(r public.aqvora_customer_receipts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_array(jsonb_build_object('account_id',r.policy_snapshot->>'cash_account_id',
    'debit_minor',r.amount_minor::text,'credit_minor','0','party_id',r.customer_id::text,'open_item_id',NULL,'stock_movement_id',NULL))
    || (SELECT jsonb_agg(jsonb_build_object('account_id',r.policy_snapshot->>'ar_account_id',
      'debit_minor','0','credit_minor',a->>'amount_minor','party_id',r.customer_id::text,
      'open_item_id',a->>'invoice_id','stock_movement_id',NULL) ORDER BY ord)
      FROM jsonb_array_elements(r.allocations) WITH ORDINALITY x(a,ord));
$$;
CREATE FUNCTION private.aqvora_receipt_normalize(p_org uuid,p_customer uuid,p_currency text,p_date date,p_ar uuid,p_allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; invoice public.aqvora_sales_invoices; amount bigint; result jsonb:='[]'; seen uuid[]:='{}';
BEGIN
  IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 99 THEN
    RAISE EXCEPTION 'Receipt requires 1-99 distinct invoice allocations'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item-ARRAY['invoice_id','amount_minor'])<>'{}'::jsonb
      OR jsonb_typeof(item->'invoice_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid receipt allocation'; END IF;
    amount:=private.aqvora_receipt_minor(item->'amount_minor');
    SELECT * INTO invoice FROM public.aqvora_sales_invoices WHERE organization_id=p_org AND id=(item->>'invoice_id')::uuid;
    IF NOT FOUND OR invoice.state<>'issued' OR invoice.customer_id<>p_customer OR invoice.currency<>p_currency
      OR invoice.business_date>p_date OR (invoice.policy_snapshot->>'ar_account_id')::uuid<>p_ar
      OR NOT private.aqvora_sales_source_valid(p_org,invoice.id) THEN
      RAISE EXCEPTION 'Allocation invoice is unverified, unissued, foreign, mismatched or later than the receipt'; END IF;
    IF invoice.id=ANY(seen) THEN RAISE EXCEPTION 'Duplicate invoice allocation'; END IF;
    seen:=array_append(seen,invoice.id);
    result:=result||jsonb_build_array(jsonb_build_object('invoice_id',invoice.id,'amount_minor',amount::text,
      'invoice_revision',invoice.revision::text,'invoice_fingerprint',invoice.fingerprint));
  END LOOP;
  RETURN (SELECT jsonb_agg(a ORDER BY a->>'invoice_id') FROM jsonb_array_elements(result) x(a));
END $$;
CREATE FUNCTION private.aqvora_receipt_raw_allocations(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_agg(jsonb_build_object('invoice_id',a->>'invoice_id','amount_minor',a->>'amount_minor') ORDER BY a->>'invoice_id')
    FROM jsonb_array_elements(p) x(a);
$$;
REVOKE ALL ON FUNCTION private.aqvora_receipt_minor(jsonb),private.aqvora_receipt_next(uuid,text),
  private.aqvora_receipt_context(uuid,uuid,date,text),private.aqvora_cash_json(public.aqvora_cash_collections),
  private.aqvora_cash_fingerprint(public.aqvora_cash_collections),private.aqvora_customer_receipt_json(public.aqvora_customer_receipts),
  private.aqvora_receipt_fingerprint(public.aqvora_customer_receipts),
  private.aqvora_receipt_event(uuid,text,uuid,bigint,text,uuid,jsonb,jsonb,text),
  private.aqvora_receipt_journal_lines(public.aqvora_customer_receipts),private.aqvora_receipt_normalize(uuid,uuid,text,date,uuid,jsonb),
  private.aqvora_receipt_raw_allocations(jsonb) FROM PUBLIC,anon,authenticated;
