# AQVORA — Fresh Books From Zero: Accounting Acceptance Contract

**2026-11-21 — Founder decision: clean, new ERP. No automatic legacy Cashbook import.**

This review-and-testing branch is based on integrated ERP Draft #87, not the deferred historical import chain #90–#95. This file is an engineering contract, **not a claim that production ERP is shipped**.

## Zero-start accounting invariants

1. A new company has zero financial journals, lines, receipts and balances. Neither a welcome wizard, Chart of Accounts, nor fiscal period setup can create fictional opening money.
2. A disabled new-company financial writer cannot post. Any authorized activation needs an explicit verified founder/owner decision, active membership, MFA, open fiscal period and immutable receipts. **Existing company writers must not be enabled by default.**
3. An inaccessible or incomplete server source is NOT certified zero; accounting figures require a complete authenticated source snapshot.
4. Opening capital is recorded only for a real documented investment: Dr Cash/Bank, Cr Equity. The founder's historical Shop Pro CSV stays private, separate, and may inform later manually reviewed journal entries.
5. Cross-company accounts/periods/journals are forbidden, even if display names match. Source and target company identities require server authorization.
6. Use exact currency minor-unit strings and currency-specific exponent policies. Every posted journal must have total debit exactly equal total credit. Corrections use immutable reversal entries; never overwrite history.

## Core debit/credit and accrual matrix

| Event | Debit | Credit | Treatment |
|---|---|---|---|
| Actual owner contribution | Bank/Cash | Owner Capital | Not revenue |
| Owner cash withdrawal | Drawings (equity) | Bank/Cash | Not operating expense |
| Earned cash service sale | Cash/Bank | Revenue | Real earned income |
| Customer advance | Cash/Bank | Customer Advance liability | Deferred revenue until earned |
| Credit sale | Receivables | Revenue | Requires verified customer invoice |
| Customer pays invoice | Bank/Cash | Receivables | No second revenue recognition |
| Inventory purchased on credit | Inventory | Payables | Do not expense stock purchase automatically |
| Goods sold | Cost of Sales | Inventory | Requires linked verified stock movement |
| Supplier invoice paid | Payables | Bank | No second expense |
| Cash-to-bank transfer | Bank | Cash | Neither income nor expense |
| Bank loan received | Bank | Loan Payable | Liability, not income |
| Salary accrued unpaid | Salary Expense | Wages Payable | No cash outflow yet |
| Salary paid | Wages Payable | Bank | No duplicate expense |
| Depreciation | Depreciation Expense | Accumulated Depreciation | Separate asset-life policy |
| Posting correction | Opposite debit/credit | Linked reversal | Preserve original immutable record |

**Equations:** Assets = Liabilities + Equity including current earnings; ΣDr = ΣCr per voucher and ledger; revenue and expenses use accrual recognition, not just cash flow. Balanced arithmetic does NOT establish correct legal tax treatment or external bank reconciliation.

### Accounting standard references

- IFRS Foundation Conceptual Framework: https://www.ifrs.org/issued-standards/list-of-standards/conceptual-framework/
- IFRS 18 Presentation and Disclosure (annual periods beginning on or after **1 January 2027**, early adoption permitted): https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/
- Supabase RLS and grants for company-scoped Auth: https://supabase.com/docs/guides/database/postgres/row-level-security

Accounting tests are **foundational double-entry and accrual verification, NOT blanket IFRS/GAAP certification**. Country-specific taxes, VAT/GST, inventory valuation, exchange-rate treatment, payroll, depreciation, consolidated statements, IFRS 18 disclosures and period close are policy-specific work still requiring implementation.

## Implementation and verifiable synthetic tests

- tests/aqvora_fresh_zero_books_accounting.test.ts: imports existing full SQL migration chain in disposable in-memory PostgreSQL; creates two fake companies; confirms no auto journals, CoA or writer enrollment; uses actual AAL2-secured owner-only CoA/period RPC, verifies writer disabled; enables only fake company in isolated DB and posts 7 journal examples using existing secure V2 RPC. Tests receipt replay, cross-tenant denial, 1-paisa imbalance denial, changed-payload denial, exact GL movements, and certified Trial Balance.
- tests/aqvora_fresh_accrual_rule_matrix.test.ts: pure exact-math statement tests for true empty books, financial source incompleteness, AR/AP, inventory and COGS, owner drawings vs operating costs, accrual salary, as-of future entry exclusion, reversing entries, company isolation and duplicate intent rejection.
- No production Supabase SQL, no Vercel deployment, no company balances changed, no new financial writer activated, no legacy data copied.

**Next release gate:** verified hosted new-company signup/owner MFA/RLS, actual owner-approved fresh-company financial activation, integrated UI+API CoA/fiscal/journal/GL/TB/financial statements, isolated backup and restore, and mobile PWA QA. Keep sample UI labelled until these are proven. Historical migration is not a launch prerequisite because founder chose later manual entry.
