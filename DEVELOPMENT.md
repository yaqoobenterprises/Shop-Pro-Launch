# Development

## Prerequisites

- Node.js 22 or newer
- npm

## Start locally

1. Install the lockfile dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for cloud sign-in and sync.
3. Run `npm run dev` and open `http://localhost:3000`.

The browser client also accepts `VITE_SUPABASE_ANON_KEY` for compatibility. Only public publishable/anon keys may be used in browser variables.

## Verification commands

- `npm run lint` — ESLint checks
- `npm run typecheck` — TypeScript project check
- `npm run check:strict` — additional strict TypeScript check
- `npm test -- --reporter=dot` — test suite
- `npm run check:size` — file-size ratchet
- `npm run build` — production bundle
- `npm audit` — dependency advisory check

## Working conventions

- Put React components under `src/components/<area>/` and shared behavior in the existing `src/lib/`, `src/services/`, `src/regional/`, or `src/i18n/` modules.
- Keep financial amounts in integer paisa in ledger and database paths. Use the shared amount and date helpers for display and business-date rules.
- Route online ledger writes through `ledgerService` and the database draft/posting path. Preserve its offline queue and retry behavior.
- Keep tenant and role checks in PostgreSQL RLS and database functions. Client-side checks improve the experience but do not replace backend authorization.
- Database tests use PGlite. They validate selected local schema behavior and do not prove live-project parity.
- Keep incomplete feature flags disabled until their checks in `docs/ROLLOUT.md` are complete.
