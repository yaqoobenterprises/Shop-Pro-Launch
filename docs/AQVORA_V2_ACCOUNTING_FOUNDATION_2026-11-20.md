# AQVORA V2 — headless accounting foundation

**Status: isolated, non-posting code; 20 November 2026.** This is NOT the production journal engine, database migration, General Ledger UI, or complete ERP.

## Purpose
The existing Shop Pro cashbook (`src/services/ledgerService.ts`) records one-sided income, expense, capital, withdrawal and adjustment events. A true accrual accounting system needs immutable **double-entry** journals and one authoritative company-scoped financial writer. A cashbook operating result is not an accrual profit statement.

This PR introduces a **separate exact-math domain library** under `src/accounting/`, with NO import into existing transaction posting, account balances, sync, Auth, reports, or Supabase. It is a safe contract for future independently authorized readers and SQL posting.

### Included implementation

| File | Actual behavior | Explicit limits |
| --- | --- | --- |
| `types.ts` | Company-scoped Chart of Accounts, journal draft, posted journal, report snapshot and statement shapes; money as minor-unit strings | Interfaces do not authenticate actors |
| `minorUnits.ts` | Canonical decimal integer parser and exact BigInt sums bounded to signed BIGINT | Not tax/FX/price decimal logic |
| `chartOfAccounts.ts` | Unique company account codes/IDs, valid parent types, no hierarchy cycles, active posting leaves, party/open-item and stock source dimensions | Archiving and server account mutations not implemented |
| `journalPreview.ts` | Fails closed on missing intent, cross-company/currency, closed or mismatched period, missing/duplicate lines, negative/two-sided entries, missing dimension and any imbalance of one minor unit | `canSubmitForServerReview` only allows a request to the future server; **never** means authorized or posted |
| `financialSnapshot.ts` | Revalidates posted journals, rejects duplicate intent/source IDs, derives exact Trial Balance and as-of income/earnings/B/S; includes all effective reversals; keeps archived posting leaves readable | Caller must be an authorized *complete* server source. `sourceComplete: true` is a server trust contract, not client proof or snapshot completeness certification |

## Verified arithmetic fixture from the proposed architecture

An isolated company, no tax or opening balances:

1. Buy 3 units of inventory at Rs 60 per unit on vendor credit: Dr Inventory 180, Cr Payables 180.
2. Sell 2 units for Rs 100 each on customer credit: Dr Receivables 200, Cr Sales 200.
3. Issue the goods: Dr Cost of Sales 120, Cr Inventory 120.
4. Collect Rs 80: Dr Bank 80, Cr Receivables 80; **no second sale**.
5. Pay the vendor Rs 60: Dr Payables 60, Cr Bank 60; **no second expense**.

Expected closing: Bank 20, Receivables 120, Inventory 60, Payables 120, Revenue 200, COGS 120, Earnings 80. Trial Balance closing debits 320 = credits 320. Assets 200 = liabilities 120 + unclosed earnings 80. *Totals in tests are exact integer paisa.*

Test coverage must also include multiple companies, duplicate intent, one-paisa imbalance, contra accounts, reversed postings, partial-date reporting, source incompleteness, exact upper limits and transfer neutrality.

## Mandatory next work for Codex (security/DB, not this PR)

1. Reconcile PRs #26/#30 full-schema canonical role and MFA fixes with production migration order; separately provision real isolated Supabase staging. **No production SQL yet.**
2. Approve Chart of Accounts hierarchy, expense/revenue classes, reporting-role mappings, source dimensions, industry modules, tax/currency/fiscal policy and account code conventions; validate compatibility with legacy financial account history.
3. Implement scoped PostgreSQL tables, constraints, immutable posted lines and linked reversal/audit model. Composite (`organization_id, id`) keys, unique (`org, code`) account, unique (`org, intent`), period lock and statement snapshot lifecycle. No unauthorized reads of any table/RPC.
4. Make server-owned **preview → confirm → post → lookup receipt → reverse** one serializable/locked transaction path. Bind hash/fingerprint, actor identity, active membership, MFA `aal2`, fiscal period, currency and stable payload. Verify original receipt on network ACK loss; never retry by overwriting a posted receipt.
5. Replace legacy cloud sync/Quick Expense split-book and account-balance mutation paths with audited migration gates and a single writer; require explicit backup/restore, before/after ledger reconciliation and old-client fencing.
6. Implement authorized paginated posted-journal readers with a trustworthy complete as-of snapshot marker; compare server totals to the **headless formulas** in this PR. Do not allow arbitrary browser callers to assert `sourceComplete: true` and call a report authoritative.
7. Only then create real, feature-gated Journal/Chart/GL/Trial Balance/Balance Sheet and Income Statement UI (with drill-through and complete/partial/permission/error states). AR/AP, Inventory and Payroll follow on the same writer.

## Financial rules that must never be faked
- No opening clearing plug to balance an unknown difference.
- No posting to headings, archived accounts or cross-company financial accounts.
- No double-counting a journal after a reversal; the original **and** its reversing journal stay in the source.
- No floats or `Number()` on incoming minor-unit money.
- Every GL figure must identify its company, currency, source, as-of date and completeness.
- Empty and zero are distinct from incomplete/unavailable.
- **Balance-sheet virtual earnings** currently cover all posted periods represented in the snapshot. A period-comparison P&L requires an explicit interval reader and closing-policy decisions; the module does not claim period reporting.
- An arithmetic-balanced journal or TB does not prove accounting classification, correct tax or authorization.

## PR review checklist
- Unit tests, TypeScript, strict checks, lint, file-size checks, dependency audit, build.
- SQL and Auth tests absent by design; flag this as a release blocker, not green production assurance.
- Draft PR stacked on #37. No merge to main or public deployment. AQVORA remains a provisional brand pending clearance.
