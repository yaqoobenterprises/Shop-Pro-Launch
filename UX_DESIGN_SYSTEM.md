# Shop Pro V2 — premium UX design system

**Status:** Proposed UI direction; preserve live theme and existing customer workflows. This extends root [DESIGN.md](DESIGN.md) and the [product blueprint](PRODUCT_BLUEPRINT.md). Visual refactoring must never change financial posting, RLS, or database semantics.

## Design principles

- Financial clarity first: compact, clean layout, strong hierarchy, little redundant text, useful icons and explicit actions.
- Preserve navy **#172638**, emerald **#14765E**, light canvas **#F5F7F8**, bundled Inter Variable, Lucide outline icons, semantic tokens and persistent dark/light mode.
- Keep figures in tabular numerals, currency explicitly labeled; separate income/expense, account balances, debit/credit, posted/pending. Profit is not a synonym for cash.
- Use CSS semantic surface, border, text, focus, elevation and status variables, not isolated hardcoded page colors.
- Motion conveys state (navigation, validation, pending to posted), never distracts from money. Honor reduced motion.

## Responsive navigation

| Screen | Navigation | Layout |
| --- | --- | --- |
| 360–430px phone | Home, Entries, New, Books, More; clear single primary action | Single-column cards, sticky safe-area composer, structured rows instead of unreadable spreadsheets |
| 431–767px | Same information architecture | Flexible 1–2 columns and readable touch controls |
| 768–1023px tablet | Compact rail/sidebar, top filters | 2-column summary, controls stay near source views |
| 1024px+ desktop | Sidebar plus context header; optional inspector | Multi-column workspace, ledger tables and keyboard shortcuts |

A wide financial table may scroll within its own region, preserving headers; the entire phone page must not overflow horizontally. Touch targets should generally be at least 44×44 CSS px unless an applicable exception applies.

## Shared components

1. **Workspace header:** shop context, page title, selected period/basis, primary action and one secondary action.
2. **Metric card:** real amount, precise label and time scope, link to source; a valid comparable trend only when denominator exists.
3. **Chart:** labeled periods/axes, accessible data-table alternative, tooltip with currency and comparison basis; unavailable is never silently zero.
4. **Entry preview:** type, date, shop, selected real account, category, amount and rationale; error stays near invalid field.
5. **Journal grid:** debit/credit columns, account search, total and imbalance pinned by Submit, instant keyboard navigation.
6. **Posting receipt:** immutable voucher/source ID, success timestamp, posted amount and drill-through. Queued/failed work is not styled as success.
7. **Ledger row:** date, document, account, debit/credit, running balance, audit state and source detail.
8. **Status and empty state:** Posted, Draft, Queued, Syncing, Needs Review, Failed, Reversed, Incomplete, No Activity, Not Authorized. Each state has words and icon as well as color.
9. **Modal and toast:** destructive changes require confirmation/reason; transient toast does not replace durable failed-action status.

## Page composition

| Page | Hierarchy |
| --- | --- |
| Overview | Shop + period; 3–4 important KPIs; trend; categories; account balances (as-of); exceptions and pending |
| Entries | Smart composer, review, recent postings, draft retry and search |
| Professional Voucher | Document info, multi-line entry grid, balance total, source and audit preview |
| Chart & GL | Account tree/search, filter, opening, postings, closing Dr/Cr and linked voucher |
| Cash / Bank Reconciliation | Statement vs book, cleared/unmatched, outstanding checks, explanations and separate adjustment previews |
| Reports | Basis, range and shop; exact KPIs, chart/table, drill-through, export scope and completeness |
| Trade | Draft/open/partial/settled documents, contact, line editor, allocations and audit view |
| Stock | Item, quantity/value and valuation method, location and movement history |
| LedgerMate | Private conversations, real-source evidence, bounded actions, explicit confirmation |
| Settings | Membership, language/theme, region, financial policies, periods, import/export, secure recovery |

## Light/dark, RTL and accessibility

- Theme persisted across app, settings, landing and browser tabs, with no theme flash on load.
- Correct focus/tab order, visible controls and explicit keyboard help. No keyboard shortcut silently posts a voucher.
- English, Urdu and Roman Urdu labels and messages; Urdu uses appropriate fonts and bidi isolation for Latin IDs/numbers. Charts may keep LTR numerical axes while surrounding copy follows document direction.
- Report tables have accessible headers, charts an alternate data table, dialogs reliable focus restore, statuses meaningful screen-reader text.
- Validate long labels, amounts, large data sets, empty states, no network and interrupted confirmation. Avoid visual-only success.

## UX verification

Review at **360, 390, 768, 1024 and 1440px** in both themes. Test signed-out/login/MFA, cashbook entry, manual voucher, network loss, retry, report export, account reconciliation and long tables. Verify browser screenshots, keyboard-only flow, touch behavior and reduced-motion preference. Use visual PRs separate from accounting service/migration work.

**Acceptance:** A counter user can prepare, review and later locate a confirmed receipt on phone. An accountant can move from report total to GL to voucher on desktop without changing basis, date, number or source.
