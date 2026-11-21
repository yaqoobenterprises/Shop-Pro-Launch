-- Genuine two-party new-company OWNER invitation. No email sending, role
-- upgrade through profiles, legacy company enrollment, or writer activation.
-- Codes are shared manually out-of-band; a code alone NEVER authorizes access.
CREATE TABLE private.aqvora_fresh_owner_invitations (
  organization_id uuid NOT NULL REFERENCES private.aqvora_fresh_company_origins(organization_id),
  invitation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  invite_intent uuid NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  invitee_email_sha256 text NOT NULL CHECK (invitee_email_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id,invitation_id),
  UNIQUE(organization_id,invited_by,invite_intent),
  CHECK(expires_at>created_at)
);

CREATE TABLE private.aqvora_fresh_owner_invite_acceptances (
  organization_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  accepted_by uuid NOT NULL REFERENCES auth.users(id),
  accepted_session_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,invitation_id),
  UNIQUE(organization_id,accepted_by),
  FOREIGN KEY(organization_id,invitation_id)
    REFERENCES private.aqvora_fresh_owner_invitations(organization_id,invitation_id)
);
ALTER TABLE private.aqvora_fresh_owner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.aqvora_fresh_owner_invite_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.aqvora_fresh_owner_invitations,
  private.aqvora_fresh_owner_invite_acceptances FROM PUBLIC,anon,authenticated;

CREATE TRIGGER aqvora_fresh_invite_immutable BEFORE UPDATE OR DELETE
  ON private.aqvora_fresh_owner_invitations FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_immutable();
CREATE TRIGGER aqvora_fresh_invite_accept_immutable BEFORE UPDATE OR DELETE
  ON private.aqvora_fresh_owner_invite_acceptances FOR EACH ROW
  EXECUTE FUNCTION private.aqvora_immutable();

-- Existing real OWNER of a trusted genuinely-new company issues a code to a
-- specific email. The database stores a hash, NEVER plaintext invitee email;
-- it does not reveal whether that email currently has an Auth account.
CREATE FUNCTION public.create_aqvora_fresh_owner_invite(
  p_organization_id uuid,p_invite_intent uuid,p_invitee_email text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' AS $$
DECLARE
  actor uuid; canonical text := lower(btrim(p_invitee_email));
  email_hash text; payload_hash text;
  prior private.aqvora_fresh_owner_invitations;
  created private.aqvora_fresh_owner_invitations;
BEGIN
  actor:=private.aqvora_admin_authorize(p_organization_id);
  IF p_invite_intent IS NULL OR canonical IS NULL OR length(canonical)>254
    OR canonical !~ '^[a-z0-9._%+~-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    OR NOT EXISTS(SELECT 1 FROM private.aqvora_fresh_company_origins
      WHERE organization_id=p_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='New-company verified OWNER invitation requires a valid fresh tenant and email';
  END IF;
  IF EXISTS(SELECT 1 FROM public.aqvora_enabled_companies
    WHERE organization_id=p_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Initial finance reviewer enrollment is closed after activation';
  END IF;
  -- Never invite oneself to satisfy independent maker/checker.
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND lower(email)=canonical) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='The maker and the second finance owner must be independent people';
  END IF;
  email_hash:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
  payload_hash:=encode(sha256(convert_to(jsonb_build_array(
    'aqvora-fresh-owner-invite-v1',p_organization_id,actor,
    p_invite_intent,email_hash,'OWNER')::text,'UTF8')),'hex');
  SELECT * INTO prior FROM private.aqvora_fresh_owner_invitations
    WHERE organization_id=p_organization_id
      AND invited_by=actor AND invite_intent=p_invite_intent;
  IF FOUND THEN
    IF prior.request_sha256<>payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='Original owner invitation key was reused with different details';
    END IF;
    RETURN jsonb_build_object('organization_id',p_organization_id,
      'invitation_id',prior.invitation_id,'invite_intent',prior.invite_intent,
      'expires_at',prior.expires_at,'status','awaiting_verified_owner_acceptance');
  END IF;
  IF (SELECT count(*) FROM private.aqvora_fresh_owner_invitations i
      WHERE i.organization_id=p_organization_id AND i.expires_at>clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM private.aqvora_fresh_owner_invite_acceptances a
        WHERE a.organization_id=i.organization_id
          AND a.invitation_id=i.invitation_id))>=10 THEN
    RAISE EXCEPTION USING ERRCODE='54000',
      MESSAGE='Too many outstanding finance owner invitations';
  END IF;
  INSERT INTO private.aqvora_fresh_owner_invitations(
    organization_id,invite_intent,invited_by,invitee_email_sha256,
    request_sha256,expires_at)
  VALUES(p_organization_id,p_invite_intent,actor,email_hash,
    payload_hash,clock_timestamp()+interval '7 days')
  RETURNING * INTO created;
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'invitation_id',created.invitation_id,'invite_intent',created.invite_intent,
    'expires_at',created.expires_at,'status','awaiting_verified_owner_acceptance');
