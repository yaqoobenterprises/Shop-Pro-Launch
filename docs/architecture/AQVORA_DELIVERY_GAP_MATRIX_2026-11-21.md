# AQVORA — Verified Delivery Matrix & Integration Decisions
**Snapshot verified:** 2026-11-21, based on source handoff `04_CURRENT_HANDOFF.md` (20 Nov) plus live GitHub PR metadata and the latest code/contracts. **Do not use PR test counts as proof of hosted deployment.**

## 1. Evidence/status definitions
- **Implemented Draft:** code exists on the specified Draft PR, isolated tests/CI may pass, but it is NOT in `main` or deployed for real companies.
- **Read-only/UI only:** browser route/adapter works against contracts in code; flags remain OFF; not a complete operational flow.
- **Source-certified local:** Postgres/Auth CI test evidence exists; not the same as a hosted multiple-user real browser test.
- **Real staging verified:** founder-authorized disposable hosted project, migrations, real MFA and synthetic transactions with recorded cross-module journal controls (NOT YET).
- **Production ready:** only after migration/legacy security/country policy/recovery/reconciliation/UX signoff, founder approval and controlled rollout (NOT YET).

The current `main` README correctly describes **Shop Pro cashbook**, not a double-entry ERP.

## 2. Verified PR-to-workflow trace

