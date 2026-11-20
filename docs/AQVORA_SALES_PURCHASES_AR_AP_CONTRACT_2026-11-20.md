# AQVORA — Sales/Purchases and AR/AP operational source contract (Phase 1)

**Scope:** backend-first **pure-domain implementation**. Founder paused final UI/UX styling. Built independently of Codex's ledger-read work in Issue #51 and backend Draft PR #44. **No database writer, no route activation, no production migration, no company enrollment.**

## 1. Business scope and status

These two modules are a foundation, **not complete Sales/Purchases screens**. Source pricing arithmetic and AR/AP payment-allocation projection are real tested pure functions. They do **not** read verified company data, save business documents, authenticate, perform MFA, allocate actual bank transactions, compute jurisdiction-specific tax, post to V2 journals or certify financial statements.

Implemented:
- `src/erp/operationalDocuments.ts`: source document total calculator, usable for an explicitly separate `sales_invoice` or `purchase_bill`.
- `src/erp/openItems.ts`: preview/projection of posted document outstanding amount from a **complete authorized** event stream (payment, credit-note allocation, and reversals).
- Two direct Vitest suites, designed to expose invalid money, cross-company events, improper reversals, overstated receipts, duplicate intents and incomplete sources.

**Hard boundary:** `sourceComplete: true` is a contract for a trusted server adapter only. A browser can set it without proof. **Do not** use these functions for posting, financial statements, or certified balances until the backend implements full proof, tenant authorization and durable receipts.

## 2. Sales → Receivables happy path

1. An authorized Sales user creates a **draft** with company, customer, code, location, currency, issue/due dates and invoice lines. The draft must be company-scoped and have no posted journal.
2. Products, service classification, inventory availability where applicable, discounts, statutory tax and counterparty rules are verified on the **server**, not derived from a browser-only Boolean.
3. A permitted approver issues the invoice, atomically reserving a company-scoped document number, fiscal period, immutable version, verified source references, and posting intent ID.
4. Only a verified-source financial RPC may post `Dr Trade Receivables / Cr Sales Revenue / Cr Output Tax Payable` (tax portion **only** when verified policy exists). The RPC writes a journal + source link + audit + idempotent receipt in the **same transaction**.
5. Receipt recording: identify the actual cash/bank instrument, match the customer and company, and allocate exact positive minor-unit amounts to one or several open invoices. `Dr Cash/Bank, Cr Trade Receivables` is an **authorized** payment posting with linked receipt, not client-side balance mutation.
6. Part payments leave an open balance. A payment can only close a document by exact matching of authorized allocations and account/control-ledger totals. Never synthesize a missing receipt.
7. After issuance, edits to financial lines and history are blocked. Corrections use traceable credit notes, reversals/refunds and reason/actor metadata; no deletion of posted transactions. If a fully paid invoice needs a credit, refund liability and cash refund require a separate explicit workflow.

## 3. Purchases → Payables happy path

1. A permitted Purchase user creates a draft vendor bill or prepares a PO → goods receipt → invoice matching workflow, as appropriate.
2. Validate company-scoped vendor, pricing, approved purchase order, goods receipt, quantity tolerance, cost classification and applicable input tax.
3. Approve and post a verified purchase source. Expense bill: `Dr Expense / Cr Trade Payables`; verified inventory bill: `Dr Inventory / Cr Trade Payables`; input tax may be separately debited when policy verified. No arbitrary inventory/tax control-account posting.
4. Select an approved supplier payment method and allocate to open vendor bills: `Dr Trade Payables / Cr Cash/Bank`.
5. Partial supplier payments, bill credit notes, cancellations, blocked vendors, locked periods and duplicate vendor invoice numbers are explicitly handled. Posted history remains immutable; credit and reversal records must be linked.

## 4. Critical accounting / algorithm rules

