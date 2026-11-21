-- Strict two-independent-OWNER ceremony. No manager, bearer of stale JWT,
-- old Cashbook tenant, anonymous user or single-owner shortcut may enroll.
-- Company row is locked throughout, serializing edits/currency/journal writes.
CREATE FUNCTION public.propose_aqvora_fresh_finance_activation(
  p_organization_id uuid,p_maker_intent uuid,p_fiscal_period_id uuid,
  p_currency_policy_revision bigint,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' AS $$
DECLARE
  actor uuid; sid uuid;
  canonical_reason text := btrim(p_reason);
  existing private.aqvora_finance_activation_requests;
  evidence jsonb; hashed text; proposed timestamptz;
BEGIN
  actor:=private.aqvora_admin_authorize(p_organization_id);
  IF p_maker_intent IS NULL OR p_fiscal_period_id IS NULL
    OR p_currency_policy_revision IS NULL OR p_currency_policy_revision<=0
    OR canonical_reason IS NULL OR length(canonical_reason) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='Fresh activation proposal requires valid fiscal/policy and documented purpose';
  END IF;
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  hashed:=encode(sha256(convert_to(jsonb_build_array(
    'activation-maker-v1',actor,p_organization_id,p_maker_intent,
    p_fiscal_period_id,p_currency_policy_revision,canonical_reason)::text,'UTF8')),'hex');
  SELECT * INTO existing FROM private.aqvora_finance_activation_requests
    WHERE organization_id=p_organization_id AND maker_intent=p_maker_intent;
  IF FOUND THEN
    IF existing.maker_id IS DISTINCT FROM actor OR existing.payload_hash<>hashed THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='Fresh activation intent was already used with different signed payload';
    END IF;
    RETURN jsonb_build_object('organization_id',p_organization_id,
      'maker_intent',p_maker_intent,'maker_id',existing.maker_id,
      'evidence_sha256',existing.evidence_hash,
      'currency_policy_revision',existing.currency_policy_revision::text,
      'fiscal_period_id',existing.fiscal_period_id,
      'status','awaiting_independent_owner_approval',
      'proposed_at',existing.proposed_at);
  END IF;
  evidence:=private.aqvora_fresh_activation_evidence(p_organization_id,
    p_fiscal_period_id,p_currency_policy_revision);
  INSERT INTO private.aqvora_finance_activation_requests(
    organization_id,maker_intent,maker_id,maker_session_id,
    evidence_hash,payload_hash,fiscal_period_id,currency_policy_revision,
    currency_policy_fingerprint,reason)
  VALUES(p_organization_id,p_maker_intent,actor,sid,
    evidence->>'evidence_sha256',hashed,p_fiscal_period_id,
    p_currency_policy_revision,evidence->>'currency_policy_fingerprint',
    canonical_reason)
  RETURNING proposed_at INTO proposed;
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'maker_intent',p_maker_intent,'maker_id',actor,
    'evidence_sha256',evidence->>'evidence_sha256',
    'currency_policy_revision',p_currency_policy_revision::text,
    'fiscal_period_id',p_fiscal_period_id,
    'status','awaiting_independent_owner_approval',
    'proposed_at',proposed);
END $$;

