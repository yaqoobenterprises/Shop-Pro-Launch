# Cleanup record

This launch-preparation pass removed only files that had no current app or tooling references.

## Deleted files

| Path | Reason |
| --- | --- |
| `scripts/generate-icons.cjs` | Generated Tauri icon files under the absent `src-tauri/icons/` directory and had no caller. The PWA icon generator remains available as `npm run icons:generate`. |
| `RELEASE.md` | Described a Windows Tauri release whose `src-tauri` project is not present; the supported release path is documented in `README.md` for Vercel. |
| `src/assets/logo.svg` | No imports or runtime references; the app uses `public/assets/logo.svg`. |
| `src/assets/owner-avatar.png` | No imports or runtime references. |
| `public/assets/owner-avatar.png` | No runtime references; it was a duplicate copy of the unused source avatar. |

## Removed direct dependencies

- `recharts` and its unused vendor chunk were removed after confirming that no application code imports the chart library. Dashboard tests cover the active HTML based summaries and month trend.
- The direct `@tauri-apps/api` entry was removed because the app does not import it; the installed `@tauri-apps/plugin-sql` package declares its own API dependency.

## Migration files moved, not deleted

The project's database ledger records a squashed baseline at `20261016094952`, but the earlier individual SQL files were still in the active migrations directory. To prevent Supabase CLI from treating those older versions as unapplied, they were retained under `supabase/migration-history/` and reconstructed into the baseline file. PGlite tests still use the archived originals.

- `20260918000000_initial_schema.sql`
- `20260919000000_harden_rls_and_auth.sql`
- `20260920000000_lock_down_rls_policies.sql`
- `20260920001000_add_fk_indexes_and_split_member_policies.sql`
- `20260920002000_move_rls_helper_to_private_schema.sql`
- `20260920003000_repair_signup_profile_provisioning.sql`
- `20260921000000_role_authorization_and_integrity.sql`
- `20260921001000_local_integrity_indexes.sql`
- `20260921002000_add_avatar_url_and_profile_sync.sql`
- `20261004000000_shop_ledger_foundation.sql`
- `20261004001000_sale_items_created_at.sql`
- `20261004002000_repair_shop_member_provisioning.sql`
- `20261004003000_account_balances_and_postings.sql`
- `20261004004000_transaction_drafts.sql`
- `20261004005000_tenant_scoped_category_aliases.sql`
- `20261004006000_repair_shop_provisioning.sql`
- `20261004007000_transaction_integrity_and_authorization.sql`
- `20261011000000_allow_account_overdraft_and_resilient_drafts.sql`
- `20261014000000_regional_settings.sql`

The owner-only update proposal was moved to `supabase/migration-history/proposals/`; it was not applied to the connected project. Its policy change is incorporated into the pending launch authorization migration.
