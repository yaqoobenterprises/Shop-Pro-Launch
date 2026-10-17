# Database

## Source of truth

Supabase PostgreSQL owns cloud ledger data. RLS and database functions enforce tenant authorization and financial posting rules. The PGlite suite exercises selected migrations locally; it does not prove production schema parity.

The connected project's migration ledger records a squashed launch baseline followed by the MFA policy migration. The matching baseline file was reconstructed by combining the earlier checked-in migration sequence; its contents have not been compared byte-for-byte with the original baseline that was applied remotely. Original incremental SQL is retained under `supabase/migration-history/` for audit and local test fixtures. The active directory also contains a pending authorization migration. Do not apply archived SQL files to the connected project, and do not push the reconstructed baseline to the existing project without first verifying the schema on an isolated project.

## Main ledger tables

- `organizations` stores shop identity and regional settings.
- `profiles`, `shop_members`, and `organization_members` associate authenticated users with shops and roles.
- `categories` and `category_aliases` support entry classification.
- `transactions` stores posted ledger entries in integer paisa.
- `transaction_drafts` stores entries awaiting account posting.
- `payment_accounts` and `account_ledger_entries` hold balances and posting history.
- `user_preferences` stores per-user language and entry-mode preferences.

Older inventory, sales, expense, customer, and closing tables remain for compatibility. Their presence does not mean those screens are part of the current web navigation.

## Posting rules

The parser creates a proposal, then the user reviews it and selects an active account. Online posting uses the draft table and a database RPC. The database validates shop membership, category and account references, posting idempotency, and ledger balance effects. Offline entries remain queued until a connection returns.

Ledger amounts use integer minor units: 100 paisa equals 1 PKR. Preserve existing formatting and business-date behavior when changing shared money or date code.

## Safe migration workflow

Compare the local migration list with the Supabase project's recorded migrations before any schema change. Test on staging first. The pending migration's SQL requires owner approval before application; this repository review did not change the live database or read business rows.
