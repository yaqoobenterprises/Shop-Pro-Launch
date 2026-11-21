# AQVORA historical Cashbook → ERP: implementation milestone A (read-only)

**Date:** 2026-11-21  
**Status:** Implemented local-only preflight; NOT an ERP migration, staging posting, Supabase backup or production release.  
**Tracks:** [Unified product PR #88](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/88) and [release coordination #89](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89).

## Founder requirement

AQVORA is one upgrade of Shop Pro, not two independent apps. Both historical legacy organizations are possible source namespaces. Their transaction IDs, categories, original text, voids, edits, payment accounts, transfers and offline queues must survive with provenance. Continue easy Cashbook input while gradually adopting real double-entry modules; eventually retire the Cashbook UI only after feature and data parity.

## What this Draft PR actually implements

- A deterministic, **local-only** CSV reader for the existing Shop Pro ten-column export. Handles BOM, quoted commas/newlines, CRLF, malformed data and duplicate primary keys; validates date/status/type and exact PKR minor units via BigInt.
- Deterministic source namespace + original UUID migration intent key; row SHA-256 and manifest SHA-256 for private source review; preserves source date, device time, text, authorship and void reason.
- Explicit migration review states: `quarantined_test_fixture`, `historical_void_preserve`, `missing_category`, `accounting_policy_review`, and `missing_authoritative_account_and_cash_evidence`.
- Aggregates counts, money by active/non-fixture type, months and exact-signature repeated transaction candidates. **Never automatically deduplicates or deletes.**
- `proposed_erp_journals: []`, `posting_allowed: false`, `bank_reconciled: false` intentionally: the CSV alone cannot authorize accounting postings, even for obvious-looking revenue.

## Private local use

```bash
node scripts/aqvora_legacy_csv_review.mjs \
  --csv "/secure/local/shop-pro-export.csv" \
  --source "legacy-shop-a" \
  --expected-count 415
```

Aggregate-only review JSON is printed to stdout; it contains no original text, author names or transaction IDs. To write the **private** detailed manifest, append `--out "/secure/outside-repo/cashbook-review.json"`. The output is created without overwrite (`wx`) and with owner-only permissions on supported operating systems. Never place it within the repository, upload it to PR comments, or expose it to unauthenticated hosting. The exported CSV itself also contains personal/business data and must stay private. Source counts may change if the user continues adding transactions.

Run isolated unit tests: `npx vitest run tests/aqvora_legacy_csv_review.test.ts`.

## Facts established from private source audit (not a migrated book)

- The owner confirmed two legacy organization scopes; one user's export has **415** transactions, with **395 active and 20 voided**, previously compared by selected normalized fields against the scoped live source. This CSV alone is **not a verified point-in-time database snapshot**.
- The other scope contains **1,000 explicit `shop_pro_pagination_test` fixtures** and one other entry. These tagged rows must be reviewed and quarantined; they must not inflate ERP turnover. Retain original records, do not delete.
- The active Cashbook amount is **not audited accrual profit**; there are cloud-only payment account IDs, legacy account ledgers, transfers, source audit rows and cloud drafts, plus device-only IndexedDB queued work. Those sources are NOT included in this CSV.
- Per-source organization keys remain distinct even if the founder approves a single target legal company. No mixing across companies without legal-entity approval and source-to-target audit mapping.

## Next implementable backend contract (Codex + accountant review)

1. **Source extraction snapshot (separate branch; SELECT-only):** obtain authorized scoped `transactions`, `payment_accounts`, `account_ledger_entries`, `account_transfers`, `audit_log`, `transaction_drafts`, `categories` and offline device queues; preserve original IDs, status changes and timestamps; verify backed-up restore. Do not collect private PII in public CI artifacts.
2. **Legal company + currency:** founder signs whether both organizations represent one legal business, PKR scale=2, fiscal period, approved source account mapping, real cash and independent UBL statements, duplicate-named wallet accounts and date boundary.
3. **Accountant-approved mapping:** source Cash receipt versus earned revenue vs customer advance, expense versus inventory, owner drawings, government/ticket pass-through and agency liabilities. Never infer income/revenue by sign alone.
4. **Controlled backfill on disposable staging:** map active, documented source economic events to immutable balanced journal lines via authorized server API; keys `(source_project,source_organization_id,source_type,source_id,revision)` unique; immutable reversals for corrections, not history deletion. Do NOT push raw CSV directly to V2 `journal_lines` tables or enable an existing company writer.
5. **Reconciliation and rerun:** every migrated journal debit = credit; compare snapshots, exact per-source net cash + signed/approved openings and transfer legs to target GL/TB; replay with lost ACK and changed-source detection. Fail on mismatch, unauthorized actor, missing statement, cash imbalance, period lock or source hash drift. Preserve existing 2-OWNER maker/checker control until independently approved.
6. **Rollout gate:** independent hosted Auth/RLS/AAL2 and backup/PITR/restore rehearsal, all devices offline queue/reconnect/old-PWA upgrade/rollback, final precise delta capture; founder approves staging then separately approves any production migration/merge.

**Not allowed:** auto-import, financial posting, modification of connected production Supabase projects, deploying migrations, merging to main, auto-closing old PRs, fabricated opening balances or public exposure of the private source CSV.

## Security notes

This utility cannot network or write databases. It is a local analysis tool, not an authorization boundary. Staging and eventual production migration MUST require tenant-specific backend RPC authorization, exact integer minor units, approved source evidence, secure receipt-based idempotency and immutable audit. The source CSV does not contain sufficient fields for that transition.
