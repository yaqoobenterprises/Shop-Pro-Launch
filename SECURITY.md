# Security

## Browser and server credentials

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public browser configuration. The client accepts the legacy `VITE_SUPABASE_ANON_KEY` name for compatibility. Never place a Supabase secret/service-role key, database password, or backup token in source code, `.env.example`, a `VITE_` variable, or a browser bundle.

Vite refuses to start or build if any `VITE_` value looks like a Supabase secret key or a legacy service-role JWT. This is a guard against accidental configuration; it does not make other `VITE_` values private.

The backup scripts use `SUPABASE_SERVICE_ROLE_KEY` only in a server-side process. The manually triggered GitHub workflow stores it as an Actions secret and requires the configured backup repository to be private before upload.

## Authorization

Supabase PostgreSQL RLS is the authorization boundary for cloud data. The read-only review on 2026-10-17 found RLS enabled on all 26 public application tables and `security_invoker` enabled on the three public views inspected.

The review found these authorization defects in the connected project:

- Managers and cashiers can update organization rows because the current update policy checks membership, not role.
- `post_transaction_draft` can return an idempotent retry row from another shop when the draft is missing.
- Membership helpers also trust profile and `shop_members` mirrors, so an explicitly inactive `organization_members` row does not reliably revoke access.
- `ensure_my_profile` changes an existing inactive organization membership back to active on sign-in.
- Anonymous users have unused `INSERT` and `UPDATE` grants on `transaction_drafts`.

The proposed fix is in the pending migration listed in `docs/ROLLOUT.md`; it has not been applied to the live database. The migration uses `organization_members` as the authorization source, scopes draft retries, restricts organization updates to owners, preserves inactive memberships, narrows anonymous grants, and fixes `search_path` on authenticated security-definer RPCs. Review and test that SQL on an isolated project before approving it for production.

The Supabase security advisor also reports leaked-password protection is disabled. Supabase currently offers this setting on Pro and higher plans; check the project's plan and enable it before public launch if available. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

## Environment files and history

- `.env` and `.env.*` are ignored; `.env.example` contains variable names only.
- Before committing, check staged files and Git history for credentials. If a server-side secret was ever committed, revoke/rotate it even after removing it from the current tree.
- Supabase publishable keys are designed for browser use and rely on RLS for protection. They are not substitutes for a secret/service-role key.

## Database changes

Review schema and policy SQL before applying it to any shared Supabase project. Compare the local migration list with the project's migration history, test on staging, and confirm a current secure backup first. This repository's review did not write to Supabase or change production data.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not include live customer records, access tokens, database passwords, or unredacted backups in an issue or pull request.