CREATE FUNCTION public.approve_aqvora_fresh_finance_activation(
  p_organization_id uuid,p_maker_intent uuid,p_checker_intent uuid,
  p_checker_attestation text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' AS $$
DECLARE
  checker uuid; sid uuid;
  original private.aqvora_finance_activation_requests;
  already private.aqvora_finance_activation_approvals;
  evidence jsonb; when_approved timestamptz;
BEGIN
  checker:=private.aqvora_admin_authorize(p_organization_id);
  IF p_maker_intent IS NULL OR p_checker_intent IS NULL
    OR p_maker_intent=p_checker_intent
    OR p_checker_attestation IS DISTINCT FROM
      'I APPROVE THE NEW ZERO-OPENING AQVORA COMPANY FINANCE WRITER' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='Independent reviewer must explicitly approve a fresh zero-opening company';
  END IF;
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  -- Same-key lost ACK returns the originally committed receipt; never allow
  -- a different reviewer, maker intent or key to impersonate that approval.
  SELECT * INTO already FROM private.aqvora_finance_activation_approvals
    WHERE organization_id=p_organization_id AND checker_intent=p_checker_intent;
  IF FOUND THEN
    IF already.maker_intent IS DISTINCT FROM p_maker_intent
      OR already.checker_id IS DISTINCT FROM checker THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='Checker idempotency key payload or actor mismatch';
    END IF;
    RETURN jsonb_build_object('organization_id',p_organization_id,
      'maker_intent',already.maker_intent,'checker_intent',already.checker_intent,
      'checker_id',already.checker_id,'evidence_sha256',already.approved_evidence_hash,
      'status','fresh_finance_writer_enabled','activated_at',already.activated_at);
  END IF;
  SELECT * INTO original FROM private.aqvora_finance_activation_requests
    WHERE organization_id=p_organization_id AND maker_intent=p_maker_intent;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Independent activation proposal does not exist';
  END IF;
  IF checker=original.maker_id OR sid=original.maker_session_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Second ACTIVE company OWNER must be distinct from finance maker';
  END IF;
  -- A revoked maker/removed maker does not keep an approval request alive.
  PERFORM 1 FROM auth.sessions
    WHERE id=original.maker_session_id AND user_id=original.maker_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Original finance maker lost active OWNER or session authorization';
  END IF;
  PERFORM 1 FROM public.organization_members
    WHERE organization_id=p_organization_id AND user_id=original.maker_id
      AND role='OWNER' AND is_active=true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Original finance maker lost active OWNER or session authorization';
  END IF;
  IF original.proposed_at<clock_timestamp()-interval '7 days' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Activation approval request expired; make a new signed proposal';
  END IF;
  -- Uncommitted source mutations against this company are blocked by the
  -- same company lock used in admin, currency policy and V2 writer RPCs.
  evidence:=private.aqvora_fresh_activation_evidence(p_organization_id,
    original.fiscal_period_id,original.currency_policy_revision);
  IF evidence->>'evidence_sha256' IS DISTINCT FROM original.evidence_hash
    OR evidence->>'currency_policy_fingerprint' IS DISTINCT FROM
       original.currency_policy_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Finance chart, policy or fiscal evidence changed since maker approval';
  END IF;
  IF EXISTS(SELECT 1 FROM private.aqvora_finance_activation_approvals
    WHERE organization_id=p_organization_id AND maker_intent=p_maker_intent) THEN
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='Finance activation already approved under another checker intent';
  END IF;
  -- Approval evidence and enabled-company authorization are ONE transaction.
  -- Any failure rolls both back, including retries/races.
  INSERT INTO private.aqvora_finance_activation_approvals(
    organization_id,checker_intent,maker_intent,checker_id,
    checker_session_id,approved_evidence_hash)
  VALUES(p_organization_id,p_checker_intent,p_maker_intent,checker,
    sid,original.evidence_hash)
  RETURNING activated_at INTO when_approved;
  INSERT INTO public.aqvora_enabled_companies(organization_id)
    VALUES(p_organization_id);
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'maker_intent',p_maker_intent,'checker_intent',p_checker_intent,
    'checker_id',checker,'evidence_sha256',original.evidence_hash,
    'status','fresh_finance_writer_enabled','activated_at',when_approved);
END $$;

-- Lookup is read-only and independently AAL2/OWNER-authorized; it never
-- issues a new activation request when an ACK is missing.
CREATE FUNCTION public.lookup_aqvora_fresh_finance_activation(
  p_organization_id uuid,p_checker_intent uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE checker uuid; prior private.aqvora_finance_activation_approvals;
BEGIN
  checker:=private.aqvora_authorize(p_organization_id);
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE
    organization_id=p_organization_id AND user_id=checker
    AND role='OWNER' AND is_active=true) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Finance activation receipt requires company OWNER';
  END IF;
  SELECT * INTO prior FROM private.aqvora_finance_activation_approvals
    WHERE organization_id=p_organization_id AND checker_intent=p_checker_intent;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'maker_intent',prior.maker_intent,'checker_intent',prior.checker_intent,
    'checker_id',prior.checker_id,
    'evidence_sha256',prior.approved_evidence_hash,
    'status','fresh_finance_writer_enabled','activated_at',prior.activated_at);
END $$;

REVOKE ALL ON FUNCTION public.propose_aqvora_fresh_finance_activation(
  uuid,uuid,uuid,bigint,text),
  public.approve_aqvora_fresh_finance_activation(uuid,uuid,uuid,text),
  public.lookup_aqvora_fresh_finance_activation(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.propose_aqvora_fresh_finance_activation(
  uuid,uuid,uuid,bigint,text),
  public.approve_aqvora_fresh_finance_activation(uuid,uuid,uuid,text),
  public.lookup_aqvora_fresh_finance_activation(uuid,uuid)
  TO authenticated;
