# AQVORA — Codex Engineering Instructions

Read `AQVORA_CLEAN_START.md` and `DESIGN.md` before any architecture, code, SQL, UI or deployment work. These are the product and design constraints for the **new independent AQVORA** repository. Treat `docs/legacy` as historical only.

## Mission
Deliver a secure, premium, globally usable **multi-company ERP + accounting + AI business platform**. Preserve working implementation; do not rewrite from zero merely to rename it. The founder is the final decision-maker.

## Engineering conduct
- Inventory the existing frontend, database migrations, RPCs, tests, routes and feature flags **before modifying them**.
- Maintain a concise current handoff documenting verified functionality, evidence, blockers and exact next steps.
- Prefer small reviewable PRs, deterministic tests, type safety and measured performance; do not implement fake UX buttons or mock reports as live financial data.
- Distinguish implemented code, integration-tested behavior, previews, default-OFF staging, and production-ready functionality.
- Use a brand-new GitHub remote and isolated Supabase project. Never connect a new AQVORA environment to the original Shop Pro production account or database.
- Do not inherit old GitHub remote, Actions backups, Vercel linkage, Supabase service keys, local `.env`, secrets, credentials or historical financial datasets.
- Before first new-GitHub push: scan all files and commit history for sensitive values and accidental old service URLs. Only `.env.example` placeholders belong in version control.

## Finance security invariants
- Companies initialize with **zero** opening balances/journals. Historical Shop Pro Cashbook is not auto-imported.
- Use exact integer minor units with authoritative versioned currency policy, never float for financial posting.
- Balanced double-entry journals, immutable posted records, append-only reversals and audit events.
- Real live session, verified ownership, scoped organization membership, RLS + MFA AAL2 for privileged actions.
- Idempotent intent/receipt keys and concurrent request consistency; lost ACK recovery must never double post.
- No unauthorized journal writer activation. Real financial posting must pass explicit owner/checker approval and isolated local Supabase acceptance first.
- Distinguish operational Cashbook activity, accounting revenue, accrual income, cash movement, net profit, and TB totals.

## UI contract
- Visual reference files in `references/` are the authority; use approved navy/emerald branding, Inter, lavender-grey/white layout, clean charts and up to four primary desktop KPIs.
- Responsive, dark/light, keyboard and reduced-motion support. Keep modules on separate routes. Avoid crowded sample dashboards.
- AI Copilot remains read-only by default, never autonomously posts or bypasses permissions.

## Required gates
1. `npm ci`
2. `npm run typecheck`
3. `npm run check:strict`
4. `npm run lint`
5. `npm run check:size`
6. `npm test`
7. `npm run build`
8. Disposable PostgreSQL/Supabase full Auth + PostgREST and migration-security E2E
9. Browser user-journey QA in isolated staging: login, MFA, new company, account & fiscal policy, authorized entry, GL/TB/report, logout/tenant cross-check, backup/restore
10. New Vercel preview and explicit founder-approved production deployment

**Never claim completion without evidence; do not perform production billing, migrations, financial activation or destructive deletion without explicit founder approval.**
