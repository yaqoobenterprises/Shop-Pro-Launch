# AQVORA — Issued service-invoice read verification contract

**Status:** independent, **pure read-only client-side validation** of backend Issue #57 / Draft PR #59, stacked on #59. This is NOT the new Customer Receipt → AR posting implementation (Issue #60), not a deployed/activated client, and not permission to enroll existing companies or change Supabase.

## Why

The [Sales invoice RPC](docs/aqvora-sales-invoice-api.md) from PR #59 supports certified, source-backed **service invoice issuance**, but explicitly returns `settlements_supported=false`. A connected UI must **not** fabricate "Paid", "Partially Paid", "Unpaid", cash received, or an outstanding balance from the issuance receipt or invoice face amount. The issuance journal is **Dr AR / Cr Revenue**, not evidence that cash was received.

## Implemented

- `src/accounting/verifiedSalesInvoice.ts`: `verifyServiceInvoiceSource(payload, {organizationId, invoiceId})`.
- `tests/aqvora_verified_sales_invoice.test.ts`: positive and malformed/foreign/financially inconsistent cases, exact quantity rounding and per-line discount, full BIGINT boundary, source/receipt/revision mismatch, unsupported taxable treatment, and falsely claimed payment status.

On success the validator returns:
- `sourceBasis=verified_issued_service_invoice` for a valid, issued source with matching server-returned source linkage and exact `AR debit == Revenue credit == face`.
- `sourceBasis=unposted_service_draft` for a valid unissued record. Submitted/approved/cancelled documents are not posted sources either.
- **`paymentState=not_available` for ALL documents**. The model deliberately has no `paid_minor`, `outstanding_minor` or `settlement_state` until Issue #60 provides an **authenticated, consistent, certified receipt allocation reader**.

## Security and accounting boundary

This TypeScript function validates untrusted JSON shape but **cannot prove** a response came from the authorized PostgreSQL server. Backend PR #59 enforces canonical OWNER/MANAGER, AAL2, live session, tenant ownership, source/revision checks and immutable linked issuance receipt and audited GL/TB. Only an authenticated, staging-gated trusted `get_aqvora_sales_invoice` RPC transport may use this validator with actual data; **none is connected here**.

The exact quantity formula from #59 is `(quantity_millionths × unit_price_minor + 500000) / 1000000` using integer division and positive half-up ties. The validator recomputes exact `BigInt` gross/discount/face, requires 1–100 consecutive service lines, no JS float conversions, and signed-BIGINT financial boundaries. It cross-checks the issued document number, journal ID, customer ID, policy currency and verified out-of-tax-scope treatment, fingerprint, receipt approved/issued revisions, exact AR and revenue amounts.

The current source cannot support tax-enabled invoices, inventory, true AR aging, bank deposits, refunds, customer receipts, or amounts allocated against an invoice. Those remain **blocked** until appropriate verified SQL workflows and policy exist.

## Safe future integration

1. Codex implements Issue #60 as a **separate Draft PR stacked on backend #59**. The new backend must expose verified receipt allocations and open-item balances, with atomic journal, source and audit.
2. Review and extend this validator to distinguish a real server-proven **as-of settled balance** from old invoices. Require exact receipt source coverage, currency and cutoff consistency, company membership/authorization and source/change token handling. No client-supplied `source_complete` flag.
3. Deliberately integrate #56/#58 GL/TB client and frontend #50 UX history on a **new** branch, not by blindly merging sibling stacks; preserve source provenance fields from #59.
4. Only after disposable local and hosted isolated staging tests: deliver functional, source-aware Invoice detail and Customer Receipts pages. Founder-approved launch/reconciliation gates still apply.

No production migration, financial write, hosted deployment, main merge, or paid resource in this branch.
