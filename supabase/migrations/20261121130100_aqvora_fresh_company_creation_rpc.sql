-- Fresh V2 registration must run AFTER ordinary Auth signup. The historic
-- on_auth_user_created hook creates an unrelated legacy Shop Pro company and
-- can seed PKR 10,000. We never reclassify that organization as fresh.
CREATE FUNCTION private.aqvora_fresh_aal2_actor() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid := auth.uid(); sid uuid;
BEGIN
  IF actor IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2'
    OR nullif(auth.jwt()->>'session_id','') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Fresh AQVORA setup requires current MFA AAL2 session';
  END IF;
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  PERFORM 1 FROM auth.sessions WHERE id=sid AND user_id=actor FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Fresh AQVORA auth session revoked';
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION private.aqvora_fresh_aal2_actor()
  FROM PUBLIC,anon,authenticated;

-- Authentication/authorization is ALWAYS server-side. No client-supplied
-- organization UUID, owner ID, membership role, opening amount or receipt.
CREATE FUNCTION public.create_aqvora_fresh_company(
  p_creation_intent uuid,p_legal_name text,p_country text,
  p_currency text,p_timezone text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' AS $$
DECLARE
  actor uuid; current_origin private.aqvora_fresh_company_origins;
  canonical_name text := btrim(p_legal_name);
  canonical_country text := btrim(p_country);
  canonical_currency text := upper(btrim(p_currency));
  canonical_zone text := btrim(p_timezone);
  owner_label text; org uuid; payload_hash text; created timestamptz;
BEGIN
  actor:=private.aqvora_fresh_aal2_actor();
  IF p_creation_intent IS NULL OR canonical_name IS NULL
    OR length(canonical_name) NOT BETWEEN 2 AND 255
    OR canonical_country IS NULL OR length(canonical_country) NOT BETWEEN 2 AND 100
    OR canonical_currency IS NULL OR canonical_currency !~ '^[A-Z]{3}$'
    OR canonical_zone IS NULL OR length(canonical_zone) NOT BETWEEN 1 AND 100
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=canonical_zone)
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='Invalid company identity, currency or IANA timezone';
  END IF;
  payload_hash:=encode(sha256(convert_to(jsonb_build_array(
    'fresh-entity-v1',actor,p_creation_intent,canonical_name,
    canonical_country,canonical_currency,canonical_zone)::text,'UTF8')),'hex');

  -- Serialize same actor's creation/retries; a lost ACK must NOT create a
  -- second company. This is an authenticated user row, not a display name.
  SELECT coalesce(nullif(btrim(p.full_name),''),u.email) INTO owner_label
  FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
  WHERE u.id=actor FOR UPDATE OF u;
  IF NOT FOUND OR owner_label IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Verified owner profile missing';
  END IF;
  SELECT * INTO current_origin FROM private.aqvora_fresh_company_origins
    WHERE creator_id=actor AND creation_intent=p_creation_intent;
  IF FOUND THEN
    IF current_origin.payload_hash<>payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='Fresh-company idempotency key changed its payload';
    END IF;
    RETURN jsonb_build_object('organization_id',current_origin.organization_id,
      'creation_intent',p_creation_intent,'company_name',current_origin.company_name,
      'currency',current_origin.currency,'created_at',current_origin.created_at,
      'status','fresh_company_created_zero_books');
  END IF;

  org:=gen_random_uuid();
  INSERT INTO public.organizations(id,name,owner_name,country,currency,
    currency_symbol,timezone)
  VALUES(org,canonical_name,left(owner_label,255),canonical_country,
    canonical_currency,canonical_currency,canonical_zone);
  INSERT INTO private.aqvora_fresh_company_origins(
    organization_id,creator_id,creation_intent,payload_hash,
    company_name,country_name,company_timezone,currency)
  VALUES(org,actor,p_creation_intent,payload_hash,canonical_name,
    canonical_country,canonical_zone,canonical_currency)
  RETURNING created_at INTO created;
  INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
    VALUES(org,actor,'OWNER',true);

  -- No connection to old shop profile/ledger or legacy default PKR 10,000.
  -- If another old trigger seeded any ledger money, the ENTIRE RPC rolls back.
  IF EXISTS(SELECT 1 FROM public.payment_accounts WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.transactions WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.account_ledger_entries WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.account_transfers WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.transaction_drafts WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.stock_movements WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.aqvora_journals WHERE organization_id=org)
    OR EXISTS(SELECT 1 FROM public.aqvora_enabled_companies WHERE organization_id=org)
  THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='New AQVORA company unexpectedly contains financial source data';
  END IF;
  RETURN jsonb_build_object('organization_id',org,
    'creation_intent',p_creation_intent,'company_name',canonical_name,
    'currency',canonical_currency,'created_at',created,
    'status','fresh_company_created_zero_books');
END $$;
REVOKE ALL ON FUNCTION public.create_aqvora_fresh_company(
  uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_fresh_company(
  uuid,text,text,text,text) TO authenticated;
