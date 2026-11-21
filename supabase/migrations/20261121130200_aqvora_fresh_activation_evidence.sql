-- Internal activation evidence. The caller MUST hold the same company row
-- FOR UPDATE lock as CoA/period administration. Never expose this to PostgREST.
-- Zero V2 journal activity is necessary but NOT sufficient: legacy source and
-- operational V2 sales/receipts must also be absent.
CREATE FUNCTION private.aqvora_fresh_activation_evidence(
  p_org uuid,p_period uuid,p_policy_revision bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  origin private.aqvora_fresh_company_origins;
  company public.organizations;
  chosen public.aqvora_periods;
  policy jsonb;
  chart jsonb;
  calendar jsonb;
  evidence text;
  open_count bigint;
BEGIN
  SELECT * INTO origin FROM private.aqvora_fresh_company_origins
    WHERE organization_id=p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Legacy or unproven company cannot enroll in fresh AQVORA finance';
  END IF;
  SELECT * INTO company FROM public.organizations WHERE id=p_org;
  IF NOT FOUND OR company.currency IS DISTINCT FROM origin.currency
    OR company.name IS DISTINCT FROM origin.company_name THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Fresh company legal identity or currency changed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.aqvora_enabled_companies WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_journals WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_journal_lines WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_posting_receipts WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_sales_invoices WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_cash_collections WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.aqvora_customer_receipts WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.transactions WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.payment_accounts WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.account_ledger_entries WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.account_transfers WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.transaction_drafts WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.stock_movements WHERE organization_id=p_org)
    OR EXISTS(SELECT 1 FROM public.account_transactions WHERE organization_id=p_org)
  THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Fresh finance activation requires zero legacy and V2 financial activity';
  END IF;
  SELECT * INTO chosen FROM public.aqvora_periods WHERE organization_id=p_org
    AND id=p_period AND state='open';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Chosen first fiscal period is not open';
  END IF;
  SELECT count(*) INTO open_count FROM public.aqvora_periods
    WHERE organization_id=p_org AND state='open';
  IF open_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Exactly one opening fiscal period must be open for activation';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_array(a.id,a.code,a.name,
      a.account_class,a.normal_side,a.parent_id,a.control_role,
      a.is_active,a.is_posting,a.revision::text)
      ORDER BY upper(a.code),a.id),'[]'::jsonb) INTO chart
    FROM public.aqvora_accounts a WHERE a.organization_id=p_org;
  IF NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='asset')
    OR NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='liability')
    OR NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='equity')
    OR NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='revenue')
    OR NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='expense')
    OR NOT EXISTS(SELECT 1 FROM public.aqvora_accounts a
      WHERE a.organization_id=p_org AND a.is_active AND a.is_posting AND a.account_class='cost_of_sales')
  THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Finance chart is missing required genuine posting account classes';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_array(f.id,f.starts_on,
      f.ends_on,f.state,f.revision::text) ORDER BY f.starts_on,f.id),
      '[]'::jsonb) INTO calendar
    FROM public.aqvora_periods f WHERE f.organization_id=p_org;
  policy:=private.aqvora_currency_at(p_org,chosen.starts_on,company.currency);
  IF policy IS NULL OR (policy->>'revision')::bigint IS DISTINCT FROM p_policy_revision
    OR (policy->>'fingerprint') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Approved currency unit policy missing, mismatched or superseded';
  END IF;
  evidence:=encode(sha256(convert_to(jsonb_build_array(
    'fresh-activation-evidence-v1',p_org,origin.creator_id,
    origin.creation_intent,origin.payload_hash,origin.registration_method,
    company.name,company.currency,company.country,company.timezone,
    chosen.id,chosen.starts_on,chosen.ends_on,
    policy,chart,calendar)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('organization_id',p_org,
    'source_kind','trusted_new_v2_company_only',
    'fiscal_period_id',chosen.id,
    'currency',company.currency,
    'currency_policy_revision',policy->>'revision',
    'currency_policy_fingerprint',policy->>'fingerprint',
    'evidence_sha256',evidence,
    'zero_financial_history',true);
END $$;
REVOKE ALL ON FUNCTION private.aqvora_fresh_activation_evidence(
  uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
