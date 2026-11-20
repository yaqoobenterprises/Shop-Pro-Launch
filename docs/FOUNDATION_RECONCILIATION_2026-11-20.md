# Foundation reconciliation — 20 November 2026

Scope: reconcile existing work and fix direct offline transaction replay. No production writes, migrations, PR merges or feature enablement were performed. All database writes used synthetic, disposable PGlite fixtures. The production inspection queried migration history and function/policy metadata only.

## Sources and exact revisions

Main: `725effd65632e15a72f078777a408555e4c4ad3a`. Read all five proposed V2 documents at blueprint `b307001b147c2c8eca4a28334b3cdf89718bd9e9`: PRODUCT_BLUEPRINT, ACCOUNTING_ARCHITECTURE, MODULE_REQUIREMENTS, UX_DESIGN_SYSTEM and IMPLEMENTATION_ROADMAP. Reused the audit findings on `codex/shop-pro-core-audit` and #23's cashbook fixture.

The available prior Codex chat, “Stabilize Shop Pro V2 foundation”, contains interrupted turns without an implementation handoff. Related chats “Shop Pro Goal Progress” and “Codex Branch Merge Workflow”, PR bodies, discussions and actual branch diffs supplied continuity. Historical test claims in those sources are not new verification.

| PR / inspected head | Reconciliation decision |
| --- | --- |
| [#8](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/8) `517f890` | Earlier financial bundle. Reuse its extracted replacements #23 and #25; do not merge both implementations. Local merge-tree confirms a conflict in `.github/workflows/ci.yml` against current main. |
| [#9](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/9) `e3929cc` | Stacked on #8. #26 extracts its authorization changes and additionally prevents canonical role promotion during provisioning. Retain until coverage is reconciled; recommend superseding, not independently merging. |
| [#18](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/18) `9ce1edd` | LedgerMate readers/UI. A whitespace-insensitive diff shows its ledger-service change is mainly the void-audit reader, despite extensive line-ending churn. Main alone merges locally, but the reconciled financial stack conflicts in `ledgerService.ts`. Rebase narrowly after finance; do not restore old fallback posting code. |
| [#23](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/23) `4f92d57` | Canonical A02 draft lost-ACK fix and reusable cashbook fixture. Base of the new focused replay PR. |
| [#24](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/24) `b307001` | Five planning documents only; integrate as proposals with decision register B1–B10 still pending. |
| [#25](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/25) `c4cd0f1` | Depends on #23. Same Quick Expense service as #8, with stricter active/shop account filtering and accurate pending copy. Reuse this implementation. Historical legacy expenses still need a separate reconciliation. |
| [#26](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/26) `7594e7a` | Security-only prerequisite, modifies the still-pending October authorization migration. Do not apply out of historical order without a staged migration plan. Its synthetic policy fixture is useful but cannot establish full deployed-schema safety. |
| [#27](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/27) `b186bf1` | Verified cloud activation/cache, canonical membership role and no invented cloud-cache openings. Depends operationally on #26; local-only/default legacy cash remains a separate defect. |
| [#28](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/28) `9cedabc` | UI/setup remains disabled. Requires #26/#27 plus server-side currency/timezone locking before enablement. Client history checks race with posting and are not a database guarantee. |

All nine were open Draft PRs during inspection. No PR was closed, approved or merged remotely.

## Implemented fix and evidence

Audit A12: `flushOfflineQueue` previously used conflict-update upsert with `status: active`. A server commit followed by a lost reply could overwrite an intervening amount edit or restore a void. The regression reproduced both against the actual financial migration triggers: a voided 100.50 receipt went from zero back to 100.50; a correction to 200.00 reverted to 100.50. Retry also added an audit update.

The new `offlineTransactionReplay` adapter inserts with conflict-do-nothing, then reads an existing receipt by shop/key if necessary. Both response paths must match original identity, amount, category, direction, business date, device instant, source text and note. A matching voided receipt confirms the original intent without restoring it. Missing/inaccessible/changed receipts retain the queue item for review. The replay path no longer invents missing original shop/creator/account; these items remain stored. Other creators/shops remain queued untouched.

The scope is application replay, not database immutability for all writers. Existing explicit edit/void workflows remain. The helper uses the signed-in client and does not replace database authorization. No UI or SQL file changed. The PR is stacked on #23 to reuse its independent draft retry fix.

- Red baseline: the initial 25 new cases produced **22 failures / 3 passes** before implementation; the void/correction failures asserted real balance, movement and audit changes.
- Initial targeted verification: **4 files / 61 tests passed**, including #23's draft and cashbook regressions.
- Reconciled local stack: #26 + #23 + #25 + #27 + #28 + #24 combined cleanly in a detached worktree; the replay patch was overlaid for testing. **9 files / 63 tests passed**, including owner/manager/cashier/inactive/demoted/cross-shop policy tests, full financial migration fixtures, cloud activation, Quick Expense and company setup tests. #18 was tested with merge-tree only and conflicts with that stack.
- Final replay/legacy compatibility checks: **2 files / 44 tests passed**, including all **31 new replay cases**. TypeScript, strict TypeScript, ESLint, file-size ratchet, production build and `npm audit --audit-level=high` passed (zero known vulnerabilities). The reconciled stack also passed TypeScript. Environment: Node 24.21.0, npm 11.19.0, Vitest 4.1.12; CI uses Node 22.
- Final complete branch suite: **55 files / 357 tests passed** using the CI dummy cloud configuration and `npx vitest run --maxWorkers=4 --reporter=dot`. An earlier full run found one outdated fluent-client mock; it was corrected to return the receipt and the complete suite rerun successfully. Logs are local ignored `full-tests-final.log`, `final-replay-tests.log`, `replay-red.log` and `build-verification.log`.

The Supabase client in the new tests is real; HTTP requests are dispatched into local PostgreSQL with authenticated RLS and actual migration triggers. This models PostgREST conflict behavior but is not a real PostgREST/Auth/MFA deployment. Concurrent drainer tests cover two client invocations on one PGlite connection, not independent PostgreSQL sessions. IndexedDB transaction-abort durability remains unverified by these memory-queue tests.

## Production facts and remaining release blockers

Read-only metadata from the connected Shop-Pro-Launch project on this date:

- Applied versions: `20261016094952`, `20261016122204`, `20261020055612`, `20261020060229`, `20261116195744`, `20261116195839`. Authorization `20261017062800` and conversation history `20261117054753` are absent.
- Effective `post_transaction_draft` is SECURITY DEFINER; its missing-draft receipt lookup has no organization predicate. This is a confirmed current definition, not an exploit attempted against customer data.
- Effective `ensure_my_profile` updates canonical role and sets membership active on conflict; `private.get_org_role` falls back to profiles. Disabled/demoted membership must not regain privileges through these paths.
- Effective transaction UPDATE policy checks `shop_members.role`. #26 still mirrors stale `profiles.role` into `shop_members`. Its demotion test checks organization updates, not transaction edits. Add full-schema demoted-cashier UPDATE/void tests before claiming demotion safety.
- Restrictive MFA policies exist on the inspected tables. Prove enrolled aal1 denial through SECURITY DEFINER posting RPCs as well as table access; table policies alone are insufficient evidence. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Authenticated has column UPDATE privileges on both `balance_paisa` and `current_balance`; owner row policies allow writes. Verify trigger protection with direct-DML regression tests before asserting balances are protected. Anonymous cannot execute the draft RPC; authenticated can.
- No development database branches were listed; no separate Shop Pro staging project was identified. Preview URLs are not evidence of isolated database configuration. No preview was used to submit financial data.

Other existing blockers: direct account-balance write privileges/trigger protection; unscoped local report rows (A04 readers); queue acknowledgement before IndexedDB transaction completion (remaining A12); incomplete daily/export pagination and snapshots; account-operation backup coverage/restore rehearsal; legacy local default cash of 10,000; historic Quick Expense split-book reconciliation; old-client fencing; fiscal policy and B1–B10 approval. The replay fix repairs no historical rows and establishes no population-level incidence estimate.

## Dependency-aware integration plan

1. Preserve main and pin reviewed heads. Integrate #24 as proposed documentation separately. Retain #8/#9 until their extracted coverage is accepted, then supersede them rather than applying duplicate implementations.
2. Finish #26 in isolation: load all active migrations plus the observed deployed-order variant into disposable staging; verify canonical membership on every writer, demotion, inactivity, cross-company retry, MFA, SQL privileges and locked search paths. Reconcile the pending older migration and missing chat migration. Rehearse backup/restore. Obtain explicit approval for the exact production migration plan.
3. Validate #27 with that staged schema using real signup, email confirmation, OAuth, PIN, MFA, revoked membership and reconnect. Preserve local-only data. Eliminate invented defaults only for new legitimate workspaces in a separate change; never zero existing customer balances automatically.
4. Integrate #23, then this direct-replay PR and #25 as separate focused changes after database release gates. Exercise interrupted replies, edited/voided receipts, two devices, account creation dependencies and queue recovery together. Fix remaining IndexedDB durability and unscoped-reader issues before financial rollout.
5. Rebase #18 onto the verified writer without line-ending churn; extract/reuse the reader and presentation work. Validate complete scoped reports, void/restore history and explicit AI confirmations. Keep new UI and accounting changes separate.
6. Enable #28 only after metadata locking is atomic on the server and real browser Auth/RTL/mobile journeys pass. Its client checks and default-off flag are useful safeguards, not sufficient approval.
7. Implement the approved V2 schema and writer in dedicated financial PRs, then UI clients and historical cutover in separate PRs. Do not dual-write cashbook and journals.

## Double-entry foundation contract to carry forward

Reuse ACCOUNTING_ARCHITECTURE.md rather than inventing a competing ledger:

- Company-scoped book, Chart of Accounts and fiscal periods; composite company foreign keys, unique company account codes, non-postable headings and immutable account IDs. Payment accounts remain cash locations, not the entire chart.
- One database transaction claims `(company, intent)`, compares a normalized payload fingerprint, locks period/source/draft, validates active leaves and exact bounded minor units, and saves header, lines, audit and receipt atomically. Debits must equal credits exactly; no balancing plugs or inferred openings.
- Immutable posted headers/lines with clients denied direct financial mutation. Period close and posting serialize on the same row. Every retry authorizes the current actor before exposing a receipt.
- Reversals create fresh linked opposite lines with reason/date/actor and their own stable intent; prevent duplicate full reversals. Never delete originals or exclude them while also counting the reversal.
- Gate schema/writer PRs on imbalance-by-one, overflow, cross-company references, closed periods, concurrent close/post, changed-key payload, lost replies, duplicate reversals, permission revocation and audit atomicity. Include the blueprint's hand-calculated stock/credit fixture once those modules exist.
- Prospective, approved book cutover with reconciled opening manifest and old-client fence. Preserve legacy IDs, receipts, historical reporting basis and pending operations. No balances or journals are created merely to make the new screens look populated.

Next recommended task: close #26's full-schema demotion/MFA gaps and establish isolated Supabase staging. This takes priority over implementing the journal schema or enabling the company wizard.
