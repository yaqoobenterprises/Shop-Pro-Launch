# Phase 02 · Task 01 financial baseline

**19 November 2026 · `codex/shop-pro-core-audit` · application revision `4f730ebffea2e5ec91e1586c0c6cc65b7083be80`**

All seven requested checks passed before adding tests. The new cashbook fixture confirms the worked example across account movements, SQL views and the TypeScript report calculation. It also reproduces **A02** in isolation: if the database commits a receipt and the acknowledgement is lost, the client can post it again.

## Baseline run before test changes

Windows x64, PowerShell, Node 24.22.1, npm 11.19.1. The repository's CI uses Ubuntu and Node 22. `npm ci` succeeded using the checked-in lockfile, installed 292 packages and reported zero vulnerabilities. npm warned that the esbuild postinstall script was outside its configured allowlist. The Vite build succeeded with the installed platform binary. No dependency versions or install-policy settings were changed.

| Command | Result |
| --- | --- |
| `npm run lint` | Passed with the repository's zero-warning threshold. |
| `npm run typecheck` | Passed. |
| `npm run check:strict` | Passed for the repository's configured strict subset. |
| `npm test -- --reporter=dot` | **316 passed in 52 files**, 75.90 seconds. No failed tests. Used the dummy Supabase URL and publishable key from the CI workflow. Some existing error-path tests emit expected stderr. |
| `npm run check:size` | Passed, 198 files. |
| `npm run build` | Passed, including its typecheck. Vite 6.4.6 transformed 1,776 modules. |
| `npm audit --audit-level=high` | Passed, zero known vulnerabilities reported for the root npm project. |

## Regression evidence

**Final full run:** 323 passed and one expected failure across 53 files in 74.85 seconds. The eight new cases account for seven passes and the verified A02 failure. There were zero unexpected failures and zero environment-blocked cases. Lint passed again, the size check passed on 199 files, and a targeted TypeScript diagnostic check of the new test with Node types returned zero errors.

The [test suite](../tests/cashbook_regression.test.ts) uses Vitest 4.1.12 and PGlite 0.5.8. It loads the unmodified launch baseline and four subsequent October migrations into an in-memory PostgreSQL database. Supabase Auth is represented by synthetic users, roles, session claims and an empty factor table. Role-scoped checks run as `authenticated`. The shop clock is fixed at 19 November 2020, so opening and transfer triggers assign the same business day on every run.

The [business rules](BUSINESS_RULES.md) supply the expected values independently of the implementation. The ordinary cases start with the same data and roll back scenario changes. A second shop has its own receipt on the same day. The lost-response scenario uses a separate shop so the RPC and fallback can each commit before their results are measured.

| Scenario | Classification | Observed result |
| --- | --- | --- |
| Opening balances and pending draft | Passing | Cash 200.00, Bank 0.00, one opening movement. Saving a draft leaves funds and both SQL summaries unchanged. |
| Six cashbook entries and an internal transfer | Passing | Income 100.50, expense 32.25, owner contribution 500.00, drawing 12.00 and adjustments +0.55/−0.30. Operating result 68.25. Transferring 100.00 leaves Cash 656.50 and Bank 100.00. Each stored balance matches the sum of its signed movements. |
| Duplicate calls to the draft posting RPC | Passing | Both calls return the original receipt. Cash finishes at 300.50, with one receipt movement plus its opening. |
| Void and restore | Passing | Voiding the expense raises Cash to 688.75 and the result to 100.50. Restore returns Cash to 656.50 and the result to 68.25. Both actions retain actor attribution. |
| Amount and note corrections | Passing | Changing the expense to 40.00 leaves Cash 648.75 and the result 60.50. A subsequent note edit creates an audit change and leaves balances, movement counts and reports intact. |
| Daily, monthly and empty-period reporting | Passing | Another 9.75 receipt on the prior day raises November's result to 78.00. The worked day remains 68.25. An October receipt stays outside November. An empty day has no SQL summary row and yields zero TypeScript totals and a zero trend bucket. |
| Cross-shop isolation | Passing | The second owner sees their 7.77 receipt and its movement. The two owners get different daily and monthly totals over the same dates. |
| Client retry after the database commits and the reply is lost | **Expected failure · verified A02** | Expected one receipt, income 100.50 and Cash 300.50. Observed **two receipts, income 201.00 and Cash 401.00**. |

**A02 verification.** The test uses the real `LedgerService.postTransactionDraft`, `recordTransaction` and Supabase query builder. A local transport runs the draft RPC in PGlite, drops its first successful reply, and translates the ensuing direct upsert into PostgreSQL with the requested conflict key. The normal RPC and the fallback use different keys. The actual database movements and daily view supply the result. This demonstrates the failure mode on synthetic books. Its frequency in production was outside this task.

The A02 case was also run as an ordinary assertion. It exited 1 with exactly the expected-versus-observed differences above. In the retained suite only that accounting assertion uses Vitest's `it.fails`. Setup and the checks for an actual lost reply and a completed service response run outside the marker. A different financial outcome fails setup, and a correction producing the intended outcome causes an unexpected pass until the marker is removed. The posting fix belongs to T03.1 in the [refactor plan](REFACTOR_PLAN.md).

## Reproduction and scope

Use `npm test -- tests/cashbook_regression.test.ts --reporter=verbose` for the focused suite and `npm test -- --reporter=dot` for the full run. For full-suite parity set `VITE_SUPABASE_URL=https://supabase-ci.invalid` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_test` as in [CI](../.github/workflows/ci.yml).

The financial tests need no hosted database, customer data or real credentials. They exercise the SQL posting and reporting boundaries and the TypeScript reducer. Browser flows, deployment parity, backup restoration and the remaining Phase 01 findings have separate acceptance criteria.
