# Security

## Runtime boundary

- The browser client may use only public Supabase URL and publishable/anonymous key settings.
- Never put service-role keys, database passwords, JWT secrets, or third-party secrets in client code, public environment variables, or Git.
- Row-level security and database authorization policies enforce access to tenant data. Client-side role checks only control the interface and do not replace database policies.
- Make database security changes through reviewed migrations. Keep row access scoped to the authenticated user and their organization.

## Project operations

- Review authentication providers, redirect URLs, backup status, and project secrets in the Supabase dashboard.
- Keep production and staging credentials separate.
- Do not include customer records, exports, or credentials in issues or public logs.

## Reporting

Report suspected security issues privately to the repository owner. Do not publish credentials, personal data, or exploit details in a public issue.
