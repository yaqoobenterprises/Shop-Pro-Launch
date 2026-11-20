# Legacy payment account sync quarantine — 20 November 2026

**Status: DRAFT; NOT A DEPLOYMENT APPROVAL.**

## Problem

The older SQLite `syncEngine` sends a full `payment_accounts` row through PostgREST UPSERT for both queued INSERT and UPDATE operations. The full row may contain `current_balance` and `opening_balance` snapshots. Replaying an old snapshot is not a financial journal movement, and can clobber balances posted more recently. The authorization restriction in #30 intentionally prevents ordinary clients from updating those columns, so the old queue would otherwise exhaust retry attempts and be marked failed.

## Focused safeguard

- Stop `payment_accounts` INSERT/UPDATE items containing either balance column *before* any remote UPSERT.
- Preserve their original pending queue records, payloads and retry counts; report the need for reconciliation through the sync error. Existing pull-side collision checking preserves the local row for pending IDs.
- Leave ordinary metadata-only account sync and other table operations on their existing paths.
- Add focused tests for zero/nonzero snapshots and a seven-attempt pending item.

## Not solved by this PR

- Balance reconciliation has **not** been designed or approved. The queued records will remain blocked and must not be manually discarded.
- A metadata-only UPSERT could still be an inappropriate write for a non-existing account; metadata-only account updates deserve their own review before release.
- This guard does not cover the separate IndexedDB offline account operation path, account transfer ordering, historical split-book expenses, or any database cutover.
- No real Supabase staging/Auth/MFA test or production migration was performed.
- Do not enable the new finance restrictions, merge this stacked branch or cut over accounts until the migration plan in PR #30 is rehearsed with preserved local queues, balances and a backup/restore drill.

## Follow-up

Build a read-only reconciliation inventory of all per-shop account rows and pending balance updates, compare them against authoritative cloud receipts, and design a signed-off accounting migration that retains source evidence and avoids invented postings. Then replace the old UPSERT with explicit account metadata updates and an idempotent, server-authorized financial posting path.
