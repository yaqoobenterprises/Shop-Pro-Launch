# Offline work and synchronization

## Browser ledger flow

The browser stores recoverable transaction drafts and queued transactions in IndexedDB, with an in-memory fallback for environments without IndexedDB. These stores are separate from the retained SQLite compatibility path.

1. Chat parses text locally and presents a review proposal.
2. The user confirms the category, date, and active account.
3. Online work is saved and posted through ledgerService and the database posting RPC.
4. When offline, the draft or transaction is retained locally with its idempotency key and status.
5. The application attempts a queue flush on startup, when the browser returns online, and when a hidden tab becomes visible.
6. Successful synchronization refreshes the ledger view. Failed work remains available for retry or review.

The client does not report an offline queued item as a completed online posting. Voids, restores, and edits require a connection.

## Compatibility paths

AuthContext, demoModeService, ledgerService, settings backup tools, and the services barrel still import the SQLite and legacy sync modules. The web application can therefore bundle some compatibility code even when the browser uses IndexedDB. See docs/legacy-audit.md before proposing removal.

The old-format offline queue fixture is part of the automated test suite. Preserve its format until a migration and recovery plan exists.

## Recovery

Use scripts/backup_database.ts for a manual database export and scripts/restore_database.ts --validate-only to validate an archive without connecting to a database. The restore script does not apply current full archives to Supabase. A production recovery must be rehearsed against an isolated compatible project with an owner-reviewed procedure.

GitHub Actions includes an application verification workflow and a manually dispatched backup workflow. The backup workflow requires repository secrets and is not a scheduled backup.
