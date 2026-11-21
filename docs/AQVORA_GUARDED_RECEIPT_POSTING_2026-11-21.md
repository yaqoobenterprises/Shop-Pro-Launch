# AQVORA — Guarded Customer Receipt Posting + Lost-ACK Recovery
**Status:** Separate code-only Draft branch stacked directly on #76 → #74 → #71 → verified backend #63. Financial writer remains OFF by default. No SQL changes, production, company enrollment, staging creation, migrations or main merge.

## What is implemented
- `src/accounting/pendingReceiptPosting.ts`: persist one per-company/per-actor **original** approved receipt ID, source revision, fingerprint, and idempotency UUID in tab session storage BEFORE calling the posting RPC. Block second intent while pending; malformed/denied storage fails closed. Clear only after matching immutable journal, approved receipt and source evidence are verified.
- `src/services/aqvoraReceiptPostingService.ts`: the **existing** backend #63 `post_aqvora_customer_receipt` RPC, after a freshly authenticated re-read of the original approved source. Server alone checks AAL2, current `auth.sessions`, membership, company writer enrollment, approved fiscal period, trusted cash policy, source fingerprint/revision, customer, accounts, concurrency and idempotency. Client checks are defensive only.
- `lookup_aqvora_customer_receipt_issue`: read-only recovery by the original posting UUID after a network timeout/uncertain ACK. Independently verifies receipt state=posted, cash/count provenance, actual journal, exact Dr Cash = Cr AR = entire allocated cash, immutable allocation rows, company/currency, original source revision/fingerprint and original actor. Missing lookup explicitly leaves original intent LOCKED, never grants a fresh posting key or implies an unposted transaction.
- `ReceiptPostingPanel.tsx` is mounted inside the #76 Customer Receipt workspace as an independent **optional** stage. It requires explicit human acknowledgement and shows *bank verified: NO*, exact source minor units (no guessed major units), and journal/receipt identity only after certified source verification.

## Mandatory gates — ALL default OFF
1. The verified isolated AR read / exact new staging-project ref and matching cloud session gates from #65/#74.
2. `VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS=true`
3. `VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS=true`
4. `VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE=true` **independent financial issue opt-in**.
5. `VITE_ENABLE_AQVORA_STAGING_RECEIPT_POSTING=true` **receipt-specific financial issue opt-in**.
6. Server-side live AAL2, current OWNER/MANAGER, distinct maker/OWNER checker, trusted approved policy, company-specific V2 writer enrollment and locked fiscal/accounting integrity.

These are **not instructions to enable flags now**. Issue #68 authoritative currency policy, #72 hosted synthetic staging full E2E, accountant/founder policy approval and a controlled rollback/runbook are still unresolved. A browser feature flag is not authorization.

## Important financial semantics
- One confirmed manually dual-attested cash instrument → exactly one approved receipt with 1–99 invoices → one immutable `Dr Cash / Cr AR` journal and allocation set. No re-recognition of Revenue.
- A confirmed manual cash count is not an independently verified bank deposit. Never label posted receipt bank-cleared.
- Posted receipt is not proof of full company/legacy balance, aging, refund, unapplied cash, multi-currency/FX, tax or stock workflows.
- Source open invoice pages and financial reads must reject stale/partial/cross-tenant data; historical AR/GL/TB is only V2-source-complete.
- Existing legacy Shop Pro balances/offline queue and original V2 writer remain untouched.

## QA and release blockers
- Added negative unit/service tests: default-OFF financial gate, exact original UUID stored across reload/timeout, forbidden second key, corrupted/denied storage, wrong tenant/actor/revision/fingerprint, self-approval, revoked session, forged SQL ACK and missing issue, complete immutable allocation comparison.
- **GitHub CI required**: app tests, lint, TS/strict, file-size ratchet, Vite build, PG17 independent session/restore, local real Supabase Auth/MFA/PostgREST.
- **Not yet**: real hosted separate OWNER/checker browser E2E, independent physical bank confirmation, approved currency scale, production rollout, functional legacy opening migration, high-volume performance signoff.
- Do not close/merge ancestor Drafts or enable writers before the compatible frontend/backend integration and all explicit founder release gates.

Once Issue #68 is resolved, compare its exact source-owned scale contract with #76/this branch and render approved major-unit values only after source-certified policy metadata is available. Otherwise continue rendering raw integer minor units.
