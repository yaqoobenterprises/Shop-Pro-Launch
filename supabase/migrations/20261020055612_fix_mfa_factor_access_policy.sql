-- Keep the enrolled-factor AAL2 guard without granting clients access to
-- auth.mfa_factors, which contains private authentication-factor data.
CREATE OR REPLACE FUNCTION private.current_user_meets_mfa_requirement()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_user_id UUID := (SELECT auth.uid());
  current_aal TEXT := (SELECT auth.jwt() ->> 'aal');
  has_verified_factor BOOLEAN;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors AS factor
    WHERE factor.user_id = current_user_id
      AND factor.status = 'verified'
  )
  INTO has_verified_factor;

  IF has_verified_factor THEN
    RETURN current_aal = 'aal2';
  END IF;

  RETURN current_aal IN ('aal1', 'aal2');
END;
$function$;

REVOKE ALL ON FUNCTION private.current_user_meets_mfa_requirement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_user_meets_mfa_requirement() TO authenticated;

-- Replace the direct auth.mfa_factors subquery in every affected public-table
-- policy with the private helper. The helper runs as its owner and only checks
-- the currently authenticated user's factor and AAL claim.
DO $migration$
DECLARE
  target_table TEXT;
BEGIN
  FOR target_table IN
    SELECT relation.relname
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relrowsecurity
      AND EXISTS (
        SELECT 1
        FROM pg_policy AS existing_policy
        WHERE existing_policy.polrelid = relation.oid
          AND existing_policy.polname = 'require_aal2_for_enrolled_mfa'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY require_aal2_for_enrolled_mfa ON public.%I',
      target_table
    );
    EXECUTE format(
      $policy$
        CREATE POLICY require_aal2_for_enrolled_mfa
        ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING ((SELECT private.current_user_meets_mfa_requirement()))
        WITH CHECK ((SELECT private.current_user_meets_mfa_requirement()))
      $policy$,
      target_table
    );
  END LOOP;
END;
$migration$;
