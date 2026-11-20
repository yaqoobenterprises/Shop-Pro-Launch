# AQVORA — Staging-only verified financial report transport

**Status:** Safe, default-OFF, read-only adapter for Codex PR #53's `read_aqvora_general_ledger` and `read_aqvora_trial_balance` RPCs. This is a child Draft PR on the verified report assembler PR #56. It does not register a route or activate financial posting.

## Contract

File `src/services/aqvoraVerifiedFinancialReadService.ts` exposes:
- `isIsolatedVerifiedFinancialReadEnabled()`: a strict local presentation/integration gate.
- `loadIsolatedVerifiedTrialBalance(request, options?)`: account-complete, certified V2 TB.
- `loadIsolatedVerifiedGeneralLedger(request, options?)`: account-complete, certified V2 GL.

These use the existing Supabase browser client and session infrastructure. Both functions call the read-only RPC by its exact Codex name. An authenticated cloud session matching the selected user is checked **before and after each RPC page** and after the entire report; session loss denies the report. Successful results must have the same authoritative `authorized_user_id` as the selected user. The assembly layer on parent PR #56 requires complete, company-matching, unmodified V2 source metadata and verifies exact BigInt money, row counts, cursor ordering and totals.

### Default OFF and isolated staging rules

All conditions must be true:
1. `VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS=true`
2. `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`
3. `VITE_AQVORA_STAGING_PROJECT_REF` is a nonempty **20 lowercase letter** Supabase project ref.
4. The configured normalized `VITE_SUPABASE_URL` is **exactly** `https://<ref>.supabase.co`, not a redirect, different domain, extra path or lookalike.
5. Ref must NOT be either existing business project `xarbzazjzcaezcpstiga` or `ienwbrrzsutbispaiymi`.
6. A real configured publishable/anon key and a matching cloud-authenticated session must exist. Actual MFA/authorization/tenant isolation remain controlled by PostgreSQL, not the flag.

**These env switches are only a developer safety gate, NOT permission to deploy or start a new staging project. Founder authorization is still required before hosted project creation, migrations, or live tenant activation.**

## Failure semantics

- Auth/session offline, tenant mismatch, malformed response, changed session identity, SQLSTATE 42501/40001/23514 or incomplete cursor pagination: throw and **return no financial report**.
- No synthetic/sample fallback, no transfer of legacy Shop Pro balances to V2 reports, no modification to cashbook or offline queue.
- `legacy_included=false`, `opening_migration_verified=false`: server V2 totals cannot be advertised as the complete financial statements of an existing business.
- No retry is performed automatically after 40001. A future caller may clear all rows and retry from page one with a bounded policy.

## Tests

`tests/aqvora_verified_financial_staging_transport.test.ts`: mocks only the browser transport and uses genuine underlying report validators. Exercises default-off gate, forbidden existing business project, host lookalikes, demo/noncloud user, missing session, exact RPC selection, strict source/authorized user matching, surfaced SQL errors and mid-request session disappearance. No external account is contacted during unit tests.

## Remaining integration gates

- Deliberately combine backend #53 with client #56 and this PR; the separate frontend route stack #50 is NOT automatically merged.
- Isolated hosted staging testing with actual AAL2 credentials and two synthetic tenants, followed by real browser end-to-end smoke verification, keyboard/mobile/permission error states and load limits.
- Existing-company opening/migration reconciliation, approved accounting period and year-end policy, legacy offline queue/restore and security-advisor issues.
- Product read-only GL/TB screens should be activated **only after security review and founder approval**. Do not activate journal posting.
