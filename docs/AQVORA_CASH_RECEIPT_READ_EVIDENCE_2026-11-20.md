# AQVORA — controlled-cash evidence and durable receipt READS

**Status:** staging-only read integration, **default OFF**, stacked on Draft PR #65 which is stacked on backend PR #63. This branch does not POST, approve, cancel or confirm any financial document and has no UI route or production deployment.

## Exact read-only RPCs

`src/services/aqvoraCashReceiptReadService.ts` uses **only**:
- `get_aqvora_cash_collection`: company-scoped cash evidence, no bank verification.
- `get_aqvora_customer_receipt`: detailed source-linked receipt with immutable journal, allocation and cash/AR reconciliation when posted.
- `lookup_aqvora_customer_receipt_issue`: original-intent read for lost response recovery. Missing lookup yields `safeToCreateNewIntent:false`.

The staging gate from PR #65 remains mandatory for **every** RPC call: two explicit opt-in Vite flags, a correctly matching exact isolated project host/ref, exclusion of known existing business projects, configured public client key and matching live cloud user/session before/after each call. The server must independently enforce true live AAL2 session, canonical company/role and source certification.

## Verified shape and financial assertions

- `src/accounting/verifiedCashCollection.ts` checks declared amount as canonical BIGINT minor-unit string, company/customer/currency/cutoff, source number `CC-n`, maker/session provenance, and strict distinct OWNER checker when the cash source is confirmed. The client always returns `bankVerified:false` — two-person manual attestation is NOT proof of bank statement settlement or custody.
- `src/accounting/verifiedCustomerReceipt.ts` checks the source's company, customer, exact amount, 1–99 distinct UUID-ordered invoice allocations, invoice revisions/fingerprints, posted journal ID, source revision, immutable receipt issue, allocation journal line numbers and exact **Cash debit = AR credit = allocated cash**. It also refuses an unsupported bank-verified claim.
- The receipt detail service independently fetches original cash evidence and requires matching collection ID, source fingerprint, maker, company, customer, currency, date and amount. Posted receipts additionally require the cash source's `posted_receipt_id` to equal the posted receipt. This does not substitute for source-owned PostgreSQL certification.
- `lookupIsolatedCustomerReceiptIssue` never re-posts: it fetches the durable issue, reads current certified receipt and cash evidence and verifies issue identity, journal, exact amount, actor, intent and all allocation IDs/amounts/line positions.

## Boundaries and release blockers

1. No production data, hosted staging resources, migrations, live company enrollment, financial posting, `main` merge or Vercel deployment in this PR.
2. No independent bank reconciliation, refunds, unapplied cash, credit notes, tax compliance or receivables aging. A manually confirmed cash claim can remain operationally unresolved; do not invent a refund or a Paid status.
3. Historical opening balances from legacy Shop Pro are excluded. Never conflate V2 source-certified reports with the complete migrated economic books.
4. This is a backend #63-derived read integration; older sibling Sales frontend PR #61/#62 still uses outdated `settlements_supported:false` schema, and UI/frontend #50 is a separate history. No blanket merge.
5. Hosted synthetic staging Auth/PostgREST, role revocation, realistic cash handling, concurrent receipts and recoveries, backup/restore, SQL migration lock plan, financial source E2E with actual browser UX and founder release sign-off remain required.

**Validation:** unit tests verify cash confirmation vs draft, self-attestation, false bank evidence, fake journal/receipt/allocations, cross-tenant leakage, exact money, missing receipt issue, recovered intent collision, 42501/23514/40001 and disabled staging. Full CI must be green before acceptance.
