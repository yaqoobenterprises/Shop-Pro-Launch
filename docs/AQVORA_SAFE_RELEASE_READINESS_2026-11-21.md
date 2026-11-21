# AQVORA — Safe Usable Release Readiness
**Authoritative working date:** 2026-11-21. **Status: NO-GO for replacing live Shop Pro or enabling production V2 finance.**

## Release principle

Ship the functionality that really works, in separately approved steps. A green local CI
suite does **not** prove a secure real-user hosted ERP. The existing Shop Pro ledger,
offline drafts and balances must remain usable, readable and recoverable throughout.

The reference design remains the founder-locked Poital.flow lavender-grey shell,
charcoal/mint/blush/white KPIs, restrained lavender/teal charts and AQVORA navy/emerald logo.
Do not trade existing user safety for visual polish or claim sample screens are real.

## One integration tree, not sixty-one independent mergers

- **Protected live branch:** `main` at PWA brand commit `f19c9a4`; no V2 write rollout.
- **Current integrated checkpoint:** Draft #84, `integration/aqvora-release-candidate-20261121` at `f200cc9` (functional frontend #82 + Codex backend #83 + branded PWA assets). Exact-HEAD CI green: 761 app / 47 PostgreSQL / 22 local Auth tests.
- **Frontend child:** Draft #85, `feat/aqvora-source-traceable-preview-20261121`; source-linked honest sample dashboard plus the release/PWA protections in this document. Its latest CI must pass anew after these changes.
- **Backend child:** Codex Draft #86, `codex/issue-72-release-e2e-hardening`, based on #84; independent local two-owner Auth/PostgREST E2E/restore work. Not yet merged into the #85 UI child.
- **Sister UI branch:** #50, older real Cashbook/Overview/Accounts structural refinement, has overlapping files and must be selectively reconciled with the current integrated screens.
- **Other Drafts:** Stacked ancestors / sibling investigations; their changes must be traced before any close. GitHub currently reports 61 open PRs; this is NOT 61 independent releases.

## Two explicitly different product experiences

| Surface | Auth/data | What it can actually do | Eligible for existing-company rollout? |
|---|---|---|---|
| Existing Shop Pro / AQVORA-branded ledger | Original local/cloud account | Cashbook entries, reports, existing workflows | Only after installed-PWA/offline and backup signoff |
| **AQVORA ERP Review** | Synthetic sample | Navigable 15-section UI, source-traced example 15,000 invoice / 6,000 receipt / 17,000 AR, locally balanced GL/TB | Sample-only; never implies production accounting |
| V2 source-verified finance routes | Isolated real Supabase Auth + explicit staging flags | CoA/admin, verified GL/TB/AR, controlled invoice and receipt lifecycle per authorized RPC and role | **NO** until #72 hosted tests, accounting approvals and opt-in data cutover |
| Purchases/AP, inventory/POS, HR/payroll, AI Copilot | Future backend | Roadmap labels only | **NO** |

The public initial route **must remain the working legacy ledger** (`chat`), not the
synthetic ERP review. `VITE_AQVORA_PREVIEW_DEFAULT=true` is a **preview-only** opt-in.
Users may explicitly open the example through the existing "AQVORA ERP Preview" nav link.
The underlying client never grants financial posting permissions.

## Build and PWA hardening in the #85 child

1. Production build checks `VERCEL_ENV=production` or `AQVORA_RELEASE_TARGET=production`
   and blocks enabled `VITE_ENABLE_AQVORA_*`, company-wizard or sample-first flags.
   Preview artifacts may still contain staging flags: **never promote a preview artifact
   directly to production**; use a fresh, reviewed production build and environment.
2. Public service worker v2 caches only the static shell and public hashed assets.
   It does **not** intercept `/rest/v1`, `/auth/v1`, `/functions`, personal data,
   reporting APIs or cross-origin responses. It never force-calls `skipWaiting` or
   `clients.claim` on currently open installed tabs.