| Capability / evidence | Work known at this snapshot | Honest outcome / missing piece |
| --- | --- | --- |
| Founder-locked shell, finance UI concept | Frontend Draft [#43](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/43), separate structural UX sibling [#50](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/50) | Reference and improved real UI exist in independent histories; must resolve conflicts intentionally with finance branch; not proof of live ERP |
| Company chart/fiscal backend | Backend Draft [#44](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/44); inactive frontend admin adapter [#45](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/45) | Server API prepared; company onboarding/policy/real admin UI and migration rehearsal remain acceptance gates |
| Balanced double-entry source-owned posting | Backend Draft [#41](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/41), migration/security [#42](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/42), ledger/TB [#53](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/53) | Local/CI verified; existing company financial writer remains disabled; no legacy economic balance migration |
| Service invoice → AR | Codex Draft [#59](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/59) | Service-only, verified out-of-tax-scope policy; NOT complete O2C, stock, tax invoices or bank verification |
| Dual-controlled cash → customer receipt → AR allocations | Codex Draft [#63](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/63) | Partial/full allocations, manual source attestation; real end-user mutation UI missing; bank matching/refunds/unapplied cash/aging excluded |
| Certified receipt/AR source validation and reads | Draft [#64](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/64) → [#65](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/65) → [#66](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/66) | Read-only, default OFF; checks source/receipt/session, not a hosted tested bank integration |
| Functional AR and invoice/receipt evidence UI | Draft [#67](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/67) | Staging gated live RPCs + UI tests; no all-company legacy AR; major currency display shows explicit minor units pending #68 |
| Customer/service invoice draft form | Draft [#69](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/69) | Default-OFF isolated draft mutations; not invoice issuance/posting |
| Verified GL/TB UI + posting account selector | Draft [#70](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/70) | Source-verified V2 only; separate frontend #56/#58 code selectively included, not sibling-merged; no complete historic reports |
| Maker/checker invoice submit/approve, issue recovery UI | Draft [#71](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/71) | Final 3 CI jobs passed: 624 app, 37 PG, 13 local Auth tests across jobs; financial issuance separately flag OFF; no hosted end-to-end |
| Exact currency unit scale and signed-off locale accounting | [Issue #68](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68) | **P0 unresolved.** No authoritative policy scale; must not infer PKR paisa/FX from browser Intl |
| Synthetic end-to-end accounting QA | [Issue #72](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/72) | **P0 unresolved.** Cross-module real AAL2, staged migrations, restore, reconciliation, source drift and UI visual QA |
| Legacy balances/queues & migration | Old Shop Pro cashbook + archived safety PRs | **P0 release blocker** for existing company enrollment; no fake opening balances, direct rewrite or unsafe offline replay |
| P2P/AP, inventory, stock COGS, payroll, bank matching, P&L and BS | Product roadmap only; some isolated UI/pure functions in sibling PRs | **Not completed** as source-backed integrated workflows. No public “ERP complete” claims |

## 3. Immediate critical path — priority P0

| Order | Exact deliverable | Owner | Definition of done |
| --- | --- | --- | --- |
| 0 | **Contract merge/architecture audit** against [#63](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/63) → [#71](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/71) and UI #43/#50 | ChatGPT + Codex review | Dependency DAG, API diff, conflicts, no unrelated merge; current Drafts preserved |
| 1 | **Currency precision policy (#68)** | **Codex — hard DB/policy** | SQL-owned versioned exponent, historical as-of reads, exact test matrix, no floating arithmetic; API returns trusted policy; disposable local tests |
| 2 | **Customer Receipt operational UI** for #63 | **ChatGPT — frontend** | Cash creation/confirmation, receipt create/submit/approve/post, allocation UX, original-intent recovery; all guarded, complete source receipts; no unsupported bank-cleared claim; Draft PR green |
| 3 | **Real synthetic E2E (#72)** | **Codex — DB security/staging**, ChatGPT — browser QA | Independent AAL2 roles, doc → journal → receipt → AR → GL/TB tie-out, wrong tenant/revocation/409/replay, physical restore evidence |
| 4 | **Safe unified review branch** of compatible code only | ChatGPT product/frontend + Codex backend review | One coherent app runs on **isolated synthetic** data, no sibling blanket merge; CI and browser QA green |
| 5 | **Security/legacy readiness** before any existing-company rollout | Codex + founder decisions | Fiscal/tax signoff, advisors, rollback, immutable opening manifest and old-client queue fencing, backup/restore, explicit authorization |

A successful CI is **not** acceptance of real staged business behavior. Approved tax source and company enrollment cannot be inferred from an enabled frontend flag.

## 4. P1/P2 domain roadmap with prerequisites

| Domain | P1 capability | Prerequisite / later enterprise capability |
| --- | --- | --- |
| Finance close | CoA/fiscal admin, reviewable journals, source-based R2R, certified statements | Verified account mapping, opening and closing balances, comparative books, consolidation |
| Standard O2C | Quotation/order optional, service/goods invoice and receipts, aging, credits/refunds | Fulfillment/stock recognition, tax engine/e-invoice by jurisdiction, FX, dunning |
| Standard P2P | Supplier master, vendor bill approvals, AP and supplier settlement | PO/receiving match, vendor advances, partial/credit, budget control, FX |
| Cash/bank | Bank statement ingestion, matching, outstanding cheques/deposits, reconciliation | Cash forecasting, payment runs, connectivity by institution |
| Inventory/POS | Products/UOM, warehouses, stock receives/issues, POS and COGS to GL | Batch/serial/expiry, multi-location transfers, valuation policies |
| Operations | Service orders/projects/assets/payroll | Multi legal entity, local payroll, intercompany/consolidation |
| Analytics/AI | Verified source dashboards and read-only Copilot | Authorized anomaly detection, human-reviewed suggestions, never autonomous finance posting |

## 5. Decisions requiring founder/accounting sign-off (not silent assumptions)

1. **Initial regional launch:** select first supported country/legal tax regime and exact currency scale. “Worldwide-ready architecture” is not automatically “compliant with every tax jurisdiction.”
2. **Approval policy default:** retain conservative distinct OWNER maker/checker where current V2 enforces it; later define per-company threshold and capability-based roles without weakening SQL authorization or changing historical approvals.
3. **Currency books:** choose primary accounting/base currency, what multi-currency/FX means for a legal entity, source rounding precision and effective-date change control.
4. **Book configuration:** when to create one legal entity vs one tenant and whether branches share the same statutory ledger. Never mix separate legal entities in a single unsegmented trial balance.
5. **Bank/cash evidencing:** manual controlled cash count remains labeled **attestation**, not independent bank clearing.
6. **Legacy cutover:** migration manifest, opening balances, offline pending queues and old clients all require controlled audited plan before real company opt-in.
7. **Staging and rollout:** any hosted resources or existing-company writer activation require **explicit founder approval** and cost/privacy review.

## 6. Integration strategy (safe to execute)

- Keep product spec and backlog **independently branched from `main`**, docs-only. This does not merge or ship any accounting code.
- Let Codex work on one hard backend issue at a time, starting with #68; its new Draft PR should be stacked on the correct **backend head**, not generic `main` nor a sibling frontend branch.
- Let ChatGPT create a separate, narrow frontend Draft based on latest verified **#71** for receipts. UI flags remain OFF. Do not repeat backend SQL work already present in #63.
- Once policy and receipt UI have tests, construct **one reviewed integration branch**, selective commits/files from #43/#50 and backend descendant. Use source-contract/evidence matrix, isolate conflicts, run all checks.
- Only then request explicit approval for a **new disposable staging project**; verify real browser flows, security and backup/restore without touching existing business projects.
- Follow the founder-supplied locked UI image and AQVORA brand assets throughout, not just at the final release.

**Current shipping statement:** Shop Pro cashbook continues as the live product; AQVORA V2 enterprise workflows are separate, default-OFF Draft code with strong automated evidence but NOT rolled out.
