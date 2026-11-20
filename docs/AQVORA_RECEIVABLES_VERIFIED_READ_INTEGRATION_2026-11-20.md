# AQVORA — verified V2 Receivables read integration, backend PR #63

**Scope:** pure, read-only client verification on an isolated child branch of backend Draft PR #63. **NOT** production deployment, a UI route, a real hosted staging session, or an authorization substitute.

## API reality (confirmed from PR #63's SQL)

The backend has a **controlled-cash** source workflow, not a verified bank feed. Cash claims require distinct OWNER physical-count attestation; receipt approval requires a distinct OWNER. The posted journal is Dr Cash and Cr AR, one credit per allocated issued invoice. It does not post revenue again. A terminal posted source includes immutable journal/receipt/allocation/audit provenance.

The authoritative open-invoice RPC `get_aqvora_invoice_open_balance` returns company, customer, business-date cutoff, face, posted allocations, outstanding, status, allocation references and source flags. The full-company/customer `read_aqvora_receivables` returns company-reconciled AR control totals and `aging_supported:false`. `list_aqvora_open_invoices` returns a **certified snapshot token**, not a permanent transaction; changing the source during pagination must cause a complete restart.

### Critical sibling-client contract difference

Existing ChatGPT Draft PRs **#61/#62** were based on backend invoice PR #59 and deliberately expected:

`settlements_supported=false`, `basis=unsettled_issued_service_invoice`, `paymentState=not_available`.

Backend PR #63 changes the issued `get_aqvora_sales_invoice` response to:

`settlements_supported=true`, `basis=v2_posted_receipt_allocations`, and source-backed `allocated_minor/outstanding_minor`.

**Do not blindly merge or activate #61/#62 against #63.** They should be selectively adapted during a deliberately reviewed integration branch. Neither the older fallback status nor a silent success/default-zero state is acceptable.

### Implementation in this PR

- `src/accounting/verifiedReceiptReads.ts`: runtime verification functions for the current backend source:
  - `verifyInvoiceOpenBalance`: strictly matching company/invoice/customer/currency/as-of, exact integer money, `face=allocated+outstanding`, `allocated<=all_posted<=face`, status, 1:1 allocation provenance, date boundaries and source-only scope.
  - `verifyReceivablesSource`: authoritative `aqvora-read-v1` context, `from_date=0001-01-01`, snapshot SHA256, AAL2 reader role, exact source totals, required `legacy_included:false` and `opening_migration_verified:false`.
  - `verifyOpenInvoicePage`: page bounds and keyset/UUID order, original token continuation, matched count, next-ID consistency, no settled invoice masquerading as open, and explicit `sourceCompletePage:false`.
  - `verifyReceivablesReconciliation`: customer/company as-of identity, exact aggregate control-account tie-out and refusal to claim unimplemented aging.
- `src/accounting/receiptContracts.ts`: matches **actual** backend wire response for invoice open-allocation references. The SQL `aqvora_invoice_allocation_state` emits `allocation_id/receipt_id/collection_id/receipt_number/business_date/amount_minor/journal_id/line_no` but does **not** repeat `invoice_id` in each nested allocation. The original TypeScript declaration incorrectly required it. This is a type-only contract correction, no SQL changes.
- `tests/aqvora_verified_receivables_read.test.ts`: exact partial/full/empty, BIGINT, forged source flags, wrong company/customer/currency, unknown dates, stale token, incorrect AR totals, duplicated/unsorted rows, corrupt receipts and false bank/aging claims.

## Boundaries and future functionality

1. This browser validator **cannot prove** a forged response was produced by PostgreSQL or authorize a financial posting; SQL RPCs must enforce session, AAL2, company/role, source integrity and idempotency. The code neither calls RPCs nor posts any money.
2. **Do not infer independent bank verification.** Even a fully settled invoice is only settled against verified *manual dual-control cash attestations*, not reconciled bank deposits.
3. As-of is the company's **business date**; subsequent backdated postings can alter historical as-of results. This is not an immutable point-in-time snapshot, aging calculation or approved migrated company balance.
4. `legacy_included:false` and `opening_migration_verified:false` must remain visible when displaying V2 results. User interface must never call this the complete books of an existing business until migration reconciliation.
5. Avoid mixing open-invoice pages with two different tokens; `40001` must clear all rows and restart from first page with bounded retry. Do not silently truncate large report exports.
6. Separate frontend #50, GL/TB read siblings #56/#58, old Sales readers #61/#62 and backend #63 are **not merged** by this PR. Design a reviewed staging integration branch after the relevant contract changes are reconciled.
7. Hosted staging schema migration, table-lock risk from new generated journal source columns, legacy/offline-queue protection, rollback, cash-handling policy, tax jurisdiction, refunds, unapplied cash and security warnings remain release gates.

**Safety:** Draft-only; no `main` merge, no project migrations, no writer activation, no live company enrollment, no paid resources.
