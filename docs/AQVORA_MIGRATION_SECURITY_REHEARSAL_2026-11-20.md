# AQVORA V2 migration and security rehearsal

**Status:** integration preparation only. This branch contains no production deploy, customer data change, or frontend change. It is stacked on Draft PR #41 and remains Draft.

## Reviewed dependencies and overlap

| PR | Dependency and integration decision |
| --- | --- |
| #23 | Legacy draft lost-response fix; base of #29. Keep one stable draft identity during retry. |
| #29 | Depends on #23; replaces unsafe offline receipt upsert. No SQL overlap with this branch. |
| #26 | Canonical membership and tenant scope for legacy draft RPC. Its changes to pending `20261017062800_launch_authorization_hardening.sql` are included here. This file is not in the last documented production migration ledger. |
| #30 | Depends on #26; adds `20261120054717_close_financial_authorization_gaps.sql` to close legacy MFA, demotion and account-balance privileges. Included here after #26. It replaces `ensure_my_profile` and `post_transaction_draft` definitions introduced by #26 and narrows `payment_accounts` UPDATE grants. |
| #31 | Depends on #30; quarantines legacy balance snapshot upserts so #30's grant change does not silently lose queued data. It has no SQL overlap but is an operational prerequisite to releasing #30. Not copied into this database-only branch. |
| #38 | Headless V2 chart, exact-money preview and read model; base of #41. No SQL writer. |
| #41 | V2 writer, enrollment gate, immutable journal, receipts and reversals. Its three migrations are included through branch ancestry. These use new `aqvora_` tables and RPCs; they do not replace #26/#30 legacy functions. |

Safe conceptual order: **#26 → #30 → #31** for legacy authorization and sync, **#23 → #29** for legacy replay, and **#38 → #41 → this branch** for V2. Before enabling any real company, combine these reviewed stacks in a separate integration branch and reconcile queued balances and old-client writes. Do not merge overlapping older bundles that reintroduce prior retry behavior.

SQL timestamps place V2's `20261120010000`–`010200` files before #30's `20261120054717`. This is syntactically compatible in the disposable tests because V2 checks canonical `organization_members` directly and #30 affects legacy functions and grants. The operational release gate still requires #26 and #30 to be effective before V2 enrollment. The older #26 migration is pending in the last documented hosted ledger despite its October filename; filename order alone is not a safe production apply plan.

## What the disposable tests prove

`tests/aqvora_migration_reconciliation.test.ts` creates two fresh PostgreSQL 17 databases in CI. One applies every current migration by timestamp. The other applies the six versions last documented as deployed, then pending #26, LedgerMate history, V2 and #30. Every file runs in a transaction. Both variants assert the same expected migration set, canonical role helper, protected balance columns, private writer grants, empty V2 enrollment, and a synthetic authorized V2 posting. An injected failing transaction proves that a partial table is rolled back. Existing #26/#30 PGlite suites provide more detailed legacy role, MFA and retry coverage. The separate #41 PostgreSQL job covers independent-session posting races.

The fixture uses real PostgreSQL roles and locks but **stubs** `auth.uid()` and `auth.jwt()`. It does not run GoTrue, PostgREST, real MFA challenge/refresh, OAuth, or Supabase's hosted migration ledger. The local Supabase CLI could not inspect a stack because Docker and Podman were unavailable. The connected Shop-Pro-Launch project has no development branch; it was never used as staging or for test writes.

## Required real Supabase staging matrix

Use only a verified isolated, disposable Supabase project or local stack with test accounts and no customer rows. Record project ref, schema hash, migration ledger, Auth settings and PostgREST version before testing. Run real sign-in and MFA challenge for owner, manager, cashier, inactive and demoted users in two companies. Test AAL1 denial and AAL2 allowance, then sign out/revoke the session and verify stale-token posting and receipt lookup fail. Attempt direct INSERT/UPDATE/DELETE on V2 financial tables and balance columns, anonymous RPC execution, private definer execution, guessed cross-company receipt and journal reads, foreign account IDs, and changed idempotency payloads. Use two independent authenticated HTTP clients to race posting with disablement, role change, account deactivation, period closure and reversal. Verify one journal, one receipt and the expected audit/line totals after lost responses. No result from the synthetic tests substitutes for this matrix.

## Backup, rollback and recovery rehearsal

1. Freeze the exact reviewed migration set, approval and order. Capture full schema, grants, RLS policies, functions, migration ledger and row counts. Back up the **database**, including `auth`, `public`, V2 tables and migration history, to encrypted owner-approved storage. Preserve device offline queues separately. The repository's `scripts/backup_database.ts` has a fixed legacy table list and **does not cover V2**; `scripts/restore_database.ts` intentionally cannot restore a full archive through REST. Do not treat that workflow as a V2 recovery plan.
2. Restore the backup to a newly isolated target. Apply pending migrations there in the recorded order. Compare schema objects, privilege matrices, row counts, checksums and `(organization_id, intent_key)` receipt uniqueness before and after. Exercise an existing receipt retry and a closed-period denial. Prove old offline queues are retained and no balancing journal is invented to cover a discrepancy.
3. Inject a migration failure on the disposable target, verify transaction rollback and ledger consistency, then rerun from the unchanged backup. Record restore time, point-in-time recovery window, responsible operators and sign-off. A successful SQL test alone is not a backup/restore drill.
4. If a release fails before enrollment, keep V2 disabled and use a reviewed forward correction or restore into a new isolated target. Do not run `db push` to conceal out-of-order history. If any V2 journal has posted, never drop or rewrite immutable history; stop new enrollment, preserve receipts and audit, restore with a verified tail/PITR plan, and reconcile every intent before traffic moves. Release requires explicit owner approval after the staging evidence and offline balance inventory are reviewed.

No production migration, merge, company enrollment or customer posting is authorized by this document.
