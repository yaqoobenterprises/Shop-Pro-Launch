CREATE FUNCTION public.read_aqvora_trial_balance(
  p_organization_id uuid, p_from_date date, p_to_date date, p_currency text,
  p_limit integer DEFAULT 100, p_cursor jsonb DEFAULT NULL, p_snapshot_token text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
SET timezone = 'UTC' SET datestyle = 'ISO, YMD' AS $$
DECLARE source jsonb; result jsonb; after_code text; after_id uuid;
BEGIN
  source := private.aqvora_certify_read(p_organization_id,p_from_date,p_to_date,p_currency,p_snapshot_token);
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AQVORA report page size must be 1-200';
  END IF;
  IF p_cursor IS NOT NULL THEN
    IF p_snapshot_token IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AQVORA cursor requires its snapshot token';
    END IF;
    SELECT a.code,a.id INTO after_code,after_id FROM public.aqvora_accounts a
      WHERE a.organization_id = p_organization_id AND a.is_posting
        AND jsonb_build_object('snapshot_token',source->>'snapshot_token','kind','trial_balance',
          'account_id',a.id,'code',a.code) = p_cursor;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid AQVORA report cursor';
    END IF;
  END IF;
  WITH movement AS (
    SELECT l.account_id,
      coalesce(sum(l.debit_minor::numeric-l.credit_minor) FILTER (WHERE j.business_date < p_from_date),0) AS opening,
      coalesce(sum(l.debit_minor) FILTER (WHERE j.business_date >= p_from_date),0) AS dr,
      coalesce(sum(l.credit_minor) FILTER (WHERE j.business_date >= p_from_date),0) AS cr
    FROM public.aqvora_journals j JOIN public.aqvora_journal_lines l
      ON l.organization_id = p_organization_id AND l.journal_id = j.id
    WHERE j.organization_id = p_organization_id AND j.business_date <= p_to_date GROUP BY l.account_id
  ), balances AS MATERIALIZED (
    SELECT a.id,a.code,to_jsonb(a) || jsonb_build_object('revision',a.revision::text) AS account,
      coalesce(m.opening,0) AS opening,coalesce(m.dr,0) AS dr,coalesce(m.cr,0) AS cr,
      coalesce(m.opening,0)+coalesce(m.dr,0)-coalesce(m.cr,0) AS closing,
      row_number() OVER (ORDER BY a.code COLLATE "C",a.id) AS ordinal
    FROM public.aqvora_accounts a LEFT JOIN movement m ON m.account_id = a.id
    WHERE a.organization_id = p_organization_id AND a.is_posting
  ), page AS MATERIALIZED (
    SELECT * FROM balances WHERE p_cursor IS NULL OR (code COLLATE "C",id) > (after_code COLLATE "C",after_id)
    ORDER BY code COLLATE "C",id LIMIT p_limit
  ) SELECT jsonb_build_object(
    'matched_count',count(*)::text,'returned_count',(SELECT count(*) FROM page),
    'has_more',coalesce((SELECT max(ordinal) FROM page) < count(*),false),
    'totals',jsonb_build_object('opening_debit_minor',coalesce(sum(greatest(opening,0)),0)::text,
      'opening_credit_minor',coalesce(sum(greatest(-opening,0)),0)::text,
      'debit_minor',coalesce(sum(dr),0)::text,'credit_minor',coalesce(sum(cr),0)::text,
      'closing_debit_minor',coalesce(sum(greatest(closing,0)),0)::text,
      'closing_credit_minor',coalesce(sum(greatest(-closing,0)),0)::text),
    'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('account',account,
      'ordinal',ordinal::text,'opening_minor',opening::text,'debit_minor',dr::text,'credit_minor',cr::text,
      'closing_minor',closing::text,'closing_debit_minor',greatest(closing,0)::text,
      'closing_credit_minor',greatest(-closing,0)::text) ORDER BY ordinal) FROM page),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT max(ordinal) FROM page) < count(*) THEN
      (SELECT jsonb_build_object('snapshot_token',source->>'snapshot_token','kind','trial_balance',
        'account_id',id,'code',code) FROM page ORDER BY ordinal DESC LIMIT 1) ELSE NULL END)
    INTO result FROM balances;
  IF result->'totals'->>'debit_minor' <> result->'totals'->>'credit_minor'
    OR result->'totals'->>'opening_debit_minor' <> result->'totals'->>'opening_credit_minor'
    OR result->'totals'->>'closing_debit_minor' <> result->'totals'->>'closing_credit_minor' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AQVORA trial balance integrity failure';
  END IF;
  RETURN jsonb_build_object('source',source) || result;
END $$;
REVOKE ALL ON FUNCTION public.read_aqvora_trial_balance(uuid,date,date,text,integer,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_aqvora_trial_balance(uuid,date,date,text,integer,jsonb,text)
  TO authenticated;
