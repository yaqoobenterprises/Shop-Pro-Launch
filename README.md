# Shop Pro

**A practical, AI-assisted financial workspace for small businesses.**

Shop Pro is an actively developed **React 19 + TypeScript progressive web app (PWA)** for recording shop receipts and payments, managing cash/bank/wallet balances, and reviewing operating reports. It combines fast, natural-language entry with an account-based cashbook, optional offline work queues, and an authenticated AI assistant.

> [!IMPORTANT]
> **Current product: cashbook, not a complete double-entry ERP.** General Journal, General Ledger, Trial Balance, Balance Sheet, customer/vendor subledgers, inventory, purchases, sales invoicing, and broader ERP capabilities are **planned**, not features available in the current production application.
>
> **Release caution:** Financial-posting retry, legacy Quick Expense, report completeness, and tenant-authorization issues are under active engineering review. A passing test suite is not proof that the current deployment is cleared for production-wide financial use. See [Security](SECURITY.md), [Database](DATABASE.md), and [Rollout](docs/ROLLOUT.md).

[Getting started](#getting-started) · [Current features](#current-features) · [Architecture](#architecture) · [AI and privacy](#ledgermate-ai-and-privacy) · [Engineering checks](#engineering-checks) · [Roadmap](#product-direction)

## Current features

| Workspace | What it does now |
| --- | --- |
| **Overview** | Daily/period financial summaries, selected cashbook trends, account snapshots, and expense breakdowns. |
| **Entries** | Filter, inspect, export, and review recorded cashbook transactions. |
| **Cashbook / Ledger** | Type a short receipt/payment instruction, review classification and amount, select an account, and submit. |
| **Accounts** | Track payment accounts such as cash, bank, and digital wallets; support account movements and transfers. |
| **Reports** | Income/expense analysis, selected period filters, and spreadsheet exports. |
| **LedgerMate AI** | Authenticated cloud chat using selected ledger context, with separately confirmed transaction-action flows. |
| **Settings** | Supported account, category, identity, preference, and data-management controls. |

Additional capabilities include Supabase authentication, role-aware cloud access, multi-device records, a PWA shell, demo/local compatibility paths, and IndexedDB-backed pending work. **Offline queueing does not mean every operation or report is complete while disconnected.** Corrections and authoritative reporting can require a cloud session.

Shop Pro's current operating result is **active income minus active operating expenses** for the selected filters. Owner contributions, drawings, adjustments, openings, and internal transfers are tracked separately; this cashbook result is **not an accrual-basis or GAAP/IFRS net profit statement**.

## Getting started

### Requirements

- **Node.js 22+** and npm (use the checked-in `package-lock.json`).
- A Supabase project **only if you need authenticated cloud features**.
- No paid AI API is needed for the basic cashbook UI. LedgerMate Cloud AI requires separately configured server-side credentials.

### Run locally

```bash
git clone https://github.com/yaqoobenterprises/Shop-Pro-Launch.git
cd Shop-Pro-Launch
npm ci
```

Copy the environment template. On **Windows Command Prompt**:

```cmd
copy .env.example .env
```

On **macOS/Linux**:

```bash
cp .env.example .env
```

Set the browser-safe values in `.env` when using cloud access:

```dotenv
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_public_publishable_key
```

Then:

```bash
npm run dev
```

Open **http://localhost:3000**. You can inspect the UI without cloud credentials, but actual cloud sign-in, synchronization, and authoritative financial reads need a correctly configured project.

> [!CAUTION]
> **Never put a service-role key, database password, Groq key, or other secret into a `VITE_` variable.** Vite injects such variables into browser-delivered code. Keep `.env` untracked. The legacy `VITE_SUPABASE_ANON_KEY` is still accepted as a public-key compatibility alias.

For setup details, see [Development](DEVELOPMENT.md).

## Architecture

```text
React / TypeScript / Vite PWA
  ├─ Workspace: Dashboard, Cashbook, Entries, Reports, Accounts, Settings
  ├─ LedgerMate: scoped ledger context + confirmed action previews
  ├─ Authentication, shop identity, feature flags, locale
  ├─ Parser → user review → ledger service
  │    ├─ Supabase PostgreSQL: RLS, RPC posting, account movements
  │    └─ IndexedDB: local drafts and pending operations
  └─ Vercel /api/ai-chat: Supabase token check → Groq inference
```

**Stack:** React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide, Supabase Auth/PostgreSQL, Vercel serverless functions, Vitest, and PGlite database tests.

- **Database source of truth:** Cloud-posted entries, account movements, and balances live in Supabase PostgreSQL. Browser pending work is not automatically a confirmed posting.
- **Money:** Ledger amounts use integer minor units (e.g., paisa for PKR). Review conversions and business-date behavior before changing financial code.
- **Security:** Database row-level security, grants, and RPC checks—not hidden UI buttons—must enforce access.
- **Compatibility:** Some older SQLite/Tauri, retail, and demo modules remain reachable. Do not delete them based on filenames alone.

Read [Architecture](ARCHITECTURE.md), [Database](DATABASE.md), [Offline sync](SYNC.md), and [Legacy compatibility audit](docs/legacy-audit.md) for implementation boundaries.

## LedgerMate AI and privacy

LedgerMate's current cloud path uses **Groq** behind the authenticated Vercel function `/api/ai-chat`; the default model configuration is `openai/gpt-oss-20b`. The model does **not** connect directly to the database or receive privileged Supabase credentials. Shop Pro prepares allowed data/context through its own signed-in services. Any supported transaction-changing action must be reviewed and confirmed through the application; the assistant's text itself is never proof that an entry posted.

Cloud AI sends selected chat messages and financial context to the inference provider. Do not include passwords, API keys, identity-document numbers, or unrelated personal information. Groq plan limits apply.

Set `GROQ_API_KEY` as a **server-only** Vercel environment variable, optionally `GROQ_MODEL`; never `VITE_GROQ_API_KEY`. Consult [Groq setup](docs/GROQ_AI_SETUP.md) for details. The separate [local AI scaffold](local-ai/README.md) uses an Ollama bridge and is **not** a finished replacement for the cloud integration.

## Engineering checks

Use the repository lockfile and run checks before proposing a merge:

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint, with warnings treated as errors. |
| `npm run typecheck` | Main TypeScript project. |
| `npm run check:strict` | Additional strict TypeScript coverage. |
| `npm test -- --reporter=dot` | Vitest, including relevant financial/DB fixtures. |
| `npm run check:size` | Source size guardrail. |
| `npm run build` | Typecheck and Vite production bundle. |
| `npm audit --audit-level=high` | High/critical dependency advisory gate. |

GitHub Actions runs these checks in [CI](.github/workflows/ci.yml). PGlite tests validate selected local SQL behavior; **they do not by themselves verify the effective deployed Supabase schema**.

### Contribution and change safety

1. Create a task-specific branch from current `main` and open a pull request.
2. Keep financial rules, schema changes, UI redesign, and housekeeping in **separate PRs**.
3. For accounting changes, capture acceptance fixtures and regression tests before implementation.
4. Validate shop-scoped authorization, idempotency, offline replay, report completeness, and audit history for each affected path.
5. Never push migration changes to production, rewrite existing transactions, or force-push shared work without an approved rollout and backup.
6. Do not automatically merge ongoing Codex/local work by pulling into a different working branch.

See [Security](SECURITY.md) and [Production rollout](docs/ROLLOUT.md) before enabling new financial features.

## Deployment and recovery

The web app deploys from `main` to Vercel as a **Vite** application (`npm run build`, output `dist`). `vercel.json` handles SPA routing and the AI endpoint. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the server-only `GROQ_API_KEY` in the appropriate Vercel environments. Configure the deployed domain in Supabase Auth redirect settings.

**Database migrations are not applied by importing the Vercel project.** Check the connected migration ledger, effective permissions, and staging results before any schema rollout; pending authorization and AI-chat migrations require separate review.

The [database backup workflow](.github/workflows/daily-backup.yml) is **manual/on-demand despite its filename**. It requires protected GitHub Actions secrets and a separate private repository. Current restore tooling validates archives but does **not** provide an automatic full production restore. Recovery must be rehearsed on an isolated database.

## Repository layout

```text
src/components/          Screens, shared controls, dialogs
src/context/             Auth and application state
src/services/            Ledger, AI context, local persistence, sync
src/parser/              Text normalization and classification
src/lib/                 Money, dates, reporting, security utilities
src/regional/, src/i18n/ Regional and language support
api/                     Vercel API endpoint for Groq
supabase/migrations/     Active SQL migration sequence
supabase/migration-history/  Archived migration history (not to reapply)
tests/                   Unit, UI, and PGlite test fixtures
local-ai/                Optional experimental Ollama bridge
scripts/                 Verification, icons, backup validation
docs/                    Engineering, rollout, historical notes
```

Feature flags are defined in [`src/config/features.ts`](src/config/features.ts). Currently LedgerMate's `chatQueries` flag is enabled, while regional settings, Urdu language UI, and alternate entry modes are staged off. Source code for a staged feature does not guarantee it is available to users.

## Product direction

**Planned, not shipped:** an expanded modular business-management platform with professional double-entry accounting (Chart of Accounts, manual journals, General Ledger, Trial Balance, financial statements), customer/vendor subledgers, invoicing, purchasing, inventory, reconciliation, and a more capable permission-controlled AI assistant.

The intended UX supports **both fast natural-language input and standard debit/credit entry**, using one authoritative accounting engine. Any such migration must preserve and reconcile existing cashbook data; avoid parallel books or undocumented historical reclassification. A comprehensive UI redesign is planned after financial-integrity foundations are verified.

## Documentation index

- [Development setup](DEVELOPMENT.md) · [Architecture](ARCHITECTURE.md) · [Database](DATABASE.md)
- [Security and release blockers](SECURITY.md) · [Production rollout](docs/ROLLOUT.md) · [Offline sync](SYNC.md)
- [Current design guidance](DESIGN.md) · [Legacy compatibility audit](docs/legacy-audit.md)
- [Groq AI setup](docs/GROQ_AI_SETUP.md) · [Local AI scaffold](local-ai/README.md) · [Repository cleanup history](docs/cleanup.md)

> **Documentation standard:** Historical delivery reports and early plans are useful background, not verified release evidence. Prefer the current source, current CI results, reconciled financial tests, and the deployed schema when they disagree.
