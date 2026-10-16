# Database

## Source of truth

The Supabase PostgreSQL migrations in supabase/migrations define the cloud schema. They are applied in filename order. PGlite tests exercise selected migrations and database rules locally; they do not prove that a live project has the same schema.

The application uses organization_id to scope shop data. Row-Level Security policies check shop membership. Financial posting, audit attribution, optimistic concurrency, voids, and account balance changes are enforced in database functions and triggers.

## Main ledger tables

- organizations holds shop identity and regional settings.
- shop_members and profiles associate authenticated users with a shop and role.
- categories and category_aliases drive entry classification.
- transactions stores posted ledger entries in integer paisa.
- transaction_drafts stores entries awaiting account posting.
- payment_accounts and account_ledger_entries hold account balances and their posting history.
- user_preferences stores per-user language and entry mode.

Older product, sales, inventory, expense, customer, and closing tables remain in the schema for compatibility. Their presence does not mean those screens are part of the current Shop Pro web navigation.

## Posting rules

The parser creates a proposal; it does not write financial data. The user reviews the proposal and selects an active account. The ledger service saves a draft and calls the account posting RPC. The database validates tenant membership, category and account references, amount and date rules, and idempotency. Voids and restores create reversals through the database path.

Amounts in the ledger use integer minor units: 100 paisa equals 1 PKR. PKR presentation currently rounds to whole rupees unless a caller explicitly requests paisa. Do not change that display behavior without matching every screen and export to the existing golden tests.

## Regional migration

20261014000000_regional_settings.sql adds shop currency, country, timezone, region setup state, and per-user preferences, and changes business-date derivation to use the shop timezone. Currency changes are locked after ledger entries exist. The database trigger restricts changes to regional fields for non-owners.

For the complete migration list and staging procedure, see docs/ROLLOUT.md. Do not apply a migration to production from this code review.

`20261016074319_owner_only_organization_updates.sql` is a proposal only. It adds a private owner check using `shop_members` for organization updates. Review it in staging and approve it before applying it to any shared project.
