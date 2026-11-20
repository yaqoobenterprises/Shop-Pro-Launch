CREATE FUNCTION public.create_aqvora_period(
  p_organization_id uuid, p_starts_on date, p_ends_on date
) RETURNS public.aqvora_periods
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; created public.aqvora_periods;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  INSERT INTO public.aqvora_periods(organization_id, starts_on, ends_on, state)
    VALUES (p_organization_id, p_starts_on, p_ends_on, 'open')
    RETURNING * INTO created;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id, after_row)
  VALUES (p_organization_id, 'period', created.id, 'PERIOD_CREATE', actor,
    to_jsonb(created));
  RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.create_aqvora_period(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_period(uuid,date,date) TO authenticated;

CREATE FUNCTION public.close_aqvora_period(
  p_organization_id uuid, p_period_id uuid, p_expected_revision bigint, p_reason text
) RETURNS public.aqvora_periods
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; prior public.aqvora_periods; changed public.aqvora_periods;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Fiscal close reason is required';
  END IF;
  SELECT * INTO prior FROM public.aqvora_periods
    WHERE organization_id = p_organization_id AND id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiscal period was not found in this company'; END IF;
  IF p_expected_revision IS DISTINCT FROM prior.revision THEN
    RAISE EXCEPTION 'Fiscal period revision is stale';
  END IF;
  IF prior.state <> 'open' THEN RAISE EXCEPTION 'Fiscal period is already closed'; END IF;
  UPDATE public.aqvora_periods SET state = 'closed', revision = revision + 1
    WHERE organization_id = p_organization_id AND id = p_period_id
    RETURNING * INTO changed;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id,
     reason, before_row, after_row)
  VALUES (p_organization_id, 'period', p_period_id, 'PERIOD_CLOSE', actor,
    p_reason, to_jsonb(prior), to_jsonb(changed));
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.close_aqvora_period(uuid,uuid,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_aqvora_period(uuid,uuid,bigint,text) TO authenticated;

CREATE FUNCTION public.reopen_aqvora_period(
  p_organization_id uuid, p_period_id uuid, p_expected_revision bigint, p_reason text
) RETURNS public.aqvora_periods
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; prior public.aqvora_periods; changed public.aqvora_periods;
BEGIN
  actor := private.aqvora_admin_authorize(p_organization_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Fiscal reopen reason is required';
  END IF;
  SELECT * INTO prior FROM public.aqvora_periods
    WHERE organization_id = p_organization_id AND id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiscal period was not found in this company'; END IF;
  IF p_expected_revision IS DISTINCT FROM prior.revision THEN
    RAISE EXCEPTION 'Fiscal period revision is stale';
  END IF;
  IF prior.state <> 'closed' THEN RAISE EXCEPTION 'Fiscal period is already open'; END IF;
  IF EXISTS (SELECT 1 FROM public.aqvora_periods later
    WHERE later.organization_id = p_organization_id
      AND later.starts_on > prior.starts_on AND later.state = 'closed') THEN
    RAISE EXCEPTION 'A later closed period must be reopened first';
  END IF;
  UPDATE public.aqvora_periods SET state = 'open', reopen_count = reopen_count + 1,
    revision = revision + 1
    WHERE organization_id = p_organization_id AND id = p_period_id
    RETURNING * INTO changed;
  INSERT INTO public.aqvora_admin_audit
    (organization_id, entity_type, entity_id, action, actor_id,
     reason, before_row, after_row)
  VALUES (p_organization_id, 'period', p_period_id, 'PERIOD_REOPEN', actor,
    p_reason, to_jsonb(prior), to_jsonb(changed));
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.reopen_aqvora_period(uuid,uuid,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_aqvora_period(uuid,uuid,bigint,text) TO authenticated;

CREATE FUNCTION public.list_aqvora_periods(
  p_organization_id uuid, p_before_start date DEFAULT NULL, p_limit integer DEFAULT 100
) RETURNS SETOF public.aqvora_periods
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.aqvora_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'AQVORA period page size must be 1–200';
  END IF;
  RETURN QUERY SELECT p.* FROM public.aqvora_periods p
    WHERE p.organization_id = p_organization_id
      AND (p_before_start IS NULL OR p.starts_on < p_before_start)
    ORDER BY p.starts_on DESC LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.list_aqvora_periods(uuid,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_aqvora_periods(uuid,date,integer) TO authenticated;

CREATE FUNCTION public.get_aqvora_period(p_organization_id uuid, p_period_id uuid)
RETURNS public.aqvora_periods
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.aqvora_periods;
BEGIN
  PERFORM private.aqvora_authorize(p_organization_id);
  SELECT * INTO result FROM public.aqvora_periods
    WHERE organization_id = p_organization_id AND id = p_period_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_aqvora_period(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aqvora_period(uuid,uuid) TO authenticated;

CREATE FUNCTION public.list_aqvora_admin_events(
  p_organization_id uuid, p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 100
) RETURNS SETOF public.aqvora_admin_audit
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.aqvora_authorize(p_organization_id);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'AQVORA audit page size must be 1–200';
  END IF;
  RETURN QUERY SELECT e.* FROM public.aqvora_admin_audit e
    WHERE e.organization_id = p_organization_id
      AND (p_before_id IS NULL OR e.id < p_before_id)
    ORDER BY e.id DESC LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.list_aqvora_admin_events(uuid,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_aqvora_admin_events(uuid,bigint,integer) TO authenticated;
