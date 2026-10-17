# Production rollout

This repository is being prepared for Vercel import. No Vercel deployment or live Supabase migration is performed by this guide.

## Before importing

1. Review the pending authorization migration under `supabase/migrations/`. It changes organization updates to owner-only, uses active `organization_members` rows for authorization, prevents sign-in from reactivating an inactive membership, scopes idempotent transaction-draft retries to the caller's shop, tightens function search paths, and removes unused anonymous draft write grants.
2. Verify the migration on a non-production Supabase project with owner, manager, cashier, inactive-member, cross-shop, and idempotent-retry cases. Apply it to the connected project only after the owner approves the exact SQL.
3. In Supabase Auth settings, enable leaked-password protection. Supabase currently offers this on Pro and higher plans. Configure the final Vercel Site URL and redirect URL allow-list after Vercel assigns the production domain.
4. Confirm all feature flags in `src/config/features.ts` remain disabled until their individual copy, behavior, and visual checks are complete.
5. Arrange a current encrypted backup in the owner's approved private storage. The GitHub backup workflow is manual, not scheduled.

## Supabase migration state

The connected project's migration ledger records `20261016094952` (`shop_pro_launch_baseline`) and `20261016122204` (`enforce_mfa_for_enrolled_users`). The baseline file in this repository was reconstructed from the archived incremental migrations because the original baseline SQL was absent. It has not been compared byte-for-byte with the original baseline applied to the connected project. Earlier individual migrations are retained in `supabase/migration-history/` for audit and local tests; do not apply those archived files to the connected project.

Before applying any migration, run `npx supabase migration list --linked` and compare the result with the project's dashboard. Test the reconstructed baseline on a new isolated project before using it to create a database. Review the pending authorization SQL and test it on staging first. Never use `db push` to work around a mismatch in migration history.

## Vercel configuration

Import the repository's `main` branch as a Vite app. Set the build command to `npm run build` and output directory to `dist`. Add these browser variables for the Vercel environments that should connect to Supabase:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use a publishable key only. Do not set a service-role key in Vercel. Follow `README.md` for the complete setup.

## Smoke checks after configuration

Use a test account and test shop for the first sign-in. Verify:

1. Sign-in, sign-out, session refresh, and MFA challenge for an account with an enrolled factor.
2. New-user profile/shop provisioning and existing-user login.
3. Ledger entry review, online posting, and confirmation that account balance and ledger entry update together.
4. Offline queue persistence, reconnect retry, and duplicate-safe retry behavior.
5. Editing, voiding/restoring, account selection, reports, CSV export, and settings.
6. A manager/cashier cannot update organization settings or access another shop's rows.

Do not use live customer entries for smoke tests.
