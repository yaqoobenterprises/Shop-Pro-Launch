# Legacy import audit

This is a source import-graph review, not a deletion plan. The current web application still imports several compatibility modules.

| Module | Current reachable path | Web relevance | Proposed retirement condition |
| --- | --- | --- | --- |
| storageEngine | AuthContext imports it directly; services/index imports it. storageEngine imports syncEngine and mockData. | Auth and compatibility paths retain it in the app graph. | Replace AuthContext's legacy storage path under a separately reviewed migration, then remove the barrel and its callers. |
| sqliteRepository | Imported by AuthContext, demoModeService, ledgerService, LedgerSettingsView, and services/index. | Local auth/demo behavior and Settings backup tools call it. ledgerService also keeps its Tauri fallback. | Preserve local-account, Demo, recovery, and offline fixtures while replacing each caller; do not remove as a bundle-size-only change. |
| sqliteEngine | Imported by sqliteRepository, syncEngine, services/index, and LedgerSettingsView. | Provides SQLite compatibility and is reachable from auth/settings code. | Remove only after the Tauri path and local recovery workflow have an explicit replacement or are retired. |
| syncEngine | Imported by AuthContext and storageEngine; uses sqliteEngine. | Legacy sync path remains reachable through auth and storage compatibility code. | Prove no supported local profile or recovery path needs it, then remove with its fixtures. |
| services/index.ts | Imported by QuickExpenseModal for expenseRepo and accountRepo; the barrel imports storageEngine and SQLite modules. | The global quick-expense modal keeps the barrel reachable. | Replace the narrow barrel imports with an explicit web repository layer before restructuring the legacy services. |
| mockData | Imported by storageEngine, sqliteEngine, and sqliteRepository. | Demo/local compatibility paths use seed data. | Keep until Demo and local auth are independent of the compatibility repositories. |
| AppView legacy members | Before this audit, pos, inventory, expenses, customers, and closings pointed to screens not rendered by App.tsx. The union now contains only chat, dashboard, sales, accounts, reports, and settings. | The command palette also used to direct users to unavailable screens; those targets are removed. | No remaining AppView entries are identified as unreachable. Recheck references when adding a view. |

## Retirement order

1. Decide whether local SQLite sign-in and Demo mode remain supported in the web product.
2. Add replacement behavior and regression tests for each supported auth, Demo, backup, and recovery path.
3. Remove imports from application entry points before deleting compatibility modules.
4. Rebuild, run the old offline fixtures, and measure the actual production bundle after each removal.

No legacy data code was deleted during this audit.
