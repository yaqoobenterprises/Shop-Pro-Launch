-- Proposal only: this migration has not been applied to Supabase.
-- Require the OWNER recorded in shop_members for changes to an organization row.
--
-- Impact analysis:
-- - Organization reads and all other table policies are unchanged.
-- - OWNER updates continue; MANAGER and CASHIER updates are filtered by RLS.
-- - No table, column, or business data is changed.
--
-- Preconditions: the private schema, auth.uid(), and public.shop_members
-- (organization_id, user_id, role) are present.

CREATE FUNCTION private.is_shop_owner(target_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shop_members AS member
    WHERE member.organization_id = target_org
      AND member.user_id = (SELECT auth.uid())
      AND member.role = 'OWNER'
  );
$$;

REVOKE ALL ON FUNCTION private.is_shop_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_shop_owner(UUID) TO authenticated;

DROP POLICY IF EXISTS organizations_update ON public.organizations;

CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (private.is_shop_owner(id))
  WITH CHECK (private.is_shop_owner(id));

-- Rollback SQL (run only if reverting this proposal):
-- DROP POLICY IF EXISTS organizations_update ON public.organizations;
-- CREATE POLICY organizations_update ON public.organizations
--   FOR UPDATE TO authenticated
--   USING (id IN (SELECT org_id FROM private.get_auth_user_org_ids()))
--   WITH CHECK (id IN (SELECT org_id FROM private.get_auth_user_org_ids()));
-- DROP FUNCTION IF EXISTS private.is_shop_owner(UUID);
--
-- Test plan in an isolated staging/local database:
-- 1. Verify an OWNER can update an organization field.
-- 2. Verify MANAGER and CASHIER updates affect zero rows.
-- 3. Verify an owner from a different organization cannot update this row.
-- 4. Verify SELECT access and the regional-settings guard remain unchanged.
-- 5. Verify rollback restores the prior member-scoped update policy.
