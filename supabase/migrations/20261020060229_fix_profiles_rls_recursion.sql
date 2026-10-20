-- Preserve profile ownership fields without recursively applying profiles RLS.
-- The SECURITY DEFINER helper reads the existing row as its owner and only
-- returns true for the currently authenticated user's unchanged identity.
CREATE OR REPLACE FUNCTION private.current_user_profile_identity_unchanged(
  p_profile_id UUID,
  p_organization_id UUID,
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS existing_profile
      WHERE existing_profile.id = (SELECT auth.uid())
        AND existing_profile.organization_id IS NOT DISTINCT FROM p_organization_id
        AND existing_profile.role::TEXT IS NOT DISTINCT FROM p_role
    );
$function$;

REVOKE ALL ON FUNCTION private.current_user_profile_identity_unchanged(UUID, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_user_profile_identity_unchanged(UUID, UUID, TEXT)
  TO authenticated;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    private.current_user_profile_identity_unchanged(id, organization_id, role::TEXT)
  );
