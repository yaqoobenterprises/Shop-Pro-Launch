# AQVORA — full source snapshot exporter (migration phase 3)

**Status:** Review-only, local, non-posting. Not production migration, backup, or release. Child of PR #91 and release coordination issue #89.

## Purpose
Founder confirmed historical Shop Pro data must survive in the future AQVORA accounting ERP. The private 415-row CSV does not include transaction account IDs, account opening balances, transfer legs, ledger reversals, audit rows, cloud drafts or device-only IndexedDB queues. **Four distinct organization UUIDs share two display names.** Extract EACH actual UUID separately; no name-based consolidation.

## Implemented
- Script: scripts/aqvora_legacy_snapshot_export.mjs
- Requires explicit UUID + source project reference + expected transaction/account/ledger counts; optional additional collection expectations.
- Opens ONE PostgreSQL REPEATABLE READ READ ONLY transaction, sets timezone UTC, verifies read-only status, active row-security and role without superuser or BYPASSRLS. Source organization must exist and use PKR.
- SELECT-only, fixed seven-table whitelist: transactions, payment_accounts, account_ledger_entries, account_transfers, audit_log, transaction_drafts and categories. Each query restricts organization_id by parameterized UUID, same snapshot/transaction.
- Original exact bigint, numeric, timestamps and JSON(B) audit fields are kept as strings: JS Number precision and timezone conversion are forbidden. Historical audit old_data/new_data are preserved as raw JSON text.
- Rejects source count drift, foreign organization IDs, duplicate row IDs, missing collections, privileged role, loss of exact money precision. On failure rolls back and accepts no snapshot.
- Private JSON output refuses paths inside Git repository, uses exclusive create/no overwrite and owner-only mode 0600. Prints only aggregate counts.
- Output contract matches scripts/aqvora_legacy_source_reconcile.mjs from #91.

## Security and practical operator instructions
This exporter is not a database backup, a remote HTTP API, or a substitute for independent bank verification. A restricted, tenant-authorized, SELECT-only database role must ALREADY exist. Provisioning production roles, writing data or bypassing RLS requires separately approved security work. Row-security ON is not proof that the table owner cannot bypass RLS; verify actual role ownership, SQL grants and the organization's RLS policies independently. Never use service-role or database-owner credentials, expose passwords to a web client, or store credentials in Git.

After independently authorized private extraction and independent backup/restore plan:
1. Set environment variables AQVORA_READ_ONLY_EXPORT_APPROVED=YES and AQVORA_SOURCE_READONLY_DATABASE_URL to restricted credentials using a secret manager.
2. Run the command from a private trusted machine and an OUTSIDE-GIT output folder. The following source UUID and project name are synthetic placeholders, not a live tenant:

    node scripts/aqvora_legacy_snapshot_export.mjs --source-project example-source-001 --organization 11111111-1111-4111-8111-111111111111 --expected-tx 415 --expected-accounts 2 --expected-ledger 445 --expected-transfers 3 --expected-drafts 2 --out "/private/legacy-source-a.json"

3. Repeat separately for every actual source UUID, with fresh expected counts obtained via authorized read-only audit. Do not override drift merely to force an export through.
4. Run the offline #91 reconciler against each private export and review every mismatch; separate account balance equality from bank statement reconciliation. Preserve extraction timestamp and recheck late changes before cutover.
5. Independently back up each real device's IndexedDB offline queue/drafts and test installed PWA upgrades and replay/retry.
6. Obtain founder/accountant legal-company mapping, CoA/currency/fiscal signoff, physical cash and UBL statements, historical reversal/fixture and pass-through policies BEFORE any ERP conversion.

## Previous read-only source counts (may drift)
- One UUID: 415 transactions, 2 payment accounts, 445 account-ledger rows, 3 transfers, 2 cloud drafts.
- Second UUID: 1,001 transactions, 4 payment accounts, 1,002 ledger rows. Exactly 1,000 transaction descriptions explicitly tagged as pagination tests; preserve original history but quarantine from earned-revenue calculations.
- Third UUID: 0 transactions, 4 payment accounts, 4 opening ledger records; opening PKR 70,000 without independent bank/cash verification.
- Fourth UUID: 0 transactions, 1 payment account, 0 ledger rows.

The precise identity registry remains private, not in this PR.

## Verification
Synthetic tests: tests/aqvora_legacy_snapshot_export.test.ts.
This branch changes no Supabase project, no financial writer, no migration, no existing company balances and no deployment. Real data has not been extracted using this new script. Production merge and financial posting remain NO-GO without explicit founder authorization.
