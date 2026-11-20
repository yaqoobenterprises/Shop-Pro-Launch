# AQVORA staging-only Chart of Accounts + Fiscal Period read integration

**Branch:** `feat/aqvora-staging-admin-reader-20261120` stacked on frontend Draft PR #46. No backend/SQL changes. Codex Draft PR #44 (`0d1d0bf`) defines the RPC contract; it remains a **sibling** branch, not merged here.

## What changed

- A dedicated `Company books · staging` application route is available in desktop sidebar and mobile More menu **only** with two explicit read-only feature flags, a valid signed-in cloud company, and a separately named isolated Supabase project.
- `AqvoraStagingAdminView` binds authenticated organization/user identity to the typed read-only #45 client and fail-closed #46 Chart/Period presentation. It renders disabled, unauthenticated, loading, error/retry, and validated-data states.
- `loadAqvoraCompleteAdminReadSnapshot` follows `list_aqvora_accounts` code keyset and `list_aqvora_periods` start-date keyset, validates tenant IDs, exact BIGINT revisions, cursor progression and duplicates, and discards partial results after any error.
- Bounded max load is 5,000 accounts and 1,200 periods. At this cap, incomplete-page indicators remain true; no totals or balances are certified by this reader.
- No mutation RPCs are called. The separate illustrative finance demo remains sample-only.

## Staging configuration — not permitted against existing projects

Set these values **only in a verified separate isolated staging app configuration**:

```text
VITE_ENABLE_AQVORA_ADMIN_READS=true
VITE_AQVORA_ISOLATED_STAGING_REVIEW=true
VITE_AQVORA_STAGING_PROJECT_REF=<20-letter-isolated-project-ref>
VITE_SUPABASE_URL=https://<same-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<isolated-staging-publishable-key>
```

Do not use either existing business Supabase project. The UI refuses to expose this route when the URL does not exactly match the declared project ref or when the ref matches either existing business project. This frontend gate **does not replace** database RLS/permissions: server authorization, AAL2 and live session checks remain authoritative.

This PR does **not** enable the route in any environment, does not provision a staging project, and does not start migrations. Without a genuinely isolated project with the reviewed backend schema installed, the feature must remain OFF. It is not part of the sample preview and has no new Vercel preview URL.

## Important integration boundary

The backend RPC migrations #41/#42/#44 are **not present in this frontend branch**. They must be deliberately combined, including canonical #26/#30 and #31 offline-queue quarantine dependencies, on a separate reviewed integration branch. Never merge sibling Draft PR stacks independently into `main`.

Do not confuse an **administration listing** with a transactionally consistent certified General Ledger, Trial Balance, P&L or Balance Sheet. Multi-page reads can see concurrent admin changes. No V2 company enrollment, journals or period changes should be enabled until hosted disposable Auth/PostgREST, full backup/PITR, old-client fencing, legacy balance reconciliation and verified-source financial posting are signed off.

## Reviewer checks

- GitHub lint, TypeScript/strict, file-size, full tests and production build.
- Negative tests for production-project guard, cursor replay, tenant mismatch, malformed payload, stale session, >200 pagination and partial-read denial.
- Browser visual/accessibility review at 360/390/768/1024/1440, light/dark and keyboard, against founder Poital.flow reference.
- Cross-check the precise published #44 SQL RPC signatures and actual return JSON before staging.
