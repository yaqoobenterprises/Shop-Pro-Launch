# AQVORA — isolated staging Sales Invoice read-only transport

**Development artifact only.** This child branch of Draft PR #61 (backend PR #59) does **not** deploy hosted staging, enable company enrollment, post money, install SQL migrations, or mount a UI page. Codex independently works on Issue #60: verified Customer Receipt → AR settlement.

## Implemented client

`src/services/aqvoraSalesInvoiceReadService.ts` exposes:

- `loadVerifiedServiceInvoice(context, invoiceId)`: the existing, authenticated `get_aqvora_sales_invoice` RPC, validated with `verifyServiceInvoiceSource` (company identity, exact minor-unit totals, posted AR/Revenue reconciliation, immutable issuance details and maker/checker separation).
- `lookupVerifiedSalesIssue(context, originalIntent)`: read-only lost-ACK recovery via `lookup_aqvora_sales_issue`, then independently re-read the invoice and cross-check the durable issue receipt. `{status:"not_found", safeToReissue:false}` **never** authorizes a new issuance or a new intent.
- `loadVerifiedSalesInvoicePage(context,{afterId,limit})`: one bounded `list_aqvora_sales_invoices` page. Rejects foreign sources, duplicate/unsorted invoice UUIDs, malformed payloads or oversized batches. **Always returns `sourceComplete:false`** because SQL's live UUID pages do not certify a whole-company, fixed-time invoice export.
- `isIsolatedSalesReadEnabled()`: routing gate, **false by default**.

## Mandatory staging gate (every condition)

1. `VITE_ENABLE_AQVORA_VERIFIED_SALES_READS=true`.
2. `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`.
3. `VITE_AQVORA_STAGING_PROJECT_REF` is an exact lowercase 20-letter Supabase project ref.
4. `VITE_SUPABASE_URL` normalizes to exactly `https://<ref>.supabase.co`, with no lookalike hostname, path or redirect.
5. Project ref is **not** either of the two known legacy/business projects in the blocklist.
6. Configured public key (no secret/service-role client key), matching signed-in cloud account and active selected-user session.

These are **client-side safety gates, NOT authorization**. True authorization depends on the trusted server in PR #59: AAL2, live `auth.sessions`, company OWNER/MANAGER membership and verified immutable financial source. Vite environment flags are bundled into frontend JavaScript and not secrets.

## Accounting truth / UI consumer

- `issued` proves **Dr Receivables / Cr Service Revenue** once, not a cash collection.
- `unposted_service_draft` includes draft, submitted, approved or cancelled document states; none certifies a posted receivable.
- All reads return `paymentState: "not_available"`. Absolutely no paid/unpaid/outstanding/aging classification may be synthesized from the invoice face amount.
- No demo/sample fallback if authenticated network requests fail, access is denied, the company differs, fiscal/receipt/audit provenance is inconsistent, or the user session disappears.
- A list page ending with fewer than `limit` rows is **not** a certified global financial report. Keyset snapshots can change between page loads.
- Only the future authorized Issue #60 settlement server API may certify actual paid, allocated, remaining, or as-of balances.

## Tests and release gates

`tests/aqvora_sales_staging_read.test.ts` tests strict staging-only enablement, blocked production hosts, missing cloud user/session, actual RPC method/arguments, invoice source and matching receipt lookup, lost-ACK unresolved behavior, false financial reconciliation, malformed source, SQLSTATE denial propagation, session disappearance, page order/tenant/limit and unknown payment state.

Before any hosted demo or production activation: isolated staging and real company identity tests, MFA/role revocation, multi-page invalidation, user-visible pending/permission/failure messaging, source-backed settlement reconciliation, signed-off jurisdiction and rounding policy, legacy balance/queue protection, migration/rollback rehearsal and founder approval.

**Stack:** backend #59 → source read-model #61 → this Draft PR. Separate GL/TB #56→#58 and frontend UI #50 are sibling histories. **Do not merge them blindly.**
