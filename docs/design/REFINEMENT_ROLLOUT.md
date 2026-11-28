# Shop Pro refinement review and rollout

## Frontend preview

The branch refines the existing application rather than adding accounting modules. It preserves route IDs, draft review/posting, permissions, integer-paisa calculations, offline replay and full exports. New PWA assets have distinct versioned paths; the service worker keeps its existing user-controlled update lifecycle and does not cache private financial responses.

LedgerMate opens a fresh conversation each time the view mounts. Saved conversations remain available through explicit History selection. Thread hydration is generation- and account-scoped, so a delayed history response cannot replace a new conversation. New cloud conversations are created only when a message is sent.

The optional `VITE_PERIOD_ANALYTICS_RPC` flag remains off by default. Preview and production continue using the existing transaction services until a separate database rollout is reviewed.

## Database changes prepared, not applied

- `20261128045430_cashbook_analytics_read_api.sql`: an authenticated, SECURITY INVOKER, organization-scoped period summary API and seven supporting indexes. Existing transaction types, active-entry rules and cashbook calculations are retained. Category/date grouping is tested against known fixtures, including another shop, voided entries, empty periods and capital movements.
- `20261128045540_reassert_active_shop_draft_boundaries.sql`: reasserts the earlier authorization hardening definitions. It uses active organization membership, checks MFA before draft posting, and scopes the idempotent retry result to the current shop. It requires the existing private MFA helper and related tables/functions.

Before applying, compare deployed definitions and migration history with these files. Do not blindly apply all older pending repository migrations. Test on a current staging database first, compare summary results with existing exports across daily/weekly/monthly periods, inspect query plans, and exercise owner/manager/cashier, inactive-member and MFA flows. New indexes should be reviewed against existing equivalent indexes and table size before production deployment. PGlite checks validate SQL behavior on controlled fixtures; they do not replace production query-plan or full Supabase RLS integration checks.

After approved database deployment, enable the analytics flag in a preview, verify summary totals and filtered full-register exports match, then promote the reviewed frontend. Keep the flag off if the RPC is unavailable. No database settings, live ledger rows or production schema were modified during this preview pass.

## Verification scope

Automated checks cover financial workflows, offline replay, cross-shop boundaries, OAuth popup origin/window validation, search escaping and note matching, concurrent read coalescing, report pagination, history lifecycle and financial action confirmation. Rendered checks use the isolated demo workspace. Actual signed-in assistant inference and installed-device PWA icon refresh require the deployed authenticated environment; local demo health failures are shown honestly as assistant unavailable.
