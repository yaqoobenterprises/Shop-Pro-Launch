-- Preserve existing server-side access to the compatible invoker RPCs.
-- service_role already had EXECUTE on these public RPCs before this release.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.get_auth_user_org_ids() TO service_role;
