CREATE FUNCTION public.get_aqvora_cash_collection(p_organization_id uuid,p_collection_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.aqvora_cash_collections;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO c FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND id=p_collection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash collection is unavailable in this company'; END IF;
  IF c.state='confirmed' AND NOT private.aqvora_cash_source_valid(p_organization_id,c.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Cash source is inconsistent'; END IF;
  RETURN private.aqvora_cash_json(c)||jsonb_build_object('posted_receipt_id',(SELECT r.id FROM public.aqvora_customer_receipts r
    WHERE r.organization_id=p_organization_id AND r.collection_id=c.id AND r.state='posted'));
END $$;
CREATE FUNCTION public.get_aqvora_customer_receipt(p_organization_id uuid,p_receipt_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.aqvora_customer_receipts;result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO r FROM public.aqvora_customer_receipts WHERE organization_id=p_organization_id AND id=p_receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer receipt is unavailable in this company'; END IF;
  result:=private.aqvora_customer_receipt_json(r);
  IF r.state='posted' THEN
    IF NOT private.aqvora_customer_receipt_source_valid(p_organization_id,r.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Customer receipt source is incomplete or inconsistent'; END IF;
    result:=result||jsonb_build_object('issue_receipt',(SELECT response FROM public.aqvora_receipt_issues WHERE organization_id=p_organization_id AND receipt_id=r.id),
      'reconciliation',jsonb_build_object('source_complete',true,'cash_debit_minor',r.amount_minor::text,'ar_credit_minor',r.amount_minor::text,
        'allocated_minor',r.amount_minor::text,'bank_verified',false,'evidence_method','dual_control_cash_attestation'));
  END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.lookup_aqvora_customer_receipt_issue(p_organization_id uuid,p_intent_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.aqvora_receipt_issues;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO r FROM public.aqvora_receipt_issues WHERE organization_id=p_organization_id AND intent_key=p_intent_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.get_aqvora_customer_receipt(p_organization_id,r.receipt_id);
  RETURN r.response;
END $$;
CREATE FUNCTION public.list_aqvora_customer_receipts(p_organization_id uuid,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Receipt page size must be 1-200'; END IF;
  SELECT coalesce(jsonb_agg(public.get_aqvora_customer_receipt(p_organization_id,r.id) ORDER BY r.id),'[]') INTO result
    FROM(SELECT id FROM public.aqvora_customer_receipts WHERE organization_id=p_organization_id AND (p_after_id IS NULL OR id>p_after_id) ORDER BY id LIMIT p_limit) r;
  RETURN result;
END $$;
CREATE FUNCTION public.list_aqvora_cash_collections(p_organization_id uuid,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Cash page size must be 1-200'; END IF;
  SELECT coalesce(jsonb_agg(public.get_aqvora_cash_collection(p_organization_id,c.id) ORDER BY c.id),'[]') INTO result
    FROM(SELECT id FROM public.aqvora_cash_collections WHERE organization_id=p_organization_id AND (p_after_id IS NULL OR id>p_after_id) ORDER BY id LIMIT p_limit)c;
  RETURN result;
END $$;
CREATE FUNCTION public.list_aqvora_receipt_audit(p_organization_id uuid,p_entity_type text,p_entity_id uuid,
  p_after_id bigint DEFAULT 0,p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE result jsonb;
BEGIN
  IF p_entity_type='collection' THEN PERFORM public.get_aqvora_cash_collection(p_organization_id,p_entity_id);
  ELSIF p_entity_type='receipt' THEN PERFORM public.get_aqvora_customer_receipt(p_organization_id,p_entity_id);
  ELSE RAISE EXCEPTION 'Invalid receipt audit entity'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR p_after_id IS NULL OR p_after_id<0 THEN RAISE EXCEPTION 'Invalid receipt audit page'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('id',a.id::text,'revision',a.revision::text) ORDER BY a.id),'[]') INTO result
    FROM(SELECT * FROM public.aqvora_receipt_audit WHERE organization_id=p_organization_id AND entity_type=p_entity_type
      AND entity_id=p_entity_id AND id>p_after_id ORDER BY id LIMIT p_limit)a;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.get_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.aqvora_sales_invoices;result jsonb;balance jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_organization_id AND id=p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales invoice is unavailable in this company'; END IF;
  result:=private.aqvora_sales_json(d);
  IF d.state='issued' THEN
    balance:=private.aqvora_invoice_allocation_state(p_organization_id,p_invoice_id,NULL);
    result:=result||jsonb_build_object('issue_receipt',(SELECT response FROM public.aqvora_sales_issue_receipts WHERE organization_id=p_organization_id AND invoice_id=d.id),
      'reconciliation',jsonb_build_object('source_complete',true,'face_minor',d.face_minor::text,'ar_debit_minor',d.face_minor::text,
        'revenue_credit_minor',d.face_minor::text,'allocated_minor',balance->>'allocated_minor','outstanding_minor',balance->>'outstanding_minor',
        'settlements_supported',true,'basis','v2_posted_receipt_allocations'));
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_aqvora_cash_collection(uuid,uuid),public.get_aqvora_customer_receipt(uuid,uuid),
  public.lookup_aqvora_customer_receipt_issue(uuid,text),public.list_aqvora_customer_receipts(uuid,uuid,integer),
  public.list_aqvora_cash_collections(uuid,uuid,integer),public.list_aqvora_receipt_audit(uuid,text,uuid,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_aqvora_cash_collection(uuid,uuid),public.get_aqvora_customer_receipt(uuid,uuid),
  public.lookup_aqvora_customer_receipt_issue(uuid,text),public.list_aqvora_customer_receipts(uuid,uuid,integer),
  public.list_aqvora_cash_collections(uuid,uuid,integer),public.list_aqvora_receipt_audit(uuid,text,uuid,bigint,integer) TO authenticated;
