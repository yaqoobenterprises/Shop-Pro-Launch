# Shop Pro architecture

## Runtime

Shop Pro is a React 19 and TypeScript web application built with Vite. The deployed web application is a PWA. The repository also retains SQLite and Tauri compatibility modules, but there is no Tauri application shell in the current web deployment.

The runtime flow is: React workspace → authentication and app state → ledger screens → deterministic parser → review and account selection → ledger service → Supabase PostgreSQL or persisted browser offline stores.

## Application layers

- App.tsx composes authentication, workspace, regional formatting, language context, navigation, and global dialogs. The signed-in views load as separate chunks.
- AuthContext owns session, organization, role, PIN-lock, and demo-mode state. AppContext owns the current screen, preferences, keyboard shortcuts, toasts, and dialogs.
- ChatView sends text to the deterministic parser. Uncertain entries remain in the review flow. Confirmed entries use the ledger service and account posting path.
- ledgerService coordinates online Supabase operations, persisted browser drafts, and the offline transaction queue.
- Supabase PostgreSQL stores tenant data. Row-Level Security and database functions enforce tenant checks and financial posting rules.
- The regional modules format money and derive business dates from the selected shop region. The i18n provider currently defaults to English; Urdu dictionaries and font load on demand when the language flag is enabled.
- storageEngine, sqliteRepository, sqliteEngine, syncEngine, and mockData remain in the import graph for compatibility and local/demo paths. Their retirement plan is recorded in docs/legacy-audit.md.

## Feature flags

src/config/features.ts holds regionSettings, languageUr, entryModes, and chatQueries. All are false in the checked-in release build. Keep them disabled until the corresponding rollout checks in docs/ROLLOUT.md are completed.

## Data flow

Text is normalized and classified locally. The user reviews the proposal, chooses an active account, and confirms. Online posting uses the database draft and posting RPC. Offline work is persisted locally and retried after a connection returns. See SYNC.md and DATABASE.md for the detailed contracts.
