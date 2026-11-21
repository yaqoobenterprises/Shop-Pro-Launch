# AQVORA — Clean Local Source & Codex Engineering Handoff

**Snapshot:** 21 November 2026. This branch is an export-only copy of the integrated ERP review head (`505cde0945994988b42908d8fa04251ac776249e`). It belongs to the historical Shop Pro repository but is **not** a production release or an authority to use the old database.

## Founder intent

Create a **new independent product called AQVORA**, from all existing implemented code, with a fresh local working tree, fresh Git history, a separately owned new GitHub account/repository, new Vercel project, and an isolated new Supabase project. **Keep the old Shop Pro repository/project unchanged.** No old Git commit history, issue history, PR metadata, Action logs or old deployment links should carry into the *new* Git repository. They do remain intact in the old repository and mirror backup.

The new product is a globally usable multi-company accounting/business ERP, **not** an old Cashbook rebrand. Founder makes final product, finance rollout and production decisions. Codex leads complex security, SQL, concurrency, migrations and backend; ChatGPT supports product/frontend/integration/quality.

## Canonical architecture and safety

- Existing code: React 19 + TypeScript + Vite, Supabase JS, PostgreSQL/Supabase migrations, Vitest; existing Shop Pro Cashbook/PWA and real company source data are a separate legacy product.
- New AQVORA legal companies start with **zero journals and zero opening balances**; never invent opening money, transactions, P&L, Trial Balance or customer debt. A genuine first capital contribution requires an explicit balanced authorized journal.
- Money uses **exact integer minor-unit values**, centrally authorized currency exponent/scale, balanced double entry, immutable posted journals and linked reversals, fiscal-period checks, atomic cross-tenant authorization and idempotent receipts. Avoid floating-point financial posting.
- Server authority is canonical active organization membership, verified email/session, MFA AAL2 where required, RLS and scoped RPC permissions. Never trust user-provided role or display company name. Do not put privileged keys in browser or Vite-prefixed variables.
- AI Copilot is read-only by default; source-backed explanations/draft suggestions only, human permission/checker required for posting.
- Offline-first PWA remains valuable, but financial offline drafts need durable identity and reconciled retry, no double posts.
- **Do not connect the new local AQVORA tree to either existing production Supabase project.** Historical environment vars and URLs should not be copied. Build a separate isolated local Supabase stack first.

## Founder-locked UI

Use the companion founder reference images placed in `references/` in the handoff asset ZIP:
- `FOUNDER_LOCKED_UI_REFERENCE.webp`: clean lavender-grey sidebar/canvas, white panels, charcoal/mint/blush/white KPI cards, large lavender/teal main trend chart, small secondary chart, Inter font and whitespace.
- `AQVORA_BRAND_LOGO_REFERENCE.png`: navy/emerald flat AQVORA mark. Asset trace exists in `public/assets/aqvora-symbol.svg`.
- At most four primary desktop KPIs; no fake chart amounts. Separate pages for CoA, Journal, GL, TB, Sales, AR, AP, Purchases, Inventory, Cash/Bank, HR/Payroll, Reports, Admin, AI.
- Responsive/mobile, keyboard, contrast, reduced motion, polished light/dark. Follow `DESIGN.md` and the actual reference images. Branding legal clearance remains before public launch.

## What exists in this source checkout

Integrated review code includes the legacy Cashbook app, premium real Overview/Cashbook/Accounts/Reports UI, owner company/fiscal setup, journal preview and guarded journal posting adapters, source-backed sales/AR/receipt workspaces, certified GL/TB readers, staged management P&L, activation/readiness logic, and SQL-side owner invitation/acceptance with client screens. **Many features are default-off staging and not verified as fully hosted end-to-end.**

Primary entrypoints:
- `src/App.tsx`, `src/context/AppContext.tsx`, `src/context/AuthContext.tsx`
- `src/components/layout/WorkspacePastel.css`, `src/components/dashboard/LedgerDashboardView.tsx`
- `src/components/chat/ChatView.tsx`, `src/components/accounts/AccountsView.tsx`, `src/components/reports/LedgerReportsView.tsx`
- `src/components/accounting/*`, `src/accounting/*`, `src/services/aqvora*.ts`
- `supabase/migrations/*.sql`, `tests/aqvora_*.`, `docs/aqvora-*.md`
- `src/config/releaseExperience.ts` (initial page: real Cashbook by default in source; change to verified Overview if desired)
- `public/sw.js`, `src/services/ledgerService.ts` (preserve PWA/offline and idempotency invariants)

Known historical snapshot: integrated review's 864 application tests passed with 87 intentionally skipped at CI, and PostgreSQL/local Supabase jobs passed. This is **historical evidence**, not evidence of this new clean deployment or full production readiness. Re-run checks on the final new repo/DB.

## Remaining gaps (do not call complete)

1. New isolated Supabase setup, real signup/login/email verification/MFA, legal entity & organization membership and safe company chooser with no cross-company leakage.
2. Reliable new-company CoA/period/currency policy authority and independent maker/checker activation; finish hosted browser E2E from zero books to one real journal and verified receipt.
3. Verified full GL/TB and P&L/Balance Sheet accounting lifecycle, fiscal close/reopen, cash/bank reconciliation, backup/restore, audit history and corrections.
4. End-to-end source-backed invoice -> AR -> approved receipt -> bank/cash -> GL/TB; purchases -> AP -> inventory/COGS; payroll; taxes/FX per jurisdiction; reporting and AI.
5. Local-first device sync/recovery, E2E compatibility, accessibility, scale and performance.
6. Exact responsive visual QA against reference across 360/390/768/1024/1440px and dark/light.

## Source organization boundaries

- The *new* repository must use a fresh `git init`, and a new remote. Avoid copying `.git/`, `.github/` old Actions jobs, old `.vercel/`, `.env`, production credentials, logs, generated `dist/` and `node_modules/`.
- Source code, SQL migrations, tests, design/system documentation, fonts dependencies, required assets **must** remain in the new codebase.
- Keep archived source/mirror backups separate and read-only. Never `git push --mirror` to the new repo: it imports unwanted history/PR refs and could overwrite refs.
- Do **not** reset or force-push the old Shop Pro origin.
- Do not apply the old migration chain blindly to a new hosted project. Audit ordering, prerequisites, RLS, extension versions, grants and safely rehearse against a disposable isolated database.
- Check `README.md`, `package.json`/`package-lock.json` brand string, old remote/domain references, OAuth callback URLs, PWA manifests, storage keys and all configurable environment flags before pushing the new product. Update the lockfile with `npm install --package-lock-only` after package metadata changes.

## Recommended engineering workflow for Codex

1. Inventory every source module, SQL migration, RPC and route; classify implemented/preview/default-off/untested. Preserve all source when porting.
2. Run `npm ci`, `npm run typecheck`, `npm run check:strict`, `npm run lint`, `npm run check:size`, `npm test`, `npm run build`; fix regressions in focused changes.
3. Create a new isolated local Supabase test environment and validate real Auth/PostgREST/RLS/role revocation/MFA and concurrency; use distinct sandbox users/company UUIDs.
4. Restore reviewed new-account signup/CoA/currency/period/finance activation flow with default-off safe guards, then real receipt and reports.
5. Build a quality-gated release process in the new GitHub repo and deploy tested previews to the new Vercel project. Never activate a writer or production migration without founder signoff.
6. Maintain a new authoritative `docs/CURRENT_HANDOFF.md` with code SHA, tests, blockers, exact next steps.

**Never present synthetic preview as financial reality or test-passed code as production activated.**
