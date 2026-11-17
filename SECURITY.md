# Security

## Browser and server credentials

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public browser configuration. The client accepts the legacy `VITE_SUPABASE_ANON_KEY` name for compatibility. Never place a Supabase secret/service-role key, database password, or backup token in source code, `.env.example`, a `VITE_` variable, or a browser bundle.

Vite refuses to start or build if any `VITE_` value looks like a Supabase secret key or a legacy service-role JWT. This is a guard against accidental configuration; it does not make other `VITE_` values private.

The backup scripts use `SUPABASE_SERVICE_ROLE_KEY` only in a server-side process. The manually triggered GitHub workflow stores it as an Actions secret and requires the configured backup repository to be private before upload.

## Authorization

Supabase PostgreSQL RLS is the authorization boundary for cloud data. The read-only review on 2026-11-17 found RLS enabled on all 28 public application tables. The current security advisor reports four authenticated-callable `SECURITY DEFINER` functions and disabled leaked-password protection.

The review found unresolved tenant-authorization and transaction-draft boundary defects. These are release blockers. Detailed live findings were shared with the repository owner; do not reproduce exploit details in public issue comments.

The proposed fix is in pending migration `supabase/migrations/20261017062800_launch_authorization_hardening.sql`; it is not in the connected project's migration ledger. It changes the organization authorization source and tightens transaction-draft access and authenticated security-definer functions. Review and test the exact SQL on an isolated project before approving it for production.

The multi-conversation history migration `supabase/migrations/20261117054753_ledgermate_multi_conversation_history.sql` is also absent from the connected project's migration ledger. The live table still has a unique constraint allowing only one conversation per organization/user, so additional chats cannot reliably sync across devices until this additive migration is reviewed and applied.

The Supabase security advisor also reports leaked-password protection is disabled. Supabase currently offers this setting on Pro and higher plans; check the project's plan and enable it before public launch if available. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

## Environment files and history

- `.env` and `.env.*` are ignored; `.env.example` contains variable names only.
- Before committing, check staged files and Git history for credentials. If a server-side secret was ever committed, revoke/rotate it even after removing it from the current tree.
- Supabase publishable keys are designed for browser use and rely on RLS for protection. They are not substitutes for a secret/service-role key.

## Database changes

Review schema and policy SQL before applying it to any shared Supabase project. Compare the local migration list with the project's migration history, test on staging, and confirm a current secure backup first. This repository's review did not write to Supabase or change production data.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not include live customer records, access tokens, database passwords, or unredacted backups in an issue or pull request.
