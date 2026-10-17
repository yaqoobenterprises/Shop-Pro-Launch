-- Require AAL2 for users who have enabled an authenticator factor.
-- Users without a verified factor retain the existing AAL1 access behavior.
-- This is restrictive so it combines with, rather than replaces, tenant policies.
DO $migration$
DECLARE
  target_table text;
BEGIN
  FOR target_table IN
    SELECT relation.relname
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relrowsecurity
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS require_aal2_for_enrolled_mfa ON public.%I',
      target_table
    );
    EXECUTE format(
      $policy$
        CREATE POLICY require_aal2_for_enrolled_mfa
        ON public.%I
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (
          array[(select auth.jwt()->>'aal')] <@ (
            select case
              when count(id) > 0 then array['aal2']
              else array['aal1', 'aal2']
            end
            from auth.mfa_factors
            where (select auth.uid()) = user_id
              and status = 'verified'
          )
        )
        WITH CHECK (
          array[(select auth.jwt()->>'aal')] <@ (
            select case
              when count(id) > 0 then array['aal2']
              else array['aal1', 'aal2']
            end
            from auth.mfa_factors
            where (select auth.uid()) = user_id
              and status = 'verified'
          )
        )
      $policy$,
      target_table
    );
  END LOOP;
END;
$migration$;
