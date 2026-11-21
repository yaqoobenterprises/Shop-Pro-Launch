# AQVORA — staging-only service invoice maker/checker and issue UI

**Scope: Draft branch only. No hosted staging deploy, no SQL or production changes.** Built on the existing verified V2 #63→#66→#67→#69→#70 stack. This adds a functional invoice lifecycle route and source-backed original-issuance recovery; it is not authorization to activate a writer on an existing company.

## Implemented RPC flow

- `get_aqvora_sales_invoice`: read and independently validate company, customer, exact BigInt service lines, line half-up rounding, discount and face, revision, state, immutable issue receipt, AR/Revenue source, applied payments and remaining AR. Submitted/approved source must have a valid policy/customer fingerprint, and approved/issued source has a distinct maker/checker.
- `transition_aqvora_sales_invoice`: authenticated submit (original OWNER/MANAGER maker only), approve (distinct OWNER only), reject to draft with reason (OWNER), and unissued cancel with reason (OWNER/MANAGER). One compare-and-swap expected revision per user click. On a possibly successful-but-uncertain response, **clear the stale local source and require a fresh read**. Never blindly retry a non-idempotent transition.
- `issue_aqvora_sales_invoice`: **separately locked financial RPC**, available only after a verified approved state, explicit user acknowledgment, independently matching fingerprint and revision, active session and trusted SQL company writer/policy. One immutable original UUID intent is stored in scoped browser session storage *before* sending. The authoritative SQL backend decides posting, permissions, enrollment, fiscal period and trusted tax policy.
- `lookup_aqvora_sales_issue`: safe read-only original receipt recovery after lost reply. Verify original intent, company, source revision, fingerprint, immutable journal, amounts, invoice source and AR/revenue; unresolved lookup never permits a fresh key or second post.

## Explicit required gates (ALL)

1. Read gate: `VITE_ENABLE_AQVORA_VERIFIED_AR_READS=true`
2. Isolated env gate: `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`, `VITE_AQVORA_STAGING_PROJECT_REF=<20-letter-ref>`; configured `VITE_SUPABASE_URL` **exactly** matches isolated host (known business projects blocklisted).
3. Draft gate: `VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS=true`
4. Lifecycle gate: `VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE=true`
5. **Financial issue still separately blocked:** `VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE=true` would be needed in a permitted synthetic staging build; it is not set or enabled in this PR.
6. Matching cloud session and signed-in canonical OWNER/MANAGER; independent OWNER maker/checker for approval. **None of these client flags authorize SQL.** All true SQL security relies on live AAL2 `auth.sessions`, active tenant membership, RLS and source RPC checks.

## User journey

- Customer and draft created on previous dedicated staging Sales Drafts route. Confirmed draft has a direct **Review this source invoice** button, preserving only a company/user-scoped UUID hint in session storage.
- Original maker submits. This is explicitly blocked without a server-controlled, jurisdiction-specific, verified **out-of-tax-scope** service policy. No browser or OWNER can invent tax evidence.
- A *different* OWNER signs in and reads the **same** invoice source (may paste UUID on another device), then approves. Approval rechecks exact original policy/source fingerprint; server enforces independent maker/checker.
- An authorized issuer may issue only once when a separately approved isolated company has safe enrollment and special financial issue flag. This creates actual Dr AR / Cr Service Revenue and an immutable journal; no frontend ledger/balance mutation.
- If network ACK is lost, the current browser retains the original intent across reloads. The UI permits **Recover original issuance receipt** only; it will neither invent a new key nor silently double-post. If client session storage is unavailable, posting is blocked.
- Issued invoice shows verified journal, source face, receipt allocations and remaining AR (source-backed V2 only). Users can inspect existing AR/GL/TB routes separately for final reconciliation.

## Nonclaims, controls, pending dependencies

1. No real hosted company or production project tested; all browser/UI transport tests use mocked RPCs, backend PG/Auth suites are independent. A complete hosted real AAL2/role/multi-actor E2E against a disposable project remains required.
2. Financial **issuance is disabled by default** and SQL enrollment/policy seed remains empty. This branch DOES NOT authorize enabling the writer or provisioning a real tax policy. Founder + accounting/legal signoff for jurisdiction, company currency scale [Issue #68](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68), fiscal periods and rollback is essential.
3. Only **service invoices** with verified out-of-scope tax treatment. No tax calculations, inventory/COGS, bank payment verification, refunds, credits, VAT or AP supported. No UI action claiming full migration/complete legacy balance reconciliation.
4. Session storage reduces lost-ACK risk but does not synchronize keys across browsers, destroyed browser storage, other devices or failed deployments. When original key cannot be established, stop and investigate on the server; do **not** assume a null lookup or reset means safe to post.
5. Backdated period transitions can change business-date as-of reports. GL/TB and AR each have their own snapshot protocols; the review UI does not label separate asynchronous reads as one atomic global certification.
6. Intent and role/state validation in browser is advisory defense in depth. The PostgreSQL writer is the sole authority, protects balanced atomic journals, idempotency receipts and immutable history.
7. The existing unrelated frontend design branch #50 and pre-settlement invoice reader #61/#62 remain **separate sibling histories**. No blind merges.

## Acceptance gates before any rollout

- Draft PR CI: all app, lint, strict TS, build, file size, PG concurrency/recovery, real local Auth/PostgREST tests must pass.
- Reviewed disposable hosted staging Auth/MFA with actual distinct OWNER maker/checker accounts and synthetic test company, approved policy and real data, loss/retry, bad tax/period, membership revocation and multi-tab scenarios.
- Independent verification after issue: exact Dr AR/Cr Revenue journal, later Dr Cash/Cr AR payment, whole-company GL/TB totals tie to invoice and receipt source; no fabricated bank settlement.
- Real browser accessibility/keyboard, mobile responsive, dark/light, performance and security advisor warnings; simulate zero/past/future, stale revision, same-key/different-payload, lost ACK and restore.
- Approval before merging `main`, activating company writers, production Supabase or purchasing resources.