3. Old AQVORA-owned caches are removed only on a controlled activation; other cache
   namespaces are untouched. Legacy worker upgrades are still a mandatory device QA
   and rollback test; a worker update alone cannot validate persistence of an offline queue.
4. Production and V2 writers stay default-OFF and no migrations/configuration are
   changed on any existing Supabase project.

## Release A: preserve the usable existing product, offer honest ERP review

**Current decision: NO-GO pending manual QA and founder release approval.**

- [ ] Freeze exact merged release-candidate SHA after selective UI #50 reconciliation
      and Codex #86 review; do NOT individually squash 61 stacked PRs.
- [ ] App/TypeScript/strict/lint/size/build/audit CI passes **on final exact SHA**.
- [ ] Existing real shop account: login / lock / profile, create+edit+report, offline
      queue across device restart, internet reconnect and lost-ACK retry; reconcile
      counts and balances before/after upgrade. Do not use actual company records as E2E fixtures.
- [ ] Existing installed PWA: upgrade old worker with unsent offline entries;
      offline app-shell/visited page behavior; inspect Cache Storage to confirm
      private Auth/REST/finance responses never cached. Validate rollback and old-tab coexistence.
- [ ] Verify on 360, 390, 768, 1024 and 1440 px; light/dark, keyboard/focus,
      pointer/touch and screen-reader labels. Review actual captured browser screenshots
      against founder-locked reference, not only CI/jsdom.
- [ ] Confirm sample labels, source completeness, no fictitious bank verification,
      working escape route to original ledger, no accidental V2 controls for live users.
- [ ] Verify fresh Vercel **preview** at exact commit without quota errors; review
      environment variables and service-worker scopes; no secrets in VITE_.
- [ ] Restore rehearsal for existing legacy DB/IndexedDB export and rollback plan,
      with founder signoff on maintenance/communication timing.
- [ ] Explicit founder approval before merge to `main` or Vercel production promotion.

## Release B: test V2 finance with a *separately authorized* synthetic company

- [ ] Final #86 CI and external independent review: two owners, real AAL2,
      company isolation, revocation and negative authorization.
- [ ] Founder separately authorizes disposable hosted staging **without reusing
      an existing business Supabase project or creating paid resources**.
- [ ] Trusted staging PKR policy signed by founder/accountant; test with invoice
      150 minor → controlled-cash receipt 60 → AR 90 → final 90 → AR 0.
- [ ] Compare exact certified AR, GL, TB, source fingerprints and multi-page snapshots;
      test replay after lost HTTP ACK, independent checker and revocation.
- [ ] Physical/PITR recovery, capacity/load, incident rollback, inherited search_path
      security advisor warnings and country/jurisdiction decisions reviewed.
- [ ] New-company enrollment/permission defaults hardened; existing book migration,
      PWA queue and historical opening balances explicitly excluded until approved.
- [ ] Separate founder rollout approval for V2 write flags, SQL migrations and
      company enrollment. Never enable them merely because a preview URL loads.

## PR and issue hygiene

**Do not mass-close.** Category A: nested ancestors already represented by the
reviewed integration head (e.g. #33–#43, #53/#59/#63, #64–#82) — close as
"superseded/integrated" **only after verified ancestry and final merge**. Category B:
active parallel finalization (#85/#86 and selective #50) — keep open until
reconciled. Category C: unresolved independent investigations (#18, #23/#29/#31,
#55, older security workflows) — inspect each code delta and decide independently.
Issue #68 currency has local proof but final company adoption is unapproved;
#72 cannot be considered done from local CI alone. No invented cleanup counts.

After a founder-approved release, publish a mapping of each retired PR to the
exact integrated commit or an explicit "not shipped" reason.

## Final GO/NO-GO report must include

Exact branch/SHA; Vercel deployment URL and SHA; CI job URLs; tests and
skips; database/migration scope; V2 flag state; policy authority; live-data
write permissions; backup+rollback proof; mobile/PWA browser screenshots;
known defects; permitted modules; founder release approval.

**Current answer: GO for code review and local/preview QA; NO-GO for production
ERP writer, real-company enrollment, or live Shop Pro replacement.**
