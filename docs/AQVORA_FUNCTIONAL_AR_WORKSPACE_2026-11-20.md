# AQVORA V2 — first functional Accounts Receivable workspace

**Status:** default-OFF, isolated-staging-only functional React route, based on verified read-domain backend child Draft PR #66. No production deployment, SQL migrations, new business project, company enrollment, writer activation or main merge.

## What is implemented in code

- App view `aqvora-receivables` registered in `src/context/AppContext.tsx` and mounted as a lazy route in `src/App.tsx`.
- Desktop Sidebar and Mobile More menu only show Receivables for an authenticated cloud OWNER/MANAGER when the existing **strict staging gate** is enabled. The route itself fails closed if manually selected without the gate or permissions. This is UI access presentation, not server authorization.
- `src/services/aqvoraSalesCustomersReadService.ts`: actual `list_aqvora_customers` PostgREST RPC through the same AAL2/tenant-verified staging transport. Company-safe, bounded customer-code pagination with no claiming an immutable snapshot.
- `src/components/accounting/ReceivablesWorkspace.tsx`: company timezone-based business-date default, chosen customer and date, live `read_aqvora_receivables`, and when a customer is selected complete `list_aqvora_open_invoices` collection from PR #65. Compares **source SHA token, authorized reader and sum of all open invoices to the authoritative AR control**; any mismatch rejects the entire combined report. No synthetic empty, cached or legacy balance fallback.
- `ReceivablesReportPanel`: 3 correct V2 only AR totals, responsive plain table with invoice drilldown, explicit limitations.
- `InvoiceEvidencePanel`: actual authenticated `get_aqvora_invoice_open_balance` RPC, exact source links and posted allocation drilldowns.
- `ReceiptEvidencePanel`: actual authenticated `get_aqvora_customer_receipt` and `get_aqvora_cash_collection` proof via existing PR #66, showing exact Cash debit / AR credit and **manual cash dual-control, not bank-cleared**.
- `formatExactCurrencyMinor`: ISO-based decimal scale using BigInt only; never parseFloat or Number the financial amount. Individual currency scale from Intl, no guessed PKR-specific formatting.
- Meaningful UI error/loading/auth/empty/filter-change tests, plus customer source/amount parsing tests.

## Functional workflow (on a future approved disposable staging project)

1. OWNER/MANAGER cloud account signs in and completes server-verified MFA. Company has isolated V2 test data.
2. Enable the two explicit staging flags and isolated project host/ref, not an existing business project.
3. Select sidebar **Receivables** or mobile More > Receivables, choose company/customer/date and Load verified AR.
4. Company control balance is exact and certified from V2; customer open invoice list is **fully collected under a matching snapshot token** and must reconcile exactly to the same customer's AR control.
5. Inspect one invoice; drill into actual receipt evidence and original dual-controlled cash count.
6. A missing/denied/corrupt/revoked-source or `40001` response displays an error and never silently displays a false zero or an incomplete "complete" report.

## Explicit limitations

- This UI is **read-only**. Creating customers/drafts, invoice approval/issue, cash confirmation, receipts posting and refunds are NOT enabled from this route. The backend has those guarded RPCs in PR #59/#63, but they need separate functional form/controller integration with source/revision/idempotency receipts.
- Only verified V2 source data is included: `legacy_included:false`, `opening_migration_verified:false`. Legacy Shop Pro books and queues are NOT migrated or silently combined. An empty V2 report is not evidence that a real company has zero receivables.
- The backend proves two-person **manual cash attestation**, not independent bank payment evidence. Bank reconciliation, true receivable aging, refunds/unapplied cash, tax/GST and non-service sales remain unsupported.
- Company list RPC uses live keyset pagination; it is NOT a certified complete customer directory snapshot.
- No hosted staging has been created, so real browser E2E against Supabase Auth/MFA has **not** been performed. Unit/CI tests mock the browser transport; PG/Auth jobs test backend separately.
- The frontend structural UX branch #50, old invoice reader #61/#62, and GL/TB read siblings #56/#58 are separate histories. This route attaches narrowly to the approved backend descendant #66. Do not blindly merge whole sibling histories.

## Review checklist before enabling a staging build

Verify the combined actual source fingerprint matches the same date and customer cutoff; test real OWNER/MANAGER, revoked AAL2 session, cross-tenant IDs, oversized lists, near-BIGINT balances and role demotion. Verify React route keyboard accessibility, mobile More menu, loading & error, source tamper, double-click race, stale request invalidation, and source-excluded legacy warning. Rehearse DB migrations and recovery only on a disposable authorized staging setup. No deploy/merge/activate without founder approval.
