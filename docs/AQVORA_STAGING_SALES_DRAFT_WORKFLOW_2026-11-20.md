# AQVORA — functional isolated-staging customer + service-invoice draft workflow

**Scope:** one independent Draft PR stacked on first functional read-only AR workspace #67. Adds actual guarded PostgREST operational draft mutation code **only when explicitly enabled in an authorized isolated staging build**. NO financial posting is mounted from the UI; no real existing company or production project was accessed.

## Working code

- `src/services/aqvoraStagingSalesDraftService.ts`:
  - `isIsolatedSalesDraftCreationEnabled`: default OFF, requires *both* existing V2 isolated AR read flags and `VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS=true`.
  - `createIsolatedSalesCustomer`: exact backend RPC `create_aqvora_customer`; authoritative company/actor/customer code/name/revision checks.
  - `createIsolatedServiceInvoiceDraft`: exact backend RPC `create_aqvora_sales_draft`; canonical integer-string money, positive quantity-millionths, tax/inventory/unknown fields rejected, line half-up rounded gross, discount and aggregate face recomputed against server response. No floats or guessed currency exponent.
  - Both operations recheck matching cloud session before and after the RPC; SQL itself enforces AAL2, active canonical OWNER/MANAGER, company ownership and idempotent transactions. Browser flags are not authorization.
- `src/components/accounting/SalesDraftsWorkspace.tsx` + `SalesDraftForms.tsx`: separate customer creation and service draft panels with accessible labels, proper loading/errors, validated exact minor unit input, successful saved source identity/revision/face.
- `src/App.tsx`, `AppContext.tsx`, `Sidebar.tsx`, `MobileNav.tsx`, `Header.tsx`: new lazy route `aqvora-sales-drafts` available only in an isolated staging cloud OWNER/MANAGER context with **extra mutation flag**. Demo/legacy/prod remain hidden and blocked.
- `tests/aqvora_staging_sales_drafts.test.ts`, `tests/aqvora_sales_draft_workspace_ui.test.tsx`: negative/positive functional API and form tests.

## Lost-ACK / idempotency UX

- Creating a customer uses a company-unique code. If a response is uncertain, the UI freezes the original code/name and offers **Retry identical customer request**, not a changed customer.
- Creating a service invoice draft generates one secure unique `crypto.randomUUID()` intent key per original request, saves the complete original request in component state, locks all amount/customer/date fields on an uncertain result, and offers **Retry identical invoice intent**. It does **not** invent a new intent to recover a lost response. Returned source may be a previously created document; it must match the original company, actor, customer, exact lines and totals.
- Only after a server-confirmed result can a user consciously select **Create another draft**, which is a new intended operation. Stale company/user results are ignored.
- Preflight rejects invalid date, noncanonical values, zero price/quantity, out-of-BIGINT amounts and excess discounts before reserving the retry intent.

## Important financial/security limitations

1. **Draft creation does not post** Dr AR / Cr Revenue and creates no cash or liability. Approval, issuance, money posting, cash-count attestation, settlement and irreversible actions have **NO active UI controls** in this PR. They require separate reviewed functional workflows and server-side verified policy.
2. No source bank verification, tax/GST recognition, inventory, refunds, owner-checker exception, multi-currency FX or year-end closing.
3. Existing Supabase projects and companies remain explicitly excluded by the staging feature gate. No environment flags are changed or enabled in deployment config; code is default OFF.
4. The selected company needs its own separately authorized and approved hosted synthetic test company before this UI may be exercised against a real PostgREST service. No production/staging resource has been created.
5. Source amounts display clearly as exact **minor units**. [Issue #68](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68) tracks authoritative server-owned company currency scale before major unit formatting.
6. Existing backend PR #63 and AR read PRs #64→#67 remain Draft, main untouched. Frontend #50, GL/TB #56/#58 and obsolete invoice readers #61/#62 are still separate sibling histories; no blanket merge.
7. Tests run against mocked browser RPC adapters; backend PostgreSQL and real local Auth/PostgREST tests are independent. Hosted browser E2E + role revocation tests, migration locks, backup/restore and founder signoff remain deployment gates.

## Follow-up workflow

After authorized disposable hosted staging is provisioned and confirmed, verify actual customer creation, invoice draft → submitted → independent OWNER approval → source-backed issue → controlled-cash receipt, invoice balance and GL/TB reconciliation. Add source-owned, idempotent approval/issue controls in a separately reviewed PR (never infer permission from frontend). Do not activate any existing-company financial writer.
