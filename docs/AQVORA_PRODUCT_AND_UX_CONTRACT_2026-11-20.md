# AQVORA — enterprise-quality accounting workspace contract
**Draft design and delivery contract · 20 November 2026**

## Product promise
An owner signs up a company, configures an approved accounting book, invites staff, and can operate a genuinely complete, auditable finance workflow. No dummy balances, unfinished placeholder modules or disconnected side ledgers may be presented as real features. Existing Shop Pro businesses retain their historic books during a separately approved cutover. AQVORA is a working name; public branding is subject to trademark clearance.

**Industry neutral by default:** service, retail, wholesale, distribution and professional businesses share the same journal, counterparty, identity, period and reporting foundation. Optional workflows are enabled by company configuration rather than fabricated defaults.

## Navigation and user journeys
Desktop: Overview / Entries / Books / Sales & Receivables / Purchases & Payables / Customers & Vendors / Inventory / People & Payroll / Reports / Administration. Phones: Home / Entries / New / Books / More. Never surface a navigation item with a mock screen; unreleased capabilities remain explicitly disabled and documented, not faked.

| Workspace | Complete user journey | Mandatory proof |
| --- | --- | --- |
| Company & access | Verify owner account; configure company/currency/timezone; invite members; grant scoped roles; deactivate sessions | Rejected cross-company access, stale-role demotion, MFA, atomic membership and recovery |
| Chart of Accounts | Create/activate/rename/archive stable-ID accounts with parent hierarchy, type and posting controls | Unique per-company codes, no cycles, no post-to-heading, referenced accounts never deleted |
| Journal & vouchers | Draft multi-line entry → choose date/accounts/narration/source → see balanced preview → authorize → atomic posting → immutable receipt → reversal | Debits exactly equal credits in integer minor units; one intent posts once; closed period and unauthorized edits rejected |
| Cash & bank | Separate cash drawers, bank and wallet accounts; internal transfers; statement matching and reconciliation | Transfers do not create profit; unmatched and stale rows visible; no direct balance mutation |
| Accounts receivable | Customer → invoice/credit → allocation/partial receipt → statement/aging → reconciliation | AR aging and open invoices tie to the GL control account; revenue never recognized twice on collection |
| Accounts payable | Vendor → purchase bill/credit → approval → payment/partial settlement → aging | AP open items tie to GL; bill posting and payment are distinct events |
| Customers & vendors | Scoped contact CRUD, duplicate review, balances and transaction drill-through | Personal data least-privilege and source-linked balances |
| Inventory | Item/SKU, warehouse, purchase receipt, issue, sale, return, count, valuation and COGS | Physical quantity and value schedules tie to Inventory GL; policy approved (FIFO or weighted average) |
| Employees & payroll | Staff invite and access roles separately from employee records; compensation effective dates; attendance/allowances/deductions; payroll draft → approval → posting → payslip → payment | Payroll expense, payable, deductions, advances and payment ledger reconcile; sensitive salary access restricted |
| Reporting | General Ledger, Trial Balance, Income Statement/P&L, Balance Sheet, cash flow, AR/AP aging, stock valuation and payroll expense | Same authorized snapshot feeds screen/export/AI; all report figures drill to voucher; Assets = Liabilities + Equity; TB Dr = Cr |
| Audit & recovery | Immutable event trail, signed policy/period changes, exports, backup, test restore and error review | Versioned source IDs, reproducible restore, preserved pending offline instructions |

### Passwords / employee accounts
Never allow an owner to read or export another user's password. Invite a user by verified email/identity and let the user set their password through the auth provider; password resets use signed expiring flows. Admins can manage roles, sessions and revocation, not plaintext credentials. A personnel record does not automatically grant app access. Payroll banking/tax and identity data require separate permissions, masking and audit.

### Payroll accounting example
For an approved gross payroll 100,000 with lawful/approved deductions 10,000: debit Salary Expense 100,000, credit Payroll Payable 90,000 and applicable Withholding/Deduction Payable 10,000. Actual salary payment subsequently debits Payroll Payable and credits Bank 90,000. Rules, statutory deductions, tax and benefit treatment are **company/country-specific policies**, not universal defaults. Reversals and period locks apply.

## Non-negotiable visual system
- Use existing navy `#172638`, emerald `#14765E`, cool-gray canvas `#F5F7F8`; bundled Inter Variable for Latin UI, accessible Urdu type where localized, Lucide outline icons. Use semantic tokens for both light/dark; one icon grid/stroke system; no glossy 3D effects or arbitrary bright gradients.
- Layout density is deliberate: concise section titles, clear amounts/units/date basis, 1 primary action per context. No paragraphs on every card, marketing language inside accounting screens, duplicate labels, or fake progress.
- **Every input has a persistent label.** Placeholder gives an example only, never acts as a label or contains instructions. Required/optional, validation and server errors appear beside the relevant field with accessible association. Password fields have appropriate reveal/error behavior without exposing stored passwords.
- Buttons must communicate precise intent, enabled state and progress. No success animation before authoritative commit. Destructive and period-closing actions demand reason/confirmation. Keyboard navigation, touch targets >=44px in primary form actions, focus visibility and reduced motion are mandatory.
- Financial digits use tabular numerals, locale-aware grouping and exact minor units. Never show unavailable data as zero; label pending, stale, partial and as-of. Cash balance and period income/expenses are *different measurement bases*; a cashbook operating result is not an accrual P&L.
- Charts are sparse, source-backed, date-bounded, labeled with units, and accompanied by accessible tables/drill-through. No decorative sparkline, invented comparisons or percentages with zero denominator.
- Tables support relevant sort/filter/date/column density, accessible headings, stable number alignment, empty/loading/error/permission states, export of the selected verified scope and mobile adaptations (not horizontal page overflow).
- Responsive checkpoints: 360, 390, 768, 1024 and 1440px. Validate every screen in light/dark, keyboard-only, RTL, long amounts and poor connectivity.

## Engineering and release policy
- Modular monolith: React/Vite UI, Supabase Postgres/Auth with canonical per-company membership, server-owned transactional writer and versioned financial read APIs. One journal writer; no dual writes to legacy cashbook.
- Separate branches for SQL financial engine, domain/ledger calculations, UI components and cutover. UI must use real authorized query contracts; mock fixtures only in explicitly marked tests or demos.
- Amounts in integer minor units; validate overflow, idempotency fingerprint, immutable posted lines, fiscal close/reopen lock, company-scoped composite FK, authorization at each post/read, no direct account-balance updates.
- The approval gate for **each module**: approved data model → permission matrix → accounting invariants → complete screens/keyboard/mobile → loading/empty/partial/error flows → export/audit → red/green regression tests including two devices and network failures → staging Auth/RLS/MFA → recovery test → reviewed PR.
- Do not label a module "complete" when only its page, table or endpoint exists. Do not merge the cloud-disabled #32 demonstration into production. Security migration/reconciliation blockers from PRs #26–#31 remain prerequisites.
- Build order: [1] safety + isolated staging [2] Chart of Accounts, fiscal periods and atomic journal [3] GL, trial balance, P&L and balance sheet [4] AR/AP and contacts [5] inventory/COGS [6] employees/payroll [7] deeper analytics and AI. Premium design primitives and tested screens evolve in parallel; production features unlock only behind their own evidence gates.

## Immediate UI work
Refine current overview with correct cashbook terminology and meaningful labels, tested amount/error states and accessible chart data; improve shared inputs/buttons and keyboard semantics. This is a visual/interaction slice, **not** a claim that the final ERP screens already exist.
