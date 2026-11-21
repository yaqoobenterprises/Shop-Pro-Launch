# AQVORA — Codex Hard-Backend Assignment & Handoff (21 Nov 2026)

> **For Codex:** Engineering instructions in English. The founder is the final decision-maker. Do not touch production, existing Supabase business projects, `main`, enable any financial writer or create a paid resource. Work in a new branch and **Draft PR** based on the correct backend stack.

## Mission

AQVORA is being built as a globally usable, reliable multi-company ERP, not a prettier cashbook. Frontend functional work already exists (separate Drafts #64→#71). Your **first hard task** is exactly **[Issue #68 — source-owned currency minor-unit scale and historical display policy](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68)**. This is a P0 release blocker: current GL/AR/TB financial reads expose exact integer minor-unit strings but do not expose independently verified currency exponent metadata. The React client correctly refuses to invent PKR decimal conversion.

### Prep — must complete first

1. Read current repo `README.md`, `04_CURRENT_HANDOFF.md` if present, [global workflow blueprint](./AQVORA_GLOBAL_ERP_PROCESS_BLUEPRINT_2026-11-21.md), [delivery gap matrix](./AQVORA_DELIVERY_GAP_MATRIX_2026-11-21.md), Issue #68 and acceptance Issue #72.
2. Inspect **latest** backend Draft [#63](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/63) (which contains the invoice #59 and previous ledger/CoA stack) and its CI. Inspect, but do **not** rewrite, the frontend Draft [#71](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/71) and issue-related UI contracts.
3. Verify branches and commits; choose one clean backend branch stacked on #63 (or its actual newer verified Codex descendant if one has appeared). Don't mix unrelated UI #43/#50/#56/#58/#61/#62 histories.
4. Check current Supabase changelog/official docs, CLI version and migration procedures; no shortcuts in RLS, grants, session checks or privileged functions.

## FIRST deliverable — narrow, real implementation: audited currency policy

Design and implement **minimal source-owned, company-scoped and effective-date/version-aware currency-unit policy** compatible with existing exact BIGINT minor-unit postings.

### Required decisions and invariants
- Distinguish `transaction_currency`, `ledger/base_currency` and `display scale` as explicit concepts. **Do not add FX recognition or full multi-ledger accounting in this task.**
- Define an authoritative exponent / `minor_units_per_major` domain or versioned policy record under trusted control. No implicit `Intl`/ICU/JS Number/locale or user-supplied browser scalar. Where legal/finance signoff is absent, support `unconfigured` and refuse formatted major-unit figures rather than guessing.
- Explicit `effective_from` and policy revision/hash. Never retroactively reinterpret stored posted integers. Any policy change that would change meaning of earlier source amounts must be explicitly blocked or handled through a new approved book/cutover procedure; do not rewrite historic amounts.
- Cover both **read metadata** and **posting source compatibility**: the authoritative currency policy revision must be consistent on ledger, AR, invoice, customer receipt, report page and source receipt where needed. A report spanning incompatible revisions must fail closed (not silently mix amounts).
- Do not assume a universal 2-decimal currency; test PKR, JPY, KWD and CLF **with finance-reviewed reference fixtures**; explicitly distinguish test fixtures from approved production policy.
- Exact arithmetic: signed 64-bit bounds, canonical string decimals, positive quantity millionths, source-specific half-up rounding, discount/tax policy, no floating-point pricing.
- Keep existing V2 service-only out-of-tax-scope policies and writer default-OFF. No new tax applicability or unsupported revenue type; no company enrollment.
- Expose a **small typed versioned read contract** that ChatGPT can safely format with BigInt quotient/remainder. Include tenant/legal entity scope, currency, exponent, effective date, policy version/source and completeness. Avoid reading other tenants or bypassing RLS.
- Capability-based future approvals can be planned, but this task **must not** weaken current independent OWNER approval/security.

### Security and durability tests
- Real disposable local PostgreSQL + local Supabase Auth/PostgREST: active OWNER/MANAGER vs cashier, AAL1 vs live AAL2, tenant crossover, missing membership, revoked session, wrong date/currency, tampered metadata, invalid/stale policy, same-key altered retry, and source mismatch.
- Concurrent fiscal policy update versus invoice issue, report pagination and receipt allocation must not produce inconsistent money or doubled journals.
- Migration ordering and full synthetic backup/restore from a clean DB. Audit RLS, function search_path, grants and any SECURITY DEFINER; avoid public EXECUTE leaks. Check inherited advisor warnings.
- Existing financial API behavior must not be silently broken: backward compatibility or explicit version bump + server-side fail-closed rollout plan, with old clients default-OFF for new writer.

### Definition of done
- Separate **Draft PR**, correct backend ancestry and readable SQL migration/contract docs.
- All existing app, PG concurrency, local real Auth/PostgREST, build/lint/size/audit green, with exact CI job/run links and test counts.
- A source-backed invoice → posted receipt → AR → GL/TB can show the same exact raw minor units and independently source-certified scale; no JS floating math or guessed major units.
- Document unsupported regions, finance approvals pending, migration/restore evidence and explicit deployment/enrollment prohibition.
- If policy choices remain materially ambiguous, implement schema/contract in **inactive state with clear blockers**, not arbitrary configured country values.

## SECOND hard task — only after first is verified and capacity allows

Review [Issue #72 — E2E accounting acceptance](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/72). Prepare **isolated staging rehearsal** with separate synthetic legal entities, real AAL2 and maker/checker; source invoice → posting receipt → controlled cash → receipt allocation → AR/GL/TB, backup/restore, cross-tenant and concurrency. **Do not provision paid or hosted resources without founder approval.** You can run isolated/local test environments permitted by project policy, but don't connect to existing cloud business projects.

## Explicit role split / prevent duplicate coding

| ChatGPT owns now | Codex owns now |
| --- | --- |
| Source-backed Customer Receipt operational React UI on backend #63, user flows, field validation, accessible errors/loading, source/retry UX, tests | Signed-off currency-unit contract, SQL migration and authenticated source metadata (#68) |
| Source-compatible selective integration of frontend #43/#50 with latest #71 (review first), responsive founder-locked UI | SQL security, concurrency, immutable journals, RLS/Auth, migration and physical restore hardening |
| UX and browser QA with exact error states; maintain Draft PRs and full gap matrix | Real disposable local Auth/PostgREST and backend performance load tests; staged finance policy hardening |

**Do not build a second frontend UI or a parallel receipt posting SQL engine.** The server already implements receipt settlement in #63, and ChatGPT handles its interface. Do not produce large speculative schemas for future HR/POS/AP before first financial journey passes a real synthetic staging test.

## Output format expected from Codex

1. Exact base/head branch and commit, Draft PR URL, changed SQL/contract/tests.
2. Engineering decisions and any country/legal assumptions explicitly **not approved**.
3. CI run URLs, application/Postgres/local Auth counts, negative authorization/race/restore results.
4. Unresolved security/accounting blockers, no production/staging/cloud changes performed.
5. A narrow API contract handoff for ChatGPT to implement major-unit rendering and integrate code safely; which parent branches are compatible.

## Non-negotiable release rules

No production Supabase, existing company migrations, existing-company V2 writer enrollment, blind merge, `main` update, paid resources or public release without explicit founder approval. Strong CI is **necessary but not sufficient** for global ERP readiness. Formal finance/legal/localization policy and realistic real-browser staging remain mandatory.
