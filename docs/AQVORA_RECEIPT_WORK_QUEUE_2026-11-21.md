# AQVORA — Source-backed Operational Cash & Receipt Work Queues
**Implementation:** A frontend-only Draft child of #77 → #76 → #74 → #71. Uses existing backend #63 JSON RPCs. No changes to Codex's currency policy branch #78 or to any PostgreSQL migration.

## Practical workflow improvement
Previously the maker and independent OWNER had to copy/paste UUIDs for each cash collection and customer receipt. On the existing staging-only Cash collections and Customer receipt routes, an explicit **Browse work queue** disclosure now loads **real authorized company records** (no sample fallback):
- **Cash claims:** authenticated `list_aqvora_cash_collections`, company/currency/business-date validation, original source number, manual attestation state, exact integer minor-unit amount; selecting a row invokes existing source re-read before confirmation/cancellation.
- **Receipts:** authenticated `list_aqvora_customer_receipts`, company/currency/date, all 1–99 unique exact allocations, receipt journal evidence verification where posted. Selecting invokes existing dedicated read-and-review workflow, not a mutation.
- Mobile/desktop responsive sections with explicit load/refresh, bounded keyset next-page navigation, role/session/error/empty/loading states, keyboard-accessible buttons, clear manual-not-bank-cleared disclosure.
- No permanent extra sidebar or dashboard clutter; independent `VITE_ENABLE_AQVORA_STAGING_RECEIPT_INBOX=true` feature gate, **OFF by default**.

## Deliberate data-integrity boundaries
- The SQL operational list uses UUID keyset **live pagination**; it is **not** a stable database snapshot, certified total count or final company balance. A full page may mean more; the UI says **Next live page**, never claims completeness.
- List content is bounded to 20 by default and <=100. Malformed JSON, wrong company/currency/cutoff, invalid exact money, duplicate or decreasing cursor, contradictory receipt state and oversized list are rejected fail-closed.
- Every action on a selected row goes through the pre-existing server-backed point reader again and then existing SQL authorizer/revision checks. A stale live page can never authorize posting, approval or manual cash count.
- A cash claim is not a bank deposit. A draft or approved receipt is not posted; neither cash evidence nor posted-V2 balances are guaranteed to cover legacy opening books.
- No new permissions, roles, tables, SQL migrations, financial postings or hosted staging are introduced.

## Safety
Requires the existing isolated new staging-project, real cloud AAL2 session and trusted company role gates plus the new **independent** inbox flag. No existing Supabase business project, production writer, customer enrollment, main branch merge, deployment or paid resource was touched.

**CI proof:** app TypeScript, strict, lint, file-size ratchet, Vitest + React UI, build, local PG concurrency/restore and real local Supabase Auth/PostgREST checks must pass on THIS commit. Passing CI does not replace #68/#72 founder-approved hosted synthetic staging verification.

## Follow-up
Codex #78 currency contract still needs separate reviewed compatibility integration. The UI deliberately prints original exact source minor units until company-backed exponent is certified. A later review may add auditable queue filtering/search; do not cache or fabricate counts from incomplete live pages.
