CREATE FUNCTION public.create_aqvora_customer(p_organization_id uuid,p_code text,p_name text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; c public.aqvora_customers; response jsonb;
BEGIN
  actor := private.aqvora_sales_authorize(p_organization_id);
  -- Natural-key retries are safe only for the identical original customer/creator.
  INSERT INTO public.aqvora_customers(organization_id,code,name,created_by)
    VALUES (p_organization_id,p_code,btrim(p_name),actor)
    ON CONFLICT DO NOTHING RETURNING * INTO c;
  IF NOT FOUND THEN
    SELECT * INTO c FROM public.aqvora_customers WHERE organization_id=p_organization_id AND upper(code)=upper(p_code);
    IF NOT FOUND OR c.code IS DISTINCT FROM p_code OR c.name IS DISTINCT FROM btrim(p_name)
      OR c.created_by <> actor THEN RAISE EXCEPTION 'Customer code already identifies a different request'; END IF;
    RETURN to_jsonb(c) || jsonb_build_object('revision',c.revision::text);
  END IF;
  response := to_jsonb(c) || jsonb_build_object('revision',c.revision::text);
  PERFORM private.aqvora_sales_audit_event(p_organization_id,'customer',c.id,c.revision,'CREATE',actor,NULL,response);
  RETURN response;
END $$;
CREATE FUNCTION public.archive_aqvora_customer(p_organization_id uuid,p_customer_id uuid,p_expected_revision bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; c public.aqvora_customers; prior jsonb; response jsonb;
BEGIN
  actor := private.aqvora_sales_authorize(p_organization_id);
  PERFORM 1 FROM public.organization_members WHERE organization_id=p_organization_id AND user_id=actor AND role='OWNER' AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer archival requires OWNER'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Customer archival reason required'; END IF;
  SELECT * INTO c FROM public.aqvora_customers WHERE organization_id=p_organization_id AND id=p_customer_id FOR UPDATE;
  IF NOT FOUND OR NOT c.is_active OR c.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Customer missing, archived or stale'; END IF;
  prior := to_jsonb(c) || jsonb_build_object('revision',c.revision::text);
  UPDATE public.aqvora_customers SET is_active=false,revision=revision+1
    WHERE organization_id=p_organization_id AND id=p_customer_id RETURNING * INTO c;
  response := to_jsonb(c) || jsonb_build_object('revision',c.revision::text);
  PERFORM private.aqvora_sales_audit_event(p_organization_id,'customer',c.id,c.revision,'ARCHIVE',actor,prior,response,p_reason);
  RETURN response;
END $$;
CREATE FUNCTION public.list_aqvora_customers(p_organization_id uuid,p_after_code text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.aqvora_sales_read_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Customer page size must be 1-200'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('revision',c.revision::text) ORDER BY c.code COLLATE "C"),'[]')
    INTO result FROM (SELECT * FROM public.aqvora_customers WHERE organization_id=p_organization_id
      AND (p_after_code IS NULL OR code COLLATE "C">p_after_code COLLATE "C") ORDER BY code COLLATE "C" LIMIT p_limit) c;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_aqvora_customer(uuid,text,text),public.archive_aqvora_customer(uuid,uuid,bigint,text),
  public.list_aqvora_customers(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_customer(uuid,text,text),public.archive_aqvora_customer(uuid,uuid,bigint,text),
  public.list_aqvora_customers(uuid,text,integer) TO authenticated;
