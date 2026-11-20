# AQVORA navigation and workspace UX — 20 November 2026

## Scope of this visual release slice
Draft PR, stacked on #37, independent of accounting foundation #38 and all Supabase migration PRs. No financial posting, balance, Auth, sync, or SQL change.

### Correct page naming (current features only)
| Existing route | Correct UI label | Does not imply |
| --- | --- | --- |
| `dashboard` | Overview | Accrual finance dashboard |
| `chat` | Quick Entry | A complete General Ledger |
| `sales` | Transactions | A complete sales/order module |
| `accounts` | Cash & Bank | Chart of Accounts / GL control ledgers |
| `reports` | Cashbook Reports | Trial Balance / statutory P&L |
| `ai` | LedgerMate AI | Certified accounting advice |
| `settings` | Settings | Multi-company administration |

Labels are translated in English and Urdu and shared across sidebar, header and command-search results through one navigation model. This prevents a misleading “Ledger” link from implying that the V2 Chart of Accounts already exists.

### Desktop and mobile
- Sidebar uses **Workspace** and **Insights** groupings. No unavailable/POS/Payroll links are fabricated.
- Collapsed sidebar now retains keyboard-operable icon links and an accessible Settings link; the old implementation hid *all* navigation when collapsed.
- Mobile dock has **Overview, Transactions, New, Cashbook Reports, More**, with **New** wired to the *existing* `startNewEntry` action (focus request) rather than changing to a nonfunctional page.
- More drawer exposes **Cash & Bank**, LedgerMate AI, Settings and conditional device lock; Escape closes with focus restored and demo cannot lock.
- Shared reference-inspired pastel/lavender and dark token styling retained. Buttons keep visible focus indicators and touch-friendly targets.

### Verification and future work
- Unit test must verify per-page label consistency, collapsed rail access, real composer action, mobile overflow menu and conditional lock.
- Browser visual QA required at 360 / 390 / 768 / 1024 / 1440, light and dark, RTL, keyboard-only and large values. A build-only Vercel READY is not visual acceptance.
- Real General Ledger, Chart of Accounts, Journal and Trial Balance navigation will be added **only when server read/post contracts are authorized and tested**; later navigation integration can append new routes without renaming existing legacy cashbook data.
- No production merge until PR #33–#39 UI chain and backend security PRs have been reconciled and independently reviewed.

### Codex workflow
Codex should begin secure accounting backend work from a clean **main** branch, review #38 as a proposed headless financial model and #26/#30 as pending security changes, and create separate Draft PRs. Do not branch backend SQL work from this UI branch or combine preview-only invalid Supabase env vars with backend migrations. Staging required for Auth/MFA/currency lock and posting concurrency.
