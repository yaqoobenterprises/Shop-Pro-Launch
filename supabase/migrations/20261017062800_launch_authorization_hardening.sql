-- Authorization hardening for the Shop Pro launch project.
-- This migration is pending owner review. It has not been applied to Supabase.
-- No business rows are deleted or rewritten.

-- organization_members is the canonical authorization source. Profiles and
-- shop_members are display/provisioning mirrors and must not reactivate an
-- explicitly inactive organization membership.
CREATE OR REPLACE FUNCTION private.get_auth_user_org_ids()
RETURNS TABLE (org_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.organization_id
  FROM public.organization_members AS membership
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION private.get_org_role(target_org UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.role::TEXT
  FROM public.organization_members AS membership
  WHERE membership.organization_id = target_org
    AND membership.user_id = (SELECT auth.uid())
    AND membership.is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION private.is_org_member(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = target_org
      AND membership.user_id = (SELECT auth.uid())
      AND membership.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION private.is_org_owner(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.get_org_role(target_org) = 'OWNER';
$$;

-- Avoid public-schema name shadowing in the authenticated SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.org_id
  FROM private.get_auth_user_org_ids() AS membership
  ORDER BY membership.org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_active_shop_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.get_auth_user_org_ids()
  );
$$;

-- Preserve the existing login provisioning behavior while keeping an existing
-- inactive organization_members row inactive on subsequent sign-ins.
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  auth_email TEXT;
  metadata JSONB;
  new_org_id UUID;
  full_name_val TEXT;
  shop_name_val TEXT;
  profile_org_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT users.email, users.raw_user_meta_data
  INTO auth_email, metadata
  FROM auth.users AS users
  WHERE users.id = current_user_id;

  IF auth_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user does not exist';
  END IF;

  SELECT profiles.organization_id, profiles.full_name
  INTO profile_org_id, full_name_val
  FROM public.profiles AS profiles
  WHERE profiles.id = current_user_id;

  IF profile_org_id IS NULL THEN
    full_name_val := COALESCE(
      NULLIF(full_name_val, ''),
      NULLIF(metadata->>'full_name', ''),
      NULLIF(metadata->>'name', ''),
      split_part(auth_email, '@', 1)
    );
    shop_name_val := COALESCE(
      NULLIF(metadata->>'shop_name', ''),
      NULLIF(metadata->>'organization_name', ''),
      full_name_val || '''s Shop'
    );

    INSERT INTO public.organizations (name, owner_name, currency, currency_symbol)
    VALUES (shop_name_val, full_name_val, 'PKR', 'Rs.')
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, email, full_name, role, organization_id, is_active)
    VALUES (current_user_id, auth_email, full_name_val, 'OWNER', new_org_id, TRUE)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      full_name = EXCLUDED.full_name,
      is_active = TRUE;

    profile_org_id := new_org_id;
  END IF;

  INSERT INTO public.shop_members (user_id, organization_id, full_name, email, role)
  SELECT
    profiles.id,
    profiles.organization_id,
    COALESCE(NULLIF(profiles.full_name, ''), split_part(profiles.email, '@', 1)),
    profiles.email,
    profiles.role::TEXT
  FROM public.profiles AS profiles
  WHERE profiles.id = current_user_id
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  SELECT profiles.organization_id, profiles.id, profiles.role, TRUE
  FROM public.profiles AS profiles
  WHERE profiles.id = current_user_id
    AND profiles.is_active = TRUE
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role;

  PERFORM public.seed_shop_defaults(profile_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_org_id() TO authenticated;
REVOKE ALL ON FUNCTION public.is_active_shop_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_shop_member() TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- Organization reads must use the canonical active membership. Organization
-- updates are owner-only; active managers and cashiers retain read access.
DROP POLICY IF EXISTS org_member_select ON public.organizations;
DROP POLICY IF EXISTS organizations_select ON public.organizations;
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;
CREATE POLICY "Members can view their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (private.is_org_member(id));

DROP POLICY IF EXISTS org_member_update ON public.organizations;
DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (private.is_org_owner(id))
  WITH CHECK (private.is_org_owner(id));

-- Drafts are only available to authenticated users under RLS.
REVOKE ALL ON TABLE public.transaction_drafts FROM anon, PUBLIC;

-- Scope both normal draft posting and idempotent retries to the authenticated
-- user's active shop before any SECURITY DEFINER query can return a row.
CREATE OR REPLACE FUNCTION public.post_transaction_draft(
  draft_id UUID,
  selected_account_id UUID
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  draft public.transaction_drafts%ROWTYPE;
  posted_transaction public.transactions%ROWTYPE;
  current_user_id UUID := auth.uid();
  current_org_id UUID;
  valid_category_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to post a transaction draft';
  END IF;

  current_org_id := public.get_auth_org_id();
  IF current_org_id IS NULL OR NOT public.is_active_shop_member() THEN
    RAISE EXCEPTION 'An active shop membership is required to post a transaction draft';
  END IF;

  SELECT * INTO draft
  FROM public.transaction_drafts
  WHERE id = draft_id
    AND organization_id = current_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft_id::TEXT
      AND organization_id = current_org_id;
    IF FOUND THEN
      RETURN posted_transaction;
    END IF;
    RAISE EXCEPTION 'Transaction draft was not found';
  END IF;

  IF draft.organization_id <> current_org_id THEN
    RAISE EXCEPTION 'Transaction draft does not belong to an active shop';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_accounts
    WHERE id = selected_account_id
      AND organization_id = draft.organization_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Selected account does not belong to this shop or is inactive';
  END IF;

  valid_category_id := NULL;
  IF draft.category_id IS NOT NULL THEN
    SELECT categories.id INTO valid_category_id
    FROM public.categories AS categories
    WHERE categories.id = draft.category_id
      AND categories.organization_id = draft.organization_id;
  END IF;

  INSERT INTO public.transactions (
    organization_id, type, amount_paisa, category_id, account_id,
    adjustment_dir, business_date, device_entry_time, note, raw_text,
    status, idempotency_key, created_by, created_by_name
  ) VALUES (
    draft.organization_id, draft.type, draft.amount_paisa, valid_category_id,
    selected_account_id, draft.adjustment_dir, draft.business_date,
    draft.device_entry_time, draft.note, draft.raw_text, 'active',
    'draft-' || draft.id::TEXT, current_user_id, draft.created_by_name
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO posted_transaction;

  IF NOT FOUND THEN
    SELECT * INTO posted_transaction
    FROM public.transactions
    WHERE idempotency_key = 'draft-' || draft.id::TEXT
      AND organization_id = draft.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transaction draft could not be posted';
    END IF;
  END IF;

  DELETE FROM public.transaction_drafts
  WHERE id = draft.id
    AND organization_id = current_org_id;
  RETURN posted_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.post_transaction_draft(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_transaction_draft(UUID, UUID) TO authenticated;
