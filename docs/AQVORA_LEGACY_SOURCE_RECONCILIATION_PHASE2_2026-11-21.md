# AQVORA — legacy source accounting reconciliation, Phase 2

Date: 2026-11-21. Status: **read-only, synthetic tests, no V2 historical import.**

## Why this exists
AQVORA is the upgraded Shop Pro. **Two founder-named business sources** require review, but a live read-only audit found **four distinct source organization UUIDs** behind those display names: one active source under the first name and three under the second name. Every UUID is an independent source partition. Their records cannot be silently treated as a single authorized legal-entity book. Original Cashbook activity (including revisions, voids and pending/offline entries) remains preserved. The end state is immutable, properly authorized and balanced V2 double-entry, not renaming the legacy `account_ledger_entries` table into a General Ledger.

This Draft branch builds on [#90](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/90), which in turn builds on [#88](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/88). Follow [release issue #89](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89). **Do not individually merge this child into main.**

## Implemented: local-only source parity utility
`scripts/aqvora_legacy_source_reconcile.mjs` takes a **private, manually exported, per-organization, consistent** JSON source snapshot and checks:

- Cross-tenant IDs, duplicate PKs, canonical integer minor units (PostgreSQL `bigint::text`) and major-unit decimal text (`numeric::text`); incomplete source collections are fatal.
- Active income/expense/capital/withdrawal signed Cashbook movement, voided zero net, reversal/edit repost chains and required audit linkage.
- Account-ledger postings tied to original transaction, transfer or opening source; orphan account, transaction, transfer or category links are rejected.
- Exact payment-account `balance_paisa` vs ledger signed-sum and decimal `current_balance`; `opening_balance` vs posted OPENING_BALANCE entries.
- Transfer source amount vs precisely one TRANSFER_OUT and one TRANSFER_IN in their corresponding accounts, with equal and opposite minor amounts; non-active transfers fail closed pending reversal policy.
- Total account balance less opening equals recorded active Cashbook movements. Pending cloud drafts stay excluded. Duplicate account names and explicitly tagged pagination fixtures are surfaced but never deleted.
- SHA-256 of the complete sorted private snapshot content, review exceptions, aggregate summary, **no ERP journal creation**. This is an integrity check on an obtained snapshot, not a database backup or proof of external bank settlement.

A success result is named **SOURCE_RECONCILED_NOT_ERP_MIGRATED**; even then `erp_posting_allowed=false` and `external_bank_cash_evidence_verified=false`.

## Snapshot data contract (PRIVATE, source-authorized, read-only)
Only from a server-authorized **single tenant** and a consistent snapshot. JSON has:

```json
{
  "schema_version": 1,
  "organization_id": "<source-organization-uuid>",
  "currency": "PKR",
  "transactions": [],
  "payment_accounts": [],
  "account_ledger_entries": [],
  "account_transfers": [],
  "audit_log": [],
  "transaction_drafts": [],
  "categories": []
}
```

Arrays must contain **all** rows in that source organization, not filtered samples or the 10-column user CSV. Cast `amount_paisa`/`balance_paisa` and all other `BIGINT` money fields as exact text. Cast `current_balance`, `opening_balance`, and transfer `amount` as decimal text. Preserve source UUIDs, original idempotency keys, category/account links, status, change history, void reasons and dates. Do **not** export auth tokens, passwords, service role keys or full auth.users data. The collector must authenticate and authorize tenancy separately and enforce RLS (or an independent authorized audit export), not rely on client-provided org IDs.

For private analysis of a validated snapshot, outside the Git repository:
```bash
node scripts/aqvora_legacy_source_reconcile.mjs \
  --snapshot "/private/legacy-source-1.json" \
  --source "source-company-1" \
  --expect-transactions 415 \
  --out "/private/legacy-source-1-reconciliation.json"
```
Only aggregate counts/totals/checksum print to stdout. The optional detailed file includes source record IDs and stays private: owner-only permissions where supported, never overwrite an existing file. Non-reconciled snapshots exit nonzero. Repeat independently for **every actual organization UUID** using distinct source keys and private snapshots, not one merged JSON. Snapshot identity, not the visible company name, controls tenancy.

## Existing source evidence (read-only; not a migration)
The connected legacy project was queried read-only: the Cashbook *transaction cash movements* reconcile to its legacy account ledger for the two UUID-scoped organizations containing transactions with 0 per-transaction signed discrepancies. **Two additional UUID-scoped organizations share the second display name but have no transaction rows; one has nonzero opening-account balances. These are separate source partitions, and their balances must not be automatically combined.** This is separate from independent cash count and bank statement reconciliations. The user has a 415-row private CSV that lacks account IDs, transfers and audit source detail. The other source contains 1,000 source-text-tagged pagination test rows; they are quarantined from future economic statement totals pending founder signoff. Never publish raw data or personally identifying fields in GitHub.

## Remaining stop gates for actual ERP migration
1. **Private full snapshots and independent recovery:** cloud DB logical + physical/PITR restore evidence, device IndexedDB offline queue backup, PWA upgrade and pending intents.
2. **Snapshot consistency:** same transaction boundary and version for source rows and ledger rows, with rerun/drift detection while user continues creating transactions; no unguarded extraction over multiple changing table states.
3. **CoA and legal accounting policy:** founder/accountant approval of source→target company, account/currency precision, opening cash and UBL bank statement, fiscal periods, service revenue vs ticket/stamp agency, inventory vs expenses, owner drawings and unknown categories.
4. **Codex backend-only authorized staged writer:** a separate migration-specific immutable source evidence table and idempotency tuple `(source_project_id, source_org_id, kind, source_id, revision)`; no inference from `+/-` sign alone; maintain historical reversal chain; server rights, AAL2/roles, atomic debit=credit and auditable receipt on loss of ACK.
5. **Staging dry-run:** only on explicitly approved disposable Supabase environment, never on existing projects; replay and restore, controlled source cutoff, synthetic concurrency and isolation; compare source movements plus approved openings to target GL/TB and report unknown/unmigrated items.
6. **Release/PR hygiene:** main untouched until signed-off exact-SHA CI, protected hosted QA, installed-device offline QA, restore proof and founder release authorization.

**Non-goals of this Draft:** direct Supabase connection, source data extraction/backup, production schema changes, posting any journal, changing Cashbook runtime, auto-merging companies or opening a new paid resource.
