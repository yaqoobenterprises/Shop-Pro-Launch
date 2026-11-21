CREATE FUNCTION private.aqvora_sales_authorize(p_org uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;
BEGIN
  actor := private.aqvora_authorize(p_org);
  PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company is unavailable'; END IF;
  RETURN actor;
END $$;

CREATE FUNCTION private.aqvora_sales_read_authorize(p_org uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF private.aqvora_can_read(p_org) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sales read requires authorized company membership and live MFA session';
  END IF;
END $$;
CREATE FUNCTION private.aqvora_sales_lines(p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; normalized jsonb := '[]'; qty numeric; price numeric; discount numeric;
  gross numeric; gross_total numeric := 0; discount_total numeric := 0; n integer := 0;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Sales invoice requires 1-100 service lines';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    n := n+1;
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
      (item - ARRAY['description','quantity_millionths','unit_price_minor','discount_minor']) <> '{}'::jsonb OR
      jsonb_typeof(item->'description') IS DISTINCT FROM 'string' OR
      length(btrim(item->>'description')) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'Invalid service line; tax, inventory and unknown fields are unsupported';
    END IF;
    IF jsonb_typeof(item->'quantity_millionths') IS DISTINCT FROM 'string' OR
      jsonb_typeof(item->'unit_price_minor') IS DISTINCT FROM 'string' OR
      jsonb_typeof(item->'discount_minor') IS DISTINCT FROM 'string' OR
      (item->>'quantity_millionths') !~ '^[1-9][0-9]{0,18}$' OR
      (item->>'unit_price_minor') !~ '^[1-9][0-9]{0,18}$' OR
      (item->>'discount_minor') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION 'Sales quantities and money require canonical integer strings';
    END IF;
    qty := (item->>'quantity_millionths')::numeric; price := (item->>'unit_price_minor')::numeric;
    discount := (item->>'discount_minor')::numeric;
    -- div() is exact integer division. Numeric '/' may round its quotient at
    -- large magnitudes before floor(), incorrectly adding a minor unit.
    gross := div(qty*price+500000,1000000);
    IF qty > 9223372036854775807 OR price > 9223372036854775807 OR
      gross NOT BETWEEN 1 AND 9223372036854775807 OR discount > gross THEN
      RAISE EXCEPTION 'Sales amount exceeds limit or discount exceeds gross';
    END IF;
    gross_total := gross_total+gross; discount_total := discount_total+discount;
    normalized := normalized || jsonb_build_array(jsonb_build_object('line_no',n,
      'description',btrim(item->>'description'),'quantity_millionths',qty::text,
      'unit_price_minor',price::text,'gross_minor',gross::text,'discount_minor',discount::text,
      'net_minor',(gross-discount)::text));
  END LOOP;
  IF gross_total > 9223372036854775807 OR gross_total-discount_total <= 0 THEN
    RAISE EXCEPTION 'Sales invoice total is zero or exceeds limit';
  END IF;
  RETURN jsonb_build_object('lines',normalized,'gross_minor',gross_total::text,
    'discount_minor',discount_total::text,'face_minor',(gross_total-discount_total)::text);
END $$;

CREATE FUNCTION private.aqvora_sales_json(p public.aqvora_sales_invoices) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
  SELECT (to_jsonb(p)-'creation_request') || jsonb_build_object('revision',p.revision::text,
    'gross_minor',p.gross_minor::text,'discount_minor',p.discount_minor::text,'face_minor',p.face_minor::text,
    'document_number',CASE WHEN p.document_number IS NULL THEN NULL ELSE 'SI-' || p.document_number::text END);
$$;
CREATE FUNCTION private.aqvora_sales_fingerprint(p public.aqvora_sales_invoices) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' SET datestyle='ISO,YMD' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(p.organization_id,p.id,p.created_by,p.customer_id,
    p.business_date,p.due_date,p.currency,p.lines,p.gross_minor::text,p.discount_minor::text,p.face_minor::text,
    p.customer_snapshot,p.policy_snapshot)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION private.aqvora_sales_audit_event(
  p_org uuid,p_type text,p_id uuid,p_revision bigint,p_action text,p_actor uuid,
  p_before jsonb,p_after jsonb,p_reason text DEFAULT NULL
) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO public.aqvora_sales_audit
    (organization_id,entity_type,entity_id,revision,action,actor_id,before_row,after_row,reason)
    VALUES (p_org,p_type,p_id,p_revision,p_action,p_actor,p_before,p_after,p_reason);
$$;

CREATE FUNCTION private.aqvora_sales_customer(p_org uuid,p_customer uuid,p_date date,p_due date,p_currency text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.aqvora_customers; current_currency text;
BEGIN
  IF p_date IS NULL OR p_due IS NULL OR p_date NOT BETWEEN date '0001-01-01' AND date '9999-12-31'
    OR p_due NOT BETWEEN p_date AND date '9999-12-31' THEN RAISE EXCEPTION 'Invalid sales dates'; END IF;
  SELECT currency INTO current_currency FROM public.organizations WHERE id=p_org;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_currency IS DISTINCT FROM current_currency THEN
    RAISE EXCEPTION 'Invalid sales currency';
  END IF;
  SELECT * INTO c FROM public.aqvora_customers WHERE organization_id=p_org AND id=p_customer AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales customer is unavailable in this company'; END IF;
  RETURN to_jsonb(c) || jsonb_build_object('revision',c.revision::text);
END $$;
CREATE FUNCTION private.aqvora_sales_context(p public.aqvora_sales_invoices) RETURNS jsonb
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
  RETURN jsonb_build_object('customer',customer,'policy',to_jsonb(policy) || jsonb_build_object('revision',policy.revision::text));
END $$;
REVOKE ALL ON FUNCTION private.aqvora_sales_authorize(uuid),private.aqvora_sales_lines(jsonb),
  private.aqvora_sales_read_authorize(uuid),
  private.aqvora_sales_json(public.aqvora_sales_invoices),private.aqvora_sales_fingerprint(public.aqvora_sales_invoices),
  private.aqvora_sales_audit_event(uuid,text,uuid,bigint,text,uuid,jsonb,jsonb,text),
  private.aqvora_sales_customer(uuid,uuid,date,date,text),private.aqvora_sales_context(public.aqvora_sales_invoices)
  FROM PUBLIC,anon,authenticated;
