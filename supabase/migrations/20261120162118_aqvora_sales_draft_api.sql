CREATE FUNCTION private.aqvora_save_sales_draft(
  p_org uuid,p_invoice uuid,p_revision bigint,p_intent text,p_customer uuid,
  p_date date,p_due date,p_currency text,p_lines jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE actor uuid; money jsonb; request jsonb; d public.aqvora_sales_invoices; prior jsonb;
BEGIN
  actor := private.aqvora_sales_authorize(p_org);
  money := private.aqvora_sales_lines(p_lines);
  PERFORM private.aqvora_sales_customer(p_org,p_customer,p_date,p_due,p_currency);
  IF p_invoice IS NULL THEN
    IF p_intent IS NULL OR length(p_intent) NOT BETWEEN 1 AND 100 OR p_intent <> btrim(p_intent) THEN
      RAISE EXCEPTION 'Sales draft creation intent required';
    END IF;
    request := jsonb_build_object('actor',actor,'customer_id',p_customer,'business_date',p_date,
      'due_date',p_due,'currency',p_currency,'money',money);
    INSERT INTO public.aqvora_sales_invoices
      (organization_id,creation_intent,creation_request,customer_id,business_date,due_date,currency,
       lines,gross_minor,discount_minor,face_minor,created_by)
      VALUES (p_org,p_intent,request,p_customer,p_date,p_due,p_currency,money->'lines',
        (money->>'gross_minor')::bigint,(money->>'discount_minor')::bigint,(money->>'face_minor')::bigint,actor)
      ON CONFLICT (organization_id,creation_intent) DO NOTHING RETURNING * INTO d;
    IF NOT FOUND THEN
      SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_org AND creation_intent=p_intent;
      IF d.creation_request IS DISTINCT FROM request THEN RAISE EXCEPTION 'Sales creation idempotency payload mismatch'; END IF;
      RETURN private.aqvora_sales_json(d);
    END IF;
  ELSE
    SELECT * INTO d FROM public.aqvora_sales_invoices WHERE organization_id=p_org AND id=p_invoice FOR UPDATE;
    IF NOT FOUND OR d.created_by <> actor OR d.state <> 'draft' OR d.revision IS DISTINCT FROM p_revision THEN
      RAISE EXCEPTION 'Sales draft is unavailable, not owned, immutable or stale';
    END IF;
    prior := private.aqvora_sales_json(d);
    UPDATE public.aqvora_sales_invoices SET customer_id=p_customer,business_date=p_date,due_date=p_due,
      currency=p_currency,lines=money->'lines',gross_minor=(money->>'gross_minor')::bigint,
      discount_minor=(money->>'discount_minor')::bigint,face_minor=(money->>'face_minor')::bigint,revision=revision+1
      WHERE organization_id=p_org AND id=p_invoice RETURNING * INTO d;
  END IF;
  PERFORM private.aqvora_sales_audit_event(p_org,'invoice',d.id,d.revision,
    CASE WHEN p_invoice IS NULL THEN 'CREATE' ELSE 'EDIT' END,actor,prior,private.aqvora_sales_json(d));
  RETURN private.aqvora_sales_json(d);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_save_sales_draft(uuid,uuid,bigint,text,uuid,date,date,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.create_aqvora_sales_draft(p_organization_id uuid,p_intent_key text,p_customer_id uuid,
  p_business_date date,p_due_date date,p_currency text,p_lines jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.aqvora_save_sales_draft(p_organization_id,NULL,NULL,p_intent_key,p_customer_id,p_business_date,p_due_date,p_currency,p_lines);
$$;
CREATE FUNCTION public.edit_aqvora_sales_draft(p_organization_id uuid,p_invoice_id uuid,p_expected_revision bigint,
  p_customer_id uuid,p_business_date date,p_due_date date,p_currency text,p_lines jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.aqvora_save_sales_draft(p_organization_id,p_invoice_id,p_expected_revision,NULL,p_customer_id,p_business_date,p_due_date,p_currency,p_lines);
$$;
REVOKE ALL ON FUNCTION public.create_aqvora_sales_draft(uuid,text,uuid,date,date,text,jsonb),
  public.edit_aqvora_sales_draft(uuid,uuid,bigint,uuid,date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_sales_draft(uuid,text,uuid,date,date,text,jsonb),
  public.edit_aqvora_sales_draft(uuid,uuid,bigint,uuid,date,date,text,jsonb) TO authenticated;
