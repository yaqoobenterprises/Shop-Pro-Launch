-- All financial writes are server-owned and transaction-atomic.
CREATE FUNCTION private.aqvora_authorize(p_org uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); member_role text;
BEGIN
  IF actor IS NULL OR p_org IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'AQVORA posting requires an authenticated MFA session';
  END IF;
  SELECT role INTO member_role FROM public.organization_members
  WHERE organization_id = p_org AND user_id = actor AND is_active = true FOR SHARE;
  IF member_role IS NULL OR member_role NOT IN ('OWNER','MANAGER') THEN
    RAISE EXCEPTION 'AQVORA posting is not authorized for this company';
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_authorize(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.aqvora_post_internal(
  p_org uuid, p_intent text, p_date date, p_lines jsonb,
  p_reversal_of uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid; company_currency text; period_id uuid; period_count integer;
  normalized jsonb; prior record; line jsonb; account record;
  line_number integer := 0; debit_amount bigint; credit_amount bigint;
  debit_total numeric := 0; credit_total numeric := 0; new_id uuid;
BEGIN
  actor := private.aqvora_authorize(p_org);
  IF p_intent IS NULL OR length(p_intent) NOT BETWEEN 1 AND 160
     OR btrim(p_intent) <> p_intent OR p_date IS NULL
     OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Invalid AQVORA posting request';
  END IF;
  IF (p_reversal_of IS NULL AND p_reason IS NOT NULL)
    OR (p_reversal_of IS NOT NULL AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500)) THEN
    RAISE EXCEPTION 'Invalid reversal metadata';
  END IF;
  -- Period edits lock this company row FOR UPDATE; this shared lock freezes
  -- currency and fiscal coverage until the posting transaction commits.
  SELECT currency INTO company_currency FROM public.organizations WHERE id = p_org FOR SHARE;
  IF company_currency IS NULL OR company_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Company has no valid base currency';
  END IF;
  normalized := jsonb_build_object('business_date', p_date, 'currency', company_currency,
    'lines', p_lines, 'reversal_of', p_reversal_of, 'reason', p_reason);

  -- A lost response can be recovered even after the period closes. Authorization
  -- and MFA are always rechecked. A changed request may never reuse the key.
  SELECT r.journal_id, r.payload, j.total_minor, j.posted_at, j.posted_by
    INTO prior FROM public.aqvora_posting_receipts r
    JOIN public.aqvora_journals j ON (j.organization_id, j.id) = (r.organization_id, r.journal_id)
    WHERE r.organization_id = p_org AND r.intent_key = p_intent;
  IF FOUND THEN
    IF prior.payload <> normalized THEN RAISE EXCEPTION 'Idempotency key payload mismatch'; END IF;
    RETURN jsonb_build_object('organization_id', p_org, 'intent_key', p_intent,
      'journal_id', prior.journal_id, 'total_minor', prior.total_minor::text,
      'posted_at', prior.posted_at, 'posted_by', prior.posted_by);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.aqvora_enabled_companies
    WHERE organization_id = p_org) THEN
    RAISE EXCEPTION 'AQVORA posting is not enabled for this company';
  END IF;

  SELECT count(*) INTO period_count FROM public.aqvora_periods
    WHERE organization_id = p_org AND p_date BETWEEN starts_on AND ends_on;
  IF period_count <> 1 THEN RAISE EXCEPTION 'Posting date must have exactly one fiscal period'; END IF;
  SELECT id INTO period_id FROM public.aqvora_periods
    WHERE organization_id = p_org AND p_date BETWEEN starts_on AND ends_on
      AND state = 'open' FOR SHARE;
  IF period_id IS NULL THEN RAISE EXCEPTION 'Fiscal period is closed'; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    line_number := line_number + 1;
    IF jsonb_typeof(line) <> 'object'
      OR jsonb_typeof(line->'account_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(line->'debit_minor') IS DISTINCT FROM 'string'
      OR jsonb_typeof(line->'credit_minor') IS DISTINCT FROM 'string'
      OR (line->>'debit_minor') !~ '^(0|[1-9][0-9]{0,18})$'
      OR (line->>'credit_minor') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION 'Journal amounts must be canonical integer minor-unit strings';
    END IF;
    debit_amount := (line->>'debit_minor')::bigint;
    credit_amount := (line->>'credit_minor')::bigint;
    IF (debit_amount > 0) = (credit_amount > 0) THEN
      RAISE EXCEPTION 'Every journal line must use exactly one side';
    END IF;
    SELECT id, is_posting, is_active, control_role INTO account
      FROM public.aqvora_accounts
      WHERE organization_id = p_org AND id = (line->>'account_id')::uuid FOR SHARE;
    IF NOT FOUND OR NOT account.is_posting OR
       (NOT account.is_active AND p_reversal_of IS NULL) THEN
      RAISE EXCEPTION 'Journal account is missing, foreign, archived or a heading';
    END IF;
    IF account.control_role IN ('receivable','payable') AND
       (nullif(btrim(line->>'party_id'), '') IS NULL OR
        nullif(btrim(line->>'open_item_id'), '') IS NULL) THEN
      RAISE EXCEPTION 'Receivable/payable line requires party and open item';
    END IF;
    IF account.control_role = 'inventory' AND
       nullif(btrim(line->>'stock_movement_id'), '') IS NULL THEN
      RAISE EXCEPTION 'Inventory line requires stock movement';
    END IF;
    debit_total := debit_total + debit_amount;
    credit_total := credit_total + credit_amount;
  END LOOP;
  IF debit_total <> credit_total OR debit_total = 0 OR debit_total > 9223372036854775807 THEN
    RAISE EXCEPTION 'Journal is unbalanced or exceeds the minor-unit limit';
  END IF;

  -- The unique (company, intent) constraint serializes concurrent retries.
  INSERT INTO public.aqvora_journals
    (organization_id, intent_key, business_date, currency, period_id,
     payload, total_minor, posted_by, reversal_of, reason)
  VALUES (p_org, p_intent, p_date, company_currency, period_id,
          normalized, debit_total::bigint, actor, p_reversal_of, p_reason)
  ON CONFLICT (organization_id, intent_key) DO NOTHING RETURNING id INTO new_id;
  IF new_id IS NULL THEN
    SELECT r.journal_id, r.payload, j.total_minor, j.posted_at, j.posted_by
      INTO prior FROM public.aqvora_posting_receipts r
      JOIN public.aqvora_journals j ON (j.organization_id, j.id) = (r.organization_id, r.journal_id)
      WHERE r.organization_id = p_org AND r.intent_key = p_intent;
    IF NOT FOUND OR prior.payload <> normalized THEN
      RAISE EXCEPTION 'Idempotency key payload mismatch';
    END IF;
    RETURN jsonb_build_object('organization_id', p_org, 'intent_key', p_intent,
      'journal_id', prior.journal_id, 'total_minor', prior.total_minor::text,
      'posted_at', prior.posted_at, 'posted_by', prior.posted_by);
  END IF;

  line_number := 0;
  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    line_number := line_number + 1;
    INSERT INTO public.aqvora_journal_lines
      (organization_id, journal_id, line_no, account_id, debit_minor, credit_minor,
       party_id, open_item_id, stock_movement_id)
    VALUES (p_org, new_id, line_number, (line->>'account_id')::uuid,
      (line->>'debit_minor')::bigint, (line->>'credit_minor')::bigint,
      line->>'party_id', line->>'open_item_id', line->>'stock_movement_id');
  END LOOP;
  INSERT INTO public.aqvora_posting_receipts (organization_id, intent_key, journal_id, payload)
    VALUES (p_org, p_intent, new_id, normalized);
  INSERT INTO public.aqvora_journal_audit
    (organization_id, journal_id, action, actor_id, details)
    VALUES (p_org, new_id, CASE WHEN p_reversal_of IS NULL THEN 'POST' ELSE 'REVERSE' END,
      actor, jsonb_build_object('reversal_of', p_reversal_of, 'reason', p_reason));
  RETURN jsonb_build_object('organization_id', p_org, 'intent_key', p_intent,
    'journal_id', new_id, 'total_minor', debit_total::bigint::text,
    'posted_at', (SELECT posted_at FROM public.aqvora_journals WHERE organization_id = p_org AND id = new_id),
    'posted_by', actor);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_post_internal(uuid,text,date,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.post_aqvora_journal(
  organization_id uuid, intent_key text, business_date date, lines jsonb
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.aqvora_post_internal(organization_id, intent_key, business_date, lines, NULL, NULL);
$$;
REVOKE ALL ON FUNCTION public.post_aqvora_journal(uuid,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_aqvora_journal(uuid,text,date,jsonb) TO authenticated;

CREATE FUNCTION public.lookup_aqvora_receipt(organization_id uuid, intent_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  PERFORM private.aqvora_authorize(organization_id);
  SELECT receipt.journal_id, journal.total_minor, journal.posted_at, journal.posted_by
    INTO r FROM public.aqvora_posting_receipts receipt
    JOIN public.aqvora_journals journal
      ON (journal.organization_id, journal.id) = (receipt.organization_id, receipt.journal_id)
    WHERE receipt.organization_id = lookup_aqvora_receipt.organization_id
      AND receipt.intent_key = lookup_aqvora_receipt.intent_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('organization_id', organization_id, 'intent_key', intent_key,
    'journal_id', r.journal_id, 'total_minor', r.total_minor::text,
    'posted_at', r.posted_at, 'posted_by', r.posted_by);
END $$;
REVOKE ALL ON FUNCTION public.lookup_aqvora_receipt(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_aqvora_receipt(uuid,text) TO authenticated;
