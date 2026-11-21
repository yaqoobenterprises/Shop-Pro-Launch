# AQVORA: One Product, Original Cashbook Fast Entry
Founder decision: 2026-11-21. Status: isolated UX review, NOT database migration or production activation.

## Product structure
ONE account session, ONE AQVORA workspace and ONE navigation. Retain Shop Pro's working Cashbook input (PRINT 300 / PAPER -2000), transaction history, categories, payment accounts, undo/edit/void and offline queue. These records must not be deleted.

Cashbook Overview and Cashbook Reports draw from the existing scoped ledgerService and show recorded activity. They are NOT certified V2 General Ledger, accrual profit or source-posted financial statements. The ERP Chart of Accounts, Journal Entry, GL/TB, Sales and Receipts sample review pages remain explicitly synthetic. Real secure V2 workflows require server-authorized staging and are not auto-enabled.

Existing legacy Overview, Reports, Accounts, Entries and LedgerMate code remains for rollback while the unified review hides duplicate menus. Existing LedgerMate is Cashbook-aware only, NOT a completed cross-ERP AI Copilot.

## Verified UI flow to test
The preview flag VITE_AQVORA_UNIFIED_WORKSPACE_PREVIEW=true starts within a single shell on the original authenticated Cashbook ChatView. Business Overview loads real existing LedgerDashboardView recorded activity. Cashbook Reports loads real LedgerReportsView source transactions. Other ERP review pages are labeled sample. Classic Cashbook exit remains available. This flag is forbidden in a production build until separately approved.

## Critical data boundary and future migration (NOT DONE)
Legacy financial rows use amount_paisa, Cashbook account balances, date/status, offline drafts and transaction IDs. V2 needs approved company currency precision, immutable balanced journals, authorized CoA, fiscal year, source idempotency, approvals and certified posting records. Copying legacy rows directly as ERP journals or showing old balance as a verified V2 TB is incorrect.

Migration acceptance steps:
1. Complete backup of scoped legacy cloud AND device IndexedDB records, transaction statuses, payment accounts, offline receipts/queues, category mapping and account balances.
2. Read-only Cashbook source adapter for a unified dashboard. Visibly separate Cashbook-recorded amounts from V2-posted amounts; never double count or silently replace missing fields with zeros.
3. Founder/accountant approval of company unit scale, mapping to CoA, cutover timestamp, opening balances, cash/bank reconciliation and unknown-category exception handling.
4. Authorized idempotent backfill with immutable audit IDs only after an independent verification of dates, reversals, source IDs, currency values and cash/bank opening totals.
5. Simulate upgrade of existing installed PWA and offline queue, sync/retry, rollback, physical backup/restore and history checks before any change to real live business companies.

## Founder is currently the only user
That does not justify bypassing the V2 independent checker requirement. The existing maker/checker workflow needs a distinct real authorized reviewer for specific controlled receipts. A future explicitly audited single-owner flow requires a separate design and accounting decision; it is not currently enabled.

## Release gates
Exact merged commit CI, preview in browser at mobile/desktop dark/light and keyboard, backup/rollback proof, no false labels, isolated hosted Auth/E2E, owner/accountant approval of policies. Production writer/SQL migrations and merge to main remain forbidden without explicit founder approval.
