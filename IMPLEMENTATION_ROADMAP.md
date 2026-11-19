# Shop Pro V2 — implementation roadmap, decisions and release gates

**Status:** Sequence proposal; no release or production migration is authorized by this document. Linked plans: [PRODUCT_BLUEPRINT.md](PRODUCT_BLUEPRINT.md), [ACCOUNTING_ARCHITECTURE.md](ACCOUNTING_ARCHITECTURE.md), [MODULE_REQUIREMENTS.md](MODULE_REQUIREMENTS.md), [UX_DESIGN_SYSTEM.md](UX_DESIGN_SYSTEM.md).

## Delivery rules

- Ship narrow, reviewable branches and PRs. Separate financial algorithms, SQL authorization, historical migration, UX and documentation.
- Main stays stable. CI green is necessary but not sufficient; staging database parity, tenant boundaries and real preview journeys also gate finance changes.
- Never mutate historic production transactions, apply pending migrations or enable new posting modes automatically.
- Every shop has one financial writer/book epoch. Parallel cashbook and journal writers must not create duplicate economic events.
- Use only authenticated, scope-verified, idempotent server posting; exact minor-unit calculations and immutable audit chains.
- Preserve cloud and device backups; rehearse restoration on an isolated system before cutover.

## Phase and evidence gates

| Phase | Engineering work | Exit evidence / block |
| --- | --- | --- |
| P0 — Safety baseline | Freeze known cashbook fixtures, CI, existing schema/migration facts, permission matrix, critical issues and clean backup | Owner-approved scope; pre/post values, zero unexamined drift |
| P1 — Integrity and security | Fix duplicate posting, Quick Expense split book, queue attribution and incomplete reporting; reconcile overlapping draft PRs; review SQL authorization/MFA | Lost ACK yields one receipt; owner/cashier/inactive/cross-shop tests; no unresolved high-risk posting defect |
| P2 — Accounting schema design | Approve book, Chart of Accounts, immutable balanced journals, source linkage, intents, fiscal periods, reversals, mapping rules | Isolated database migration + grant/RLS tests and balanced debit/credit fixtures |
| P3 — Accounting writer | One typed preview/confirm/post RPC and reconciliation-safe outbox. Implement journal voucher and smart entry as clients of same service | Both modes create equivalent posted lines/receipt; no stale retry or cross-shop insertion |
| P4 — Accounting readers | GL, journal, Trial Balance, P&L, Balance Sheet and bank reconciliation using same snapshot | Reports and exports reconcile to posted journal in minor units; all cells drill through |
| P5 — Legacy cutover | Read-only inventory of live legacy accounts/history, owner-approved mapping, signed opening manifest, pilot shop epoch fence | No unexplained opening differences; old queues recovered and legacy views preserved |
| P6 — Trade | Contacts, sales invoices, vendor bills, open items, partial receipts/payments and credits | Receivables and payables equal control GL on every tested date |
| P7 — Inventory | Stock item, receipts/issues, cost valuation, returns/counts and COGS | Stock quantity/value ties to Inventory GL at cutoff |
| P8 — Premium UX | Shared design tokens and accessibility; responsive module screens; charts, themes, animation and multilingual staged release | Screenshots, mobile/desktop E2E, no financial changes in UI-only PRs |
| P9 — LedgerMate and launch | Server-authorized bounded tools, source facts, multilingual test corpus, verified backup/restore, staged pilot and monitoring | AI facts = report facts, no autonomous writes, successful restore, signed release checklist |

Visual design system and mock UI can be built in parallel with financial foundation, **but must not be wired to real posting until P3 gates pass**.

## Current evidence at 20 November 2026

- GitHub main has the cleaned repository and professional README, while financial improvements remain unmerged.
- The prior audit branch contains baseline cashbook evidence and regression cases, including a duplicated receipt on a lost RPC acknowledgement.
- Draft PR **#23** is a narrowly scoped A02 fix: it preserves original draft identity and removes divergent direct-record fallback. The latest GitHub Actions run passed **54 test files / 326 tests**, lint, typechecks, size and build. This is **test verification, not production authorization**.
- Existing PR **#8** overlaps this fix and also addresses Quick Expense. PR **#9** contains additional authorization work, and PR **#18** handles LedgerMate. Reconcile their diffs rather than merging stacked/conflicting branches blindly.
- Supabase live migration metadata shows that the authorization hardening and multi-conversation history migrations remain pending. No migrations or live business rows have been changed during this plan work.

## Decisions requiring owner / accountant sign-off

| ID | Decision | Why it matters |
| --- | --- | --- |
| B1 | Which cash-basis operating headline and which events count as profit? | Separates shop cashbook from accrual statements |
| B2 | What does historical investment represent (owner funds/loan/other)? | Prevents false historical reclassification |
| B3 | Role matrix, shared drafts, report visibility and multi-shop membership | Required for SQL authorization |
| B4 | Cash overdraft policy and archival account behavior | Determines approval/validation and reversal |
| B5 | Late/backdated entry policy, transfers and closed periods | Determines period consistency |
| B6 | Whether provisional reports/export are allowed and how to recover unscoped items | Determines completeness labels and queue behavior |
| B7 | Base currency, precision and maximum entry/aggregate size | Drives exact minor-unit invariants |
| B8 | Legacy desktop, local-only and retail expense retention/repair | Drives historic migration and duplicate review |
| B9 | Backup loss tolerance, restore goals, preferences/AI retention, provider privacy | Drives recoverability/privacy contract |
| B10 | Paper register import category mapping and intentional duplicate rows | Drives import retry keys and review UX |

Record the chosen policy, approver, effective date, example and linked tests for each decision. Until approved, preserve original data and do not use clearing accounts to force agreement.

## Migration and financial release checklist

1. Inspect actual deployed migration ledger, function definitions, grants and RLS in read-only mode; compare to source and a fresh disposable staging database.
2. Reconcile account opening + signed movement sum with cached balances, posted transaction counts and idempotency pairs **without mutating existing rows**. Any anomaly becomes an owner-reviewed correction proposal.
3. Validate lost-response/replay, duplicate clicks, competing account choices, two devices, role demotion, MFA, expired sessions, archived accounts, backdating and cross-shop authorization on staging.
4. Validate complete read snapshots, CSV/XLSX/AI totals and statements against a common hand-calculated fixture.
5. Rehearse private backup and isolated restore, preserving source IDs, balances, auth references, audit records, queues and chat retention as approved.
6. Stage enablement by shop/role, monitor finance exceptions and define a tested rollback. Old clients must be fenced from the new writer.
7. Only after owner signs the financial invariant report, security report and recovery rehearsal should the relevant PR be eligible for merge/deployment.

### Stop conditions

Stop rollout on any unexplained debit/credit imbalance, duplicate intent, mismatched account movement, unauthorized row visibility, queued item falsely marked posted, incomplete export labeled complete, missing restoration data, or schema drift.

## Next safe implementation sequence

First finish A02 review and authorization staging validation. Then reconcile Quick Expense into the cashbook and source-account effects. Establish posting/reading invariants before the V2 Chart of Accounts and general journal. Do not prioritize ornamental UI over money correctness, but build visual components separately once the token system and screen contracts are approved.
