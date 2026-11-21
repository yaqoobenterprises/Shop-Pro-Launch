# AQVORA — Controlled Cash Collection Operational Workspace
**Status:** code-only Draft PR stacked on [#71](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/71). Default OFF; no company onboarding, financial posting, bank validation, production operations, `main` merge or hosted staging performed.

## Real source-backed capabilities

- `src/services/aqvoraCashCollectionOperations.ts` calls **only** the existing backend #63 RPCs:
  - `create_aqvora_cash_collection`: original actor/intent/company/customer/date/currency/amount checked; exact lossless positive signed BIGINT string, source kind fixed `controlled_cash`.
  - `confirm_aqvora_cash_collection`: only distinct OWNER from maker, original amount exactly counted, literally `cash_counted_in_person`, current optimistic revision, server returns confirmed manual attestation. **Not** proof of physical possession or a bank statement.
  - `cancel_aqvora_cash_collection`: original maker or OWNER can cancel an **unconfirmed** claim with mandatory reason and server revision; never delete or reverse posted cash.
  - `get_aqvora_cash_collection`: actual read-only, reverified original source by UUID. No fake cash balances, no arbitrary account ID and no demo fallback.
- `src/accounting/pendingCashClaim.ts` persists original create intent and exact request in per-company/per-actor **tab sessionStorage** before network send. An uncertain creation response locks new cash intents until the identical request is retried. If storage fails or is corrupt, refuse to send a new claim; never synthesize a success.
- `CashCollectionWorkspace` and `CashCollectionForms` provide separate create and inspect/confirm controls; a second OWNER can copy the original source UUID from the maker. No posting or settlement control exists. Cash is not marked “received in the bank”, “paid invoice” or “posted to ledger.”
- `stagingFinanceNavigation.ts` unifies V2 feature-gated navigation in the existing desktop Sidebar and mobile More; no repeated hard-coded stage menu conditionals. The page is lazy-mounted under `aqvora-cash-collections`.
- TypeScript, unit, React UI and navigation tests cover default OFF, non-owner/no-cloud denial, exact amount, same-key retry, tampered money/company/source, role change, stale revision, manual count, cancelled claim, mobile route and denial UX.

## Safety gates

ALL conditions:
1. `VITE_ENABLE_AQVORA_VERIFIED_AR_READS=true`
2. `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`
3. `VITE_AQVORA_STAGING_PROJECT_REF` matches a verified **new disposable** project URL, never known existing business refs
4. `VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS=true` — **new independent default-OFF operational source flag** (not set by this PR)
5. Cloud OWNER or MANAGER with matching live session; actual SQL enforces live `auth.sessions`, AAL2, canonical company role, verified active customer, period, policy, exact cash method and separate OWNER checker.
6. Trusted cash policy and accounts configured by approved synthetic staging only. Existing backend migration seeds no policies/company enrollment.

This is not a banking integration and **does not create** an accounting receipt or a GL entry. Once cash is confirmed, the next, independent workflow is receipt draft → 1–99 invoice allocations → submit → distinct OWNER approval → source-owned **Dr Cash / Cr AR** posting, with an extra financial writer gate and original posting idempotency receipt. That is a **separate pending frontend PR**, not present here.

## Readiness and remaining gates

- CI app/PG/local Auth tests passing is required but does not replace hosted real browser E2E.
- Company timezone business dates, cross-tenant IDs, stale revisions and multiple-device ownership need actual hosted staging negative tests.
- Source lists remain live, not certified historic cash snapshots; this UI instead uses one original source ID per confirmation.
- Policy exception for unallocatable cash, refund, overpayment, returns, independent bank verification and aging remain unavailable.
- Legacy Shop Pro cashbook balances and offline queues remain untouched; no “correct new V2 balance” can include unverified legacy openings.
- Do not enable on a real business, create paid resources, merge to `main`, migrate production, or activate financial writers without explicit founder approval and the E2E checklist in [Issue #72](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/72).

**Architecture tie-in:** [global ERP blueprint Draft #73](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/73), [currency policy blocker #68](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68), and backend Cash Receipt contract [#63](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/63). Current financial writer approval remains SQL-only.
