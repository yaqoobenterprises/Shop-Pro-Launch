# Shop Pro

Shop Pro is a React and TypeScript progressive web app for recording shop income and expenses, tracking account balances, and reviewing ledger reports. It uses Supabase Auth and PostgreSQL for signed-in cloud use, with a local queue for work during network interruptions.

## Requirements

- Node.js 22 or newer
- npm

## Local setup

```sh
npm ci
```

Copy `.env.example` to `.env` and set the Supabase project URL and publishable key:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Use the publishable key from the Supabase project's API keys page. These `VITE_` values are included in the browser bundle, so never use a Supabase secret or service-role key here. The app still accepts `VITE_SUPABASE_ANON_KEY` as a compatibility alias for existing local setups.

Start the app:

```sh
npm run dev
```

The development server listens at `http://localhost:3000`.

## Checks

```sh
npm run lint
npm run typecheck
npm run check:strict
npm test -- --reporter=dot
npm run check:size
npm run build
npm audit
```

The GitHub Actions workflow runs the dependency audit, lint, TypeScript checks, tests, size guard, and production build.

## Import into Vercel

1. Import [`yaqoobenterprises/Shop-Pro-Launch`](https://github.com/yaqoobenterprises/Shop-Pro-Launch) and select `main`.
2. Use the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. `vercel.json` already contains the SPA rewrite and asset cache rules.
3. Add these environment variables for each Vercel environment you intend to use:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

4. After Vercel assigns the production domain, add that domain to Supabase Auth's Site URL and redirect URL allow-list.
5. Importing and configuring the project does not apply database migrations. Review `docs/ROLLOUT.md` and the pending SQL migration before changing Supabase.

Do not add `SUPABASE_SERVICE_ROLE_KEY` or any other Supabase secret to Vercel's browser-facing `VITE_` variables.

## Backups

The database backup workflow is manually dispatched. It reads live application tables and uploads the archive to a separate private GitHub repository. To enable it, configure these GitHub Actions repository secrets (not Vercel variables): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_REPO_TOKEN`, and `BACKUP_REPO_NAME`. The workflow checks that the backup repository is private before upload. Keep the service-role key restricted to this server-side workflow.

The restore command supports offline archive validation. It does not apply an archive to Supabase.

## Project map

- `src/components/` — screens and UI components, grouped by area
- `src/services/` — ledger, authentication support, offline storage, and synchronization
- `src/lib/`, `src/parser/`, `src/regional/`, `src/i18n/` — shared logic
- `supabase/migrations/` — active, ordered database migrations
- `supabase/migration-history/` — original migrations retained for audit and local database tests; do not apply these as new migrations
- `tests/` — unit, component, and local PostgreSQL behavior checks
- `docs/` — architecture, database, rollout, and compatibility notes

See [`docs/cleanup.md`](docs/cleanup.md) for the verified file cleanup and migration-history reorganization.

Feature flags live in `src/config/features.ts`. Keep incomplete or unverified features disabled until their rollout checks are complete.
