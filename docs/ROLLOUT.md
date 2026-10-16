# Release checklist

This checklist keeps database and feature changes staged. The agent must not apply migrations to a remote Supabase project or deploy to Vercel during this work.

## 1. Backup

1. Run a current manual backup: npx tsx scripts/backup_database.ts
2. Validate the resulting archive offline: npx tsx scripts/restore_database.ts --validate-only <archive-path>
3. Keep the archive in the owner's approved secure storage.

## 2. Database

Apply only migrations missing from the target project's migration history. Use a staging project first, then have the owner review and apply the approved SQL. Do not reapply a migration that is already recorded.

For a new project, apply these files in filename order:

- supabase/migrations/20260918000000_initial_schema.sql
- supabase/migrations/20260919000000_harden_rls_and_auth.sql
- supabase/migrations/20260920000000_lock_down_rls_policies.sql
- supabase/migrations/20260920001000_add_fk_indexes_and_split_member_policies.sql
- supabase/migrations/20260920002000_move_rls_helper_to_private_schema.sql
- supabase/migrations/20260920003000_repair_signup_profile_provisioning.sql
- supabase/migrations/20260921000000_role_authorization_and_integrity.sql
- supabase/migrations/20260921001000_local_integrity_indexes.sql
- supabase/migrations/20260921002000_add_avatar_url_and_profile_sync.sql
- supabase/migrations/20261004000000_shop_ledger_foundation.sql
- supabase/migrations/20261004001000_sale_items_created_at.sql
- supabase/migrations/20261004002000_repair_shop_member_provisioning.sql
- supabase/migrations/20261004003000_account_balances_and_postings.sql
- supabase/migrations/20261004004000_transaction_drafts.sql
- supabase/migrations/20261004005000_tenant_scoped_category_aliases.sql
- supabase/migrations/20261004006000_repair_shop_provisioning.sql
- supabase/migrations/20261004007000_transaction_integrity_and_authorization.sql
- supabase/migrations/20261011000000_allow_account_overdraft_and_resilient_drafts.sql
- supabase/migrations/20261014000000_regional_settings.sql

The regional migration and the owner-only organization update proposal have synthetic PGlite coverage. This does not replace a staging comparison. The audit inspected live Supabase metadata read-only; it did not fetch business rows or apply database changes.

The follow-up migration `supabase/migrations/20261016074319_owner_only_organization_updates.sql` is proposal-only and is not part of the migration sequence above. In staging, verify that an OWNER can update organization settings, MANAGER and CASHIER cannot, another shop's owner cannot update the row, and existing reads still work. Review and approve the SQL before applying it to a shared project.

## 3. Deploy with current defaults

1. Keep regionSettings, languageUr, entryModes, and chatQueries false in src/config/features.ts.
2. Deploy the review branch to a Vercel preview.
3. Verify sign-in, PIN unlock, Chat entry review, online posting, offline queue recovery, void and restore, Overview, Reports, Accounts, Settings, and CSV export.
4. Compare a PKR shop's existing amounts and business dates with the previous release.
5. Enable production only after the owner confirms the preview, repository branch, environment variables, backup, and migration history.

## 4. Feature flags

The order after each feature is complete and separately verified is:

1. regionSettings
2. languageUr
3. entryModes
4. chatQueries

These capabilities are not all release-ready in this branch. Urdu copy needs a native-speaker review and RTL needs visual checks. Standard/Both must cover every supported ledger type through the shared review and posting path. chatQueries is not implemented. Keep those flags false until the work log blockers are closed.

After enabling one flag, repeat the relevant verification steps before enabling the next. Roll back a feature by setting its flag false and redeploying.

## 5. Known limitations

- Currency formatting supports two-decimal currencies only.
- PKR display can round fractional paisa to whole rupees in existing screens.
- Landing and authentication copy are not fully localized.
- The UI has not been screenshot-verified at 360, 768, and 1280 pixels in light, dark, English, and Urdu because the in-app Browser service was unavailable.
- Negative account balances are currently allowed.
- Full live-schema parity and midnight/DST behavior have not been verified against the production project.