END $$;

-- The recipient MUST be personally signed in with an actual verified Auth
-- email, live AAL2 session, and knowledge of the invitation UUID. A copied
-- code, arbitrary email claim or an admin's legacy profile cannot elevate.
CREATE FUNCTION public.accept_aqvora_fresh_owner_invite(
  p_organization_id uuid,p_invitation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' AS $$
DECLARE
  recipient uuid; recipient_email text; recipient_verified timestamptz;
  current_session uuid;
  invitation private.aqvora_fresh_owner_invitations;
  prior private.aqvora_fresh_owner_invite_acceptances;
  accepted_at timestamptz;
BEGIN
  recipient:=private.aqvora_fresh_aal2_actor();
  IF p_organization_id IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Verified new company invitation is missing';
  END IF;
  current_session:=nullif(auth.jwt()->>'session_id','')::uuid;
  SELECT lower(btrim(email)),email_confirmed_at INTO recipient_email,recipient_verified
    FROM auth.users WHERE id=recipient FOR SHARE;
  IF NOT FOUND OR recipient_verified IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Recipient email must be confirmed in Supabase Auth';
  END IF;
  SELECT * INTO invitation FROM private.aqvora_fresh_owner_invitations
    WHERE organization_id=p_organization_id AND invitation_id=p_invitation_id;
  IF NOT FOUND OR invitation.invitee_email_sha256 IS DISTINCT FROM
      encode(sha256(convert_to(recipient_email,'UTF8')),'hex')
      OR invitation.invited_by=recipient THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Invitation does not match current verified recipient';
  END IF;
  -- Lock order matches admin: Auth session -> relevant membership -> company.
  PERFORM 1 FROM public.organization_members WHERE
    organization_id=p_organization_id AND user_id=invitation.invited_by
    AND role='OWNER' AND is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Invitation issuer no longer has an active OWNER role';
  END IF;
  PERFORM 1 FROM public.organizations
    WHERE id=p_organization_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM private.aqvora_fresh_company_origins
    WHERE organization_id=p_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Only verifiably new companies can accept finance owner invitations';
  END IF;
  -- Duplicate ACK of the same original accepted invitation is read-only.
  SELECT * INTO prior FROM private.aqvora_fresh_owner_invite_acceptances
    WHERE organization_id=p_organization_id AND invitation_id=p_invitation_id;
  IF FOUND THEN
    IF prior.accepted_by<>recipient OR NOT EXISTS(
      SELECT 1 FROM public.organization_members
      WHERE organization_id=p_organization_id AND user_id=recipient
        AND role='OWNER' AND is_active) THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='Original acceptance belongs to another or revoked OWNER';
    END IF;
    RETURN jsonb_build_object('organization_id',p_organization_id,
      'invitation_id',p_invitation_id,'accepted_by',recipient,
      'accepted_at',prior.accepted_at,'status','verified_owner_joined');
  END IF;
  IF invitation.expires_at<=clock_timestamp() OR EXISTS(
    SELECT 1 FROM public.aqvora_enabled_companies
    WHERE organization_id=p_organization_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='New finance owner invitation expired or writer already active';
  END IF;
  IF EXISTS(SELECT 1 FROM public.organization_members
    WHERE organization_id=p_organization_id AND user_id=recipient) THEN
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='Existing membership needs separate governed role-change approval';
  END IF;
  INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
    VALUES(p_organization_id,recipient,'OWNER',true);
  INSERT INTO private.aqvora_fresh_owner_invite_acceptances(
    organization_id,invitation_id,accepted_by,accepted_session_id)
  VALUES(p_organization_id,p_invitation_id,recipient,current_session)
  RETURNING accepted_at INTO accepted_at;
  RETURN jsonb_build_object('organization_id',p_organization_id,
    'invitation_id',p_invitation_id,'accepted_by',recipient,
    'accepted_at',accepted_at,'status','verified_owner_joined');
END $$;

REVOKE ALL ON FUNCTION public.create_aqvora_fresh_owner_invite(uuid,uuid,text),
  public.accept_aqvora_fresh_owner_invite(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_aqvora_fresh_owner_invite(uuid,uuid,text),
  public.accept_aqvora_fresh_owner_invite(uuid,uuid) TO authenticated;
