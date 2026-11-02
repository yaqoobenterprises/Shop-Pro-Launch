# Shop Pro backup and recovery runbook

## What the automated backup contains

The backup job exports the public application tables listed in `scripts/backup_format.ts`. Each table is paged in primary-key order, checked for unique primary keys and relationship/tenant consistency, counted again after export to detect row-count changes during the read, and included in a SHA-256 checksummed archive.

The workflow uploads only after archive validation and a private-repository check. The scheduled job is configured for 02:00 UTC (07:00 Pakistan time) and only runs from the repository's default `main` branch after this workflow is merged. Manual runs remain gated by the `confirm_live_backup` input. Retention is 90 days in the private backup repository.

## What is not in this archive

This is a public application-table backup, not a full Supabase project image. It does **not** include:

- `auth.users`, password hashes, MFA secrets or identity-provider configuration
- Supabase Storage object contents or bucket policies
- Edge Function code, secrets, API keys, project settings or network configuration
- Realtime configuration or external integrations

A disaster-recovery plan must separately preserve/recreate those resources and securely map restored profiles to the intended Auth user IDs.

## Offline inspection commands

Validate a full archive without opening a Supabase connection:

```bash
npx tsx scripts/restore_database.ts --validate-only backups/shop_pro_backup_<timestamp>.json
```

Generate a read-only restore plan showing schema version, source project, checksum, ordered tables, primary keys and row counts:

```bash
npx tsx scripts/restore_database.ts --plan backups/shop_pro_backup_<timestamp>.json
```

The plan command never connects to Supabase and never writes to a database.

## Staging recovery procedure

1. Create a separate, isolated staging Supabase project. Verify the project URL and keep its service-role key in a temporary secret store.
2. Restore/prepare the required Auth identities through the approved identity recovery process. Preserve user IDs for existing profiles; do not fabricate or reuse identities.
3. Apply the exact schema migrations to staging in order. Verify that all expected tables, constraints, indexes, triggers, RLS policies and security-definer grants exist.
4. Run `--validate-only` and `--plan` against the selected archive. Compare the schema version with the staging schema before importing.
5. Use a database-level, transactional restore process in staging, following the dependency order in the plan. Do not use the legacy transaction-only REST upsert as a substitute for full recovery.
6. Verify row counts, foreign-key integrity, organization isolation, account ledger balance snapshots, transaction/journal consistency, audit trails and application sign-in/reporting behavior.
7. Record the restore checksum, archive timestamp, target project and verification results. Obtain a separate owner approval before considering any production recovery.

## Production safety boundaries

- The full archive `--apply` path is intentionally blocked. Supabase REST upserts cannot safely recreate the complete database state, triggers, deferred relationships, Auth users and transactional invariants as one coordinated recovery.
- The legacy v2 transaction-only `--apply` option is retained only for a different, explicitly confirmed project with an empty `transactions` table. It is not a general database restore mechanism.
- Never test a restore against the live production project.
- This repository change schedules future backups; it does not start a backup, apply a migration, or write production rows during CI.
