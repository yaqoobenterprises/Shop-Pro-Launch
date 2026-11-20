# AQVORA V2 administration read client — safe integration groundwork

**Review branch:** `feat/aqvora-admin-read-client-20261120`, stacked on UI PR #43, separate from Codex backend PR #44.

## Implemented

- `src/services/aqvoraAdminReadService.ts` implements *read-only*, typed RPC contract for `list_aqvora_accounts` and `list_aqvora_periods`.
- Mapping between snake-case SQL and `ChartAccount` view model; includes exact bigint revision string (stale update protection), active/heading/control flags, period open/closed/reopen count.
- Requires `VITE_ENABLE_AQVORA_ADMIN_READS=true`, a real signed-in cloud identity, configured Supabase and an existing session before calling two independent read RPCs. No client-side authorization claims; SQL RLS and server authorization remain definitive.
- Validates tenant ID returned on every row. Rejects malformed/partial/missing/error payloads; **never** invents zero accounts/balances or falls back to sample data.
- 200-row page limit and explicit `hasMoreAccounts/hasMorePeriods` prevents claiming incomplete reads are complete charts.
- No mutation RPCs, no posted journal querying, no certified Trial Balance/GL. Existing sample-only FinanceDesignPreview stays separate and contains no V2 cloud activation.

## Feature behavior

The feature flag is deliberately **off** by default and is *not enabled on any deployed environment*. The API client is not wired into a screen until an isolated **Supabase Auth/PostgREST staging stack** validates SQL migrations (#38/#41/#42/#44), real MFA/AAL2 and role isolation. This branch has no production Supabase changes.

## Next gates

1. Staging schema/migrations and JWT Auth/PostgREST denial tests; backup/restore.
2. Add authenticated Chart/Period UI with explicit permission and mutation/confirmation flows using the server admin RPCs; no optimistic accounting updates without authoritative returned receipts.
3. Add certified server ledger and Trial Balance readers (from journal lines + reversals) before replacing illustrative GL/TB screens with real values.
4. Keep the founder-locked spacious pastel UI, 4 KPIs, context AI instead of a permanent AI panel.

Review integration with backend API contract: `docs/aqvora-admin-api.md` on Codex PR #44.
