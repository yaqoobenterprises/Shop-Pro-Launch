# AQVORA Accounting Interface Preview — 20 November 2026

**Purpose:** Build the agreed pastel/muted-lavender accounting frontend **while Codex develops the secure financial writer on another branch**. This is an independent UI PR stacked on the read-model PR #38, never on Codex's mutable branch.

## Four interactive modules

- **Chart of Accounts:** chart codes, descriptive class labels, search, category filter, active/inactive status and linked control roles. Add/edit actions are intentionally disabled pending server authorization.
- **Journal Entry:** 2+ editable lines, date, code lookup, exact PKR amount parser (no Number/float), debit/credit totals, one-paisa imbalance checks, AR/AP open-item and inventory movement reference inputs; local validation via `previewJournalDraft`. The Post Journal button is intentionally disabled; local passing is never server authority.
- **General Ledger:** posted sample source rendered as account-specific chronological journal movements and exact running Dr/Cr balances; no imported real cashbook balances.
- **Trial Balance:** independently computed exact as-of posted totals via `buildFinancialSnapshot`, closing debit/credit and assets = liabilities + recorded/virtual earnings reconciliation; account link opens General Ledger.

## Review flow

The entire preview is mounted **only** when `isDemoMode` is true and `VITE_ENABLE_FINANCE_UI_PREVIEW=true` on an isolated preview build. It is lazy-loaded and never used as a live posting service.

Open Landing → **Explore Demo** → **Preview finance UI**. This opens a closable preview overlay with four tabs. All illustrative amounts and charts are deliberately labelled. This does not imply that the authenticated company has the corresponding accounts or financial records.

Data comes exclusively from `financeSampleData.ts`: independent, fully balanced **sample** posted journals for company ID `aqvora-sample-only`. Do not put sample accounts into a real user's chart, financial reports or Supabase. No local transaction write, network mutation, cloud posting, journal synchronization, tenant permission change or legacy balance adjustment occurs in this feature.

## UI acceptance / release gates

- Reference design: lavender canvas, minimal sidebar, charcoal/mint/blush KPI cards, white tables and crisp typography. Dark mode is readable, separate from full light-mode inversion.
- Mobile: navigation becomes a horizontal tab bar at 800px, tables have independent horizontal scroll, controls wrap at 600px, buttons meet 44px minimum.
- Persistent input labels, keyboard access, focus visibility, disabled backend actions, empty/error states and reduced motion.
- More visual QA needed: screenshots at 360/390/768/1024/1440, dark/light, keyboard focus trap in preview, bidirectional/RTL copy, large numbers. Vercel READY is not equivalent to completing visual QA.

## Handoff to secure writer

Once Codex provides reviewed *server* contracts, add a separate typed adapter that supplies **verified authorized** `ChartAccount[]`, fiscal policies, posted journals and receipts. Do not infer source completeness from the browser. The server must enforce versioned posting previews, actor/MFA/tenant permission checks, period locks, exact statement snapshot and idempotent posting; never enable the Post button before contract/integration and security QA are complete.

Backend PRs remain independent; resolve conflicts using tested API contracts instead of merging competing posting implementations. Never merge this UI preview to main merely because automated frontend tests pass.
