# AQVORA fresh-company financial setup — actual staging UI + API

**2026-11-21 | Founder-approved zero-opening rule.**
This is a child of [Draft #96](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/96) and integrated Draft #87. It is **not** a legacy-Cashbook migration, a production launch or a financial writer activation.

## Implemented source-backed user workflow

- New isolated staging route `aqvora-finance-setup`, visible in the sidebar **only to real signed-in OWNER** with feature `VITE_ENABLE_AQVORA_FRESH_FINANCE_SETUP=true`, verified V2 report reads and the already guarded non-business staging project. Existing known business Supabase refs are explicitly excluded by the inherited verified-read gate. Production flags remain OFF.
- `src/services/aqvoraFreshFinanceSetupService.ts` checks user/cloud/OWNER, session before and after SQL RPC, exact company and currency. It first collects an **authoritative full-history, MFA-authorized, source-certified V2 Trial Balance** from 0001-01-01 through 9999-12-31. It insists on zero source journals/lines/debits/credits and zero closing debits/credits; missing or RLS-denied books are NOT treated as zero.
- Reads the existing actual owner-authorized RPCs `list_aqvora_accounts` and `list_aqvora_periods`, bounded to 30 pages of 100 entries, validates tenant IDs, duplicate codes/period ordering, and certifies financial source token unchanged after listing. SQL owns RLS, MFA, authorization and data; UI **does not** grant access.
- Owner can enter and create a single real posting-leaf Chart of Accounts entry (code, name, account class and normal side) via existing `create_aqvora_account`; after a successful server response it fetches `get_aqvora_account` and compares the persisted record exactly. SQL writes its immutable admin audit; no financial journal is emitted.
- Owner can create a real non-overlapping fiscal period via `create_aqvora_period`; after response independently fetches `get_aqvora_period`. Overlap and owner-role controls are enforced by existing SQL. Missing/changed receipts or denied sessions are visible errors; **no automatic retry** of an uncertain write (a network timeout might occur after commit).
- Responsive form + server-derived account table and fiscal calendar; accessible labels, 44px+ buttons, concise no-import, no-money, no-writer text. No fake seeded company or sample ledger data in this route.
- An owner **cannot activate the V2 financial writer** via this route. Atomic new-company-only owner-approved enrollment/activation remains a separate critical Codex backend task and release gate. Existing companies cannot be silently reset or migrated.

## Tests

- `tests/aqvora_fresh_finance_setup_service.test.ts`: staging/owner/MFA/session gate, company scoping, two-token zero certification, exact admin RPC request/receipt/get, stale/foreign listing fail-closed, denied sessions and server error, invalid code/fiscal date, no financial posting RPC.
- `tests/aqvora_fresh_finance_setup_ux.test.tsx`: real source-backed empty state, owner-only behavior, working account/period forms, server failure display, refresh and no fake posting action.
- Parent #96 already proved real owner-only CoA/fiscal RPCs and certified zero source on disposable PostgreSQL with full migration order + AAL2, 808 app tests and three green CI jobs at SHA `1afb42ad7f013dc49c232995ec900e4d1af18269`; this child must pass its **own exact-head CI**.

## Explicit gaps / safe next steps

- Actual staging project and real user walkthrough **not yet executed**; client tests use synthetic service mocks, while parent #96 SQL tests use actual disposable PostgreSQL, not hosted Supabase.
- Country fiscal calendar templates, CoA control account setup, invoice/A/P customer-linked CoA, opening-evidence policy, accountant multi-owner approval, all-role identity, dedicated activation receipt and concurrent bootstrap must be reviewed/implemented by Codex and tested on real isolated staging.
- Existing finance UI Journal Composer remains preview-only; this route alone does not make posting, P&L, Balance Sheet, purchases, inventory, payroll or cash/AR complete.
- Old Cashbook CSV is preserved privately; there is **no automatic historical import** and no existing-company balance rewrite.
- No production Supabase SQL or source data accessed, no paid resources, no `main` merge, no Vercel production changes, no financial writer activation. Vercel free deployment quota previously returned HTTP 402.

Founder plan and release readiness are tracked in [issue #89](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89).
