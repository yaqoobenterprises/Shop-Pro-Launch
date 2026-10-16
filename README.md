# Shop Pro

Shop Pro is a web ledger for recording shop income and expenses, tracking account balances, and reviewing entries and reports. The interface is a React and TypeScript PWA backed by Supabase. Entry classification runs locally; financial posting uses a review step and the database posting path.

## Current screens

- Ledger: chat-style entry with local parsing, review, account selection, and recoverable offline work.
- Overview: daily and monthly summaries.
- Entries: search, filters, and CSV export for ledger transactions.
- Reports: ledger reports.
- Accounts: balances and account activity.
- Settings: appearance, account security, categories, aliases, and data tools.

Regional settings, Urdu UI, Standard/Both entry modes, and read-only chat questions are controlled by four feature flags. All flags are false in this branch. Some flagged capabilities are not complete; see docs/work-log.md and do not enable them for production.

## Development

Use Node.js 22 and npm.

    npm ci
    npm run dev

The development server uses port 3000. Useful checks:

    npm run lint
    npm run check:strict
    npm run check:size
    npm test -- --reporter=dot
    npm run build
    npm audit

The GitHub CI workflow runs dependency audit, TypeScript checks, size checks, tests, and a production build. The separate backup workflow is manually dispatched and requires configured secrets; do not treat it as an automatic daily backup.

## Supabase configuration

The browser client reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Use the project's local environment configuration. Never place a service-role key in browser code or client environment variables.

Database migrations live in supabase/migrations and are ordered by their filename. Test migrations locally with the PGlite suite and rehearse them on staging before production. The agent did not access or modify remote Supabase during this audit.

## Backups

Run scripts/backup_database.ts to create a local archive. Validate an archive with:

    npx tsx scripts/restore_database.ts --validate-only <archive-path>

The current restore script validates current full archives but does not apply them to Supabase. Review docs/ROLLOUT.md before deployment or recovery.

## Launch status

The baseline code checks pass, but full global launch readiness is not established. Urdu UI coverage and RTL visual verification, complete Standard/Both entry behavior, and chatQueries remain incomplete. All flags are disabled. Review the remaining items in docs/work-log.md and docs/ui-audit.md before enabling features or treating the launch as finished.
