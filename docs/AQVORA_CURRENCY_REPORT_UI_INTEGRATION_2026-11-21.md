# AQVORA — Source-certified Currency Display and Real V2 Review Entry
**Status:** isolated frontend Draft child of #81 (visible sample preview) → #80 (functional financial integration) including Codex #78 (authoritative currency policy). **No production or hosted financial activation.**

## What is genuinely implemented
1. Financial read validation now checks the Codex #78 `aqvora-currency-report-v1` additive envelope on **every GL/TB page**. If evidence appears, disappears, changes with the same snapshot token or contains malformed policy chronology, authority, denomination, currency, date or company, the *whole report* is refused. Old servers with absolutely no evidence remain readable as **raw minor units**, not falsely converted.
2. Exact formatting is `BigInt` only: canonical signed integer, approved exponent 0–9, trusted company/current currency, denominator `10 ** exponent`, exact quotient/remainder and digit-string grouping. No `Number`, `parseFloat`, inferred `Intl` currency digits or rounding drift. Handles SQL NUMERIC aggregates (including amounts above BIGINT) exactly.
3. GL/TB shows explicit `Source-certified currency display` with revision/effective date only when the returned report is complete and authority configured. For absent, historical-unconfigured, or incomplete policy, the UI retains `PKR N minor units` and a visible incomplete label.
4. In the founder's **AQVORA ERP Review** shell, a new **VERIFIED STAGING ONLY** navigation section appears exclusively when the existing tested Auth, company role and exact isolated staging project flags allow real finance workspaces. Existing staging routes are reused, not reimplemented or pointed at a synthetic demo. In normal user/demo builds, the section is absent. All existing financial writer defaults remain OFF.

## What this does NOT implement
- Does not claim the sample Business Overview chart is a real financial source. The sample shell remains separate from real secured V2 workspaces.
- Does not perform financial posting, company setup, currency approvals, country tax, FX, inventory, purchases, HR/payroll, bank matching, opening balance migration, or real hosted E2E.
- Does not bypass existing Supabase Auth/PostgREST AAL2, tenant/RLS, source RPCs, customer/invoice financial idempotency or independent maker-checker.
- Does not auto-enable staging flags, create a Supabase project, add secrets, mutate or merge into main, or deploy production.

## QA acceptance
- Currency policy scenarios: PKR/USD 2, JPY 0, KWD 3, CLF 4; positive/negative/zero/big aggregates, exact string grouping, multi-revision history, wrong company/FX/exponent/denominator, missing provenance, stale date, tampered timeline and omitted/repeated evidence between pages.
- UI: source configured vs historical unconfigured rendering, one-click navigation to existing verified workspace only when authorized, no sample-to-live fallback.
- Required CI on this branch: all app/unit UI tests, strict TS, ESLint, file-size ratchet, build, PG17, disposable Supabase Auth/PostgREST and dependency audit.

## Next engineering handoff
Codex owns Issue #72 LOCAL authenticated E2E full path: company→MFA→customer→service draft→independent approve→issue→controlled cash→receipt→AR/GL/TB, local DB logical restore, negative tenant/race/idempotency. Keep separate backend Draft on integrated #80; do not modify #81 UI. Hosted synthetic staging and finance policy approvals require explicit founder authorization.

After backend acceptance, ChatGPT can stage a full authorized React test company journey, port these source-certified policy labels into AR and receipt screens, then finish the locked Poital.flow UI to production-quality.
