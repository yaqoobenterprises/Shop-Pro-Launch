# Production rollout

Shop Pro is connected to production Vercel and Supabase. This guide records the verified rollout state and the checks required before changing the live database. No live migration is performed by this guide.

## Before production changes

1. Review the pending authorization migration under `supabase/migrations/`. It updates organization authorization and tightens transaction-draft access; do not apply it until the owner approves the exact SQL.
2. Verify the migration on a non-production Supabase project with owner, manager, cashier, inactive-member, cross-shop, and idempotent-retry cases. Apply it to the connected project only after the owner approves the exact SQL.
3. In Supabase Auth settings, enable leaked-password protection if the project plan supports it. The security advisor reported this setting disabled on 2026-11-17. Verify the Site URL and redirect allow-list include the production domain.
4. `chatQueries` (LedgerMate AI) is enabled in `src/config/features.ts`; region settings, Urdu, and alternate entry modes remain staged off. Keep these flags aligned with their rollout checks.
5. Arrange a current encrypted backup in the owner's approved private storage. The GitHub backup workflow is manual, not scheduled.

## Supabase migration state (verified 2026-11-17)

The connected project's migration ledger records:

- `20261016094952` — `shop_pro_launch_baseline`
- `20261016122204` — `enforce_mfa_for_enrolled_users`
- `20261020055612` — `fix_mfa_factor_access_policy`
- `20261020060229` — `fix_profiles_rls_recursion`
- `20261116195744` — `ai_accountant_chat_sync`
- `20261116195839` — `ai_accountant_chat_sync_indexes`

Two checked-in migrations are pending: `20261017062800_launch_authorization_hardening.sql` and `20261117054753_ledgermate_multi_conversation_history.sql`. The first addresses verified organization authorization, draft retry scoping, inactive membership, anonymous draft grants, and security-definer search paths. The second removes the one-conversation-per-user/organization uniqueness constraint and adds a history index; it preserves existing chat rows and RLS. Neither migration has been applied to production.

The baseline file in this repository was reconstructed from archived incremental migrations and has not been compared byte-for-byte with the connected project's original baseline. Earlier individual migrations are retained in `supabase/migration-history/` for audit and local tests; do not apply those archived files to the connected project. Before applying any migration, compare `npx supabase migration list --linked` with the dashboard, test on an isolated staging project, and review the exact SQL. Never use `db push` to work around migration-history drift.

## Vercel configuration (verified 2026-11-17)

The `shop-pro-launch` project is Git-linked to `yaqoobenterprises/Shop-Pro-Launch`, uses the Vite framework, and runs on Node 24. The production deployment for `main` is READY and the production URL returns HTTP 200. Vercel SSO protects the feature preview; the preview responds with a redirect to SSO.

The production and preview environments have `VITE_SUPABASE_URL` and the legacy public `VITE_SUPABASE_ANON_KEY`. The server-only `GROQ_API_KEY` is configured for production only, so the AI health check will report offline on preview deployments. Add a preview-scoped Groq key only when preview AI testing is needed.

The connected Supabase marketplace integration also provisions production-only database and Supabase server-secret variables in Vercel. The Vite app and `/api/ai-chat` use the Supabase URL, publishable/anon key, and Groq key; they do not use direct database credentials or a service-role/secret key. Confirm no other Vercel function depends on these extra privileged variables, then remove them from Vercel and keep the backup service-role key in GitHub Actions only.

Vercel password protection is off; project SSO protection is enabled for deployments except custom domains. Check the intended access policy before changing protection settings. The production domain is public and returned HTTP 200 during this review.

The Vercel project uses `vercel.json` with the Vite framework, `npm run build`, and `dist` output. The browser Supabase variables are:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use a publishable key only in browser variables. Do not put service-role or secret keys in any `VITE_` variable. Follow `README.md` for the complete setup.

## Smoke checks after configuration

Use a test account and test shop for the first sign-in. Verify:

1. Sign-in, sign-out, session refresh, and MFA challenge for an account with an enrolled factor.
2. New-user profile/shop provisioning and existing-user login.
3. Ledger entry review, online posting, and confirmation that account balance and ledger entry update together.
4. Offline queue persistence, reconnect retry, and duplicate-safe retry behavior.
5. Editing, voiding/restoring, account selection, reports, CSV export, and settings.
6. A manager/cashier cannot update organization settings or access another shop's rows.

Do not use live customer entries for smoke tests.
