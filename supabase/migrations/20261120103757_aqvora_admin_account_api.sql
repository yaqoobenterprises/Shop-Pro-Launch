CREATE FUNCTION public.create_aqvora_account(
  p_organization_id uuid, p_code text, p_name text, p_account_class text,
  p_normal_side text, p_parent_id uuid, p_is_posting boolean
) RETURNS public.aqvora_accounts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; created public.aqvora_accounts;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  INSERT INTO public.aqvora_accounts
    (organization_id, code, name, account_class, normal_side, parent_id, is_posting)
  VALUES (p_organization_id, p_code, p_name, p_account_class,
    p_normal_side, p_parent_id, p_is_posting) RETURNING * INTO created;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id, after_row)
  VALUES (p_organization_id, 'account', created.id, 'ACCOUNT_CREATE', actor, to_jsonb(created));
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.create_aqvora_account(uuid,text,text,text,text,uuid,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_account(uuid,text,text,text,text,uuid,boolean)
  TO authenticated;

CREATE FUNCTION public.edit_aqvora_account(
  p_organization_id uuid, p_account_id uuid, p_expected_revision bigint,
  p_code text, p_name text, p_parent_id uuid
) RETURNS public.aqvora_accounts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; prior public.aqvora_accounts; changed public.aqvora_accounts;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  SELECT * INTO prior FROM public.aqvora_accounts
    WHERE organization_id = p_organization_id AND id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AQVORA account was not found in this company'; END IF;
  IF prior.control_role IS NOT NULL THEN RAISE EXCEPTION 'Control accounts are protected'; END IF;
  IF p_expected_revision IS DISTINCT FROM prior.revision THEN
    RAISE EXCEPTION 'AQVORA account revision is stale';
  END IF;
  UPDATE public.aqvora_accounts SET code = p_code, name = p_name,
    parent_id = p_parent_id, revision = revision + 1
    WHERE organization_id = p_organization_id AND id = p_account_id
    RETURNING * INTO changed;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id, before_row, after_row)
  VALUES (p_organization_id, 'account', p_account_id, 'ACCOUNT_EDIT', actor,
    to_jsonb(prior), to_jsonb(changed));
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.edit_aqvora_account(uuid,uuid,bigint,text,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_aqvora_account(uuid,uuid,bigint,text,text,uuid)
  TO authenticated;

CREATE FUNCTION public.archive_aqvora_account(
  p_organization_id uuid, p_account_id uuid, p_expected_revision bigint, p_reason text
) RETURNS public.aqvora_accounts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; prior public.aqvora_accounts; changed public.aqvora_accounts;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Account archive reason is required';
  END IF;
  SELECT * INTO prior FROM public.aqvora_accounts
    WHERE organization_id = p_organization_id AND id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AQVORA account was not found in this company'; END IF;
  IF prior.control_role IS NOT NULL THEN RAISE EXCEPTION 'Control accounts are protected'; END IF;
  IF p_expected_revision IS DISTINCT FROM prior.revision THEN
    RAISE EXCEPTION 'AQVORA account revision is stale';
  END IF;
  IF NOT prior.is_active THEN RAISE EXCEPTION 'AQVORA account is already archived'; END IF;
  IF EXISTS (SELECT 1 FROM public.aqvora_accounts child
    WHERE child.organization_id = p_organization_id
      AND child.parent_id = p_account_id AND child.is_active) THEN
    RAISE EXCEPTION 'Archive active children before their heading';
  END IF;
  UPDATE public.aqvora_accounts SET is_active = false, revision = revision + 1
    WHERE organization_id = p_organization_id AND id = p_account_id
    RETURNING * INTO changed;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id,
     reason, before_row, after_row)
  VALUES (p_organization_id, 'account', p_account_id, 'ACCOUNT_ARCHIVE', actor,
    p_reason, to_jsonb(prior), to_jsonb(changed));
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.archive_aqvora_account(uuid,uuid,bigint,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_aqvora_account(uuid,uuid,bigint,text)
  TO authenticated;

CREATE FUNCTION public.list_aqvora_accounts(
  p_organization_id uuid, p_after_code text DEFAULT NULL, p_limit integer DEFAULT 100
) RETURNS SETOF public.aqvora_accounts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.aqvora_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'AQVORA account page size must be 1–200';
  END IF;
  RETURN QUERY SELECT a.* FROM public.aqvora_accounts a
    WHERE a.organization_id = p_organization_id
      AND (p_after_code IS NULL OR upper(a.code) > upper(p_after_code))
    ORDER BY upper(a.code) LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.list_aqvora_accounts(uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_aqvora_accounts(uuid,text,integer) TO authenticated;

CREATE FUNCTION public.get_aqvora_account(p_organization_id uuid, p_account_id uuid)
RETURNS public.aqvora_accounts
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.aqvora_accounts;
BEGIN
  PERFORM private.aqvora_authorize(p_organization_id);
  SELECT * INTO result FROM public.aqvora_accounts
    WHERE organization_id = p_organization_id AND id = p_account_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_aqvora_account(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aqvora_account(uuid,uuid) TO authenticated;