- **Money** is a canonical decimal string in integer currency minor units: `"12345"`, not `123.45` JavaScript floating point. PostgreSQL `BIGINT` boundaries; exact integer sums.
- **Quantity** is a positive canonical integer representing 1/1,000,000 of a sellable unit. Extended price = price-per-whole-unit × quantity / 1,000,000, with **positive half-minor ties rounded up per line**. This policy is explicit and needs region/accounting sign-off before actual invoice generation. Financial statement rounding must not assume client-calculated totals.
- Discounts and taxes are **explicit amounts per line** in the pure calculation. Tax **rate and eligibility are NOT implemented**. A real issue/posting RPC must recompute under verified jurisdiction/company policy.
- No negative invoice lines or hidden balancing adjustments. Returns/credits are separately linked financial documents.
- AR/AP event kinds: `payment`, `credit_note`, `payment_reversal`, `credit_note_reversal`. Reverse only an existing matching allocation **once**, amount-for-amount, using a NEW source reference. This is a projection policy, not permission for a generic client to reverse journals.
- Event order uses contiguous server-issued sequence (1…N) rather than trusting dates. No double-allocated receipt/source references **within an open item**. The **server** must additionally prevent one payment instrument from being overallocated across several documents.
- `intentId` replay with the **exact same payload** is an idempotent **preview**; changed payload throws. Durable idempotency and concurrency are still server responsibilities.
- `faceAmountMinor` must be linked to a **posted journal**. It cannot be copied from the UI calculator and treated as authoritative.
- `sourceComplete === false` throws. Never show fictitious zero balance when a customer, vendor, allocation or journal page failed to load.
- As-of/historical aging, due dates, refunds, exchange rates, source authorizations, actual GL reconciliation and company base currency changes **are not yet implemented**.

## 5. Proposed server workflow/API boundary (future, not implemented)

| Operation | Proposed method | Key guarantees |
| --- | --- | --- |
| Create draft source | `create_sales_draft` / `create_purchase_draft` | Authorized tenant + server-generated ID; status Draft |
| Read/validate | `get_*_document`, `validate_*_document` | Server totals, revision, tax policy version |
| Approve+issue | `issue_sales_invoice`, `approve_purchase_bill` | Role, fiscal period, verified source, immutable version |
| Post source journal | Restricted source-owned RPC | CoA control accounts, atomic source/journal/receipt/audit |
| Allocate payment | Restricted AR/AP payment RPC | Company-scoped payment source, total allocation cap across invoices, server lock |
| Credit/reverse | Restricted linked credit/refund RPC | Authorized actor, reason, source links, no deletion |
| Read open items | `list_open_items`, `get_open_item` | Complete consistent scoped snapshot, exact money, paging |
| Reports | AR/AP aging and control-account reconciliation | Date basis, verified cutoff, source coverage, fail-closed |

**Do not expose client CRUD directly against financial control tables.** Row-level security, session/MFA checks, role authorization, pending approvals and immutable audit must be enforced by the SQL/API boundary.

## 6. Required lifecycle/state machine (future integration)

```text
draft → submitted → approved → issued/posted
   ↘ cancelled before posting

issued/posted → unpaid → partially_settled → settled
                        ↖ refund/payment reversal
issued/posted → credit-note / corrective reversal → adjusted open balance
```

- Draft edit creates a new revision; submitted approval invalidates on revision change.
- Once posted, money-bearing fields are immutable. A terminal reversal cannot be silently reopened or re-posted.
- Payment state is a **derived open-item balance**, independent of the document's issuance status.
- Lock period and source rights at the **database transaction** boundary to prevent a race between period close and posting.

## 7. Next independent integration acceptance gates

1. Codex finishes Issue #51 authenticated GL/TB reads. Confirm accounting source policy and actual RPC response signatures, not guessed functions.
2. An isolated SQL source model: companies, parties, documents, versions, invoice lines, allocations, credit notes, immutable audit, authorization, and cross-document receipt caps. No writes in existing production projects.
3. Create an actual server-verified source-to-journal transaction with correct AR/AP control-account mappings; reject unavailable inventory/tax sources and self-approvals where policy disallows.
4. Test concurrency (two receipts on one invoice; concurrent cancellation/credit; duplicate intent after lost response), old-client fencing, role demotion, cross-tenant misuse, refund, rollback, tax/FX policies, currency changes, and period closing.
5. Run isolated Postgres and real Auth/PostgREST CI; prove GL/TB agreement with AR/AP aging and source detail, including reversals.
6. Only after backed source APIs and accounting acceptance: build minimum functional invoice/bill UI and user journey. Visual polish remains paused.

**Safe integration:** This branch is based on frontend/accounting read-model PR #38, not the backend Codex stack. A new integration branch must explicitly reconcile both histories; do not merge to `main` or enable financial posting without founder approval.
