# AQVORA — Global ERP Process Blueprint
**Status:** proposed product architecture and acceptance criteria, **not shipped functionality**  
**Owner:** founder; product/technical coordination: ChatGPT; hard backend/security: Codex  
**Review date:** 21 November 2026. **Current production** remains Shop Pro cashbook. This document is a design contract, not permission to merge/deploy/enable accounting writers.

## 1. Product principles

AQVORA shall be a globally usable, premium, modular, multi-company ERP. Enterprise depth comes from **complete traceable end-to-end business processes**, configurable policy, sound accounting and high reliability—not copying every screen from SAP or forcing complex procurement on a one-person shop.

- **One trusted financial source:** each operational document is a typed source to balanced, authorized, durable accounting postings. Source/subledger/GL/TB/financial reports must reconcile, or reports fail closed.
- **Modular activation:** customer can start with service sales + finance; optionally turn on purchases, inventory, cash/bank, payroll, fixed assets, projects, etc. Never render a nonfunctional active button.
- **Simple defaults, deep controls:** small organizations use straightforward templates; complex organizations configure departments, approval rules, account segments, multi-branch/role and enterprise reporting. Legal compliance varies by country and needs signed-off regional policies; never claim universal tax compliance.
- **Source-driven corrections:** submitted/approved/issued/posted states are explicit. Posted accounting is immutable; credits/reversals/adjustments are new authorized records, not destructive edits.
- **No financial guesses:** exact integer minor-unit strings, explicit currency scale/policy revision, documented rounding at each source, authoritative server decisions, historical as-of correctness, and no fake opening balances.
- **Default-deny tenant security:** trusted membership, live AAL2 for sensitive financial actions, RLS/SQL actor checks, bounded pagination, idempotent receipts and auditable maker/checker.
- **Honest UX:** partial, offline, demo, uncertified, missing policy and not-bank-verified states visibly distinct; no green “Paid” from an unconfirmed bank claim.
- **AI is an assistant, never the accounting authority:** cite authorized sources; propose draft suggestions only, with human approval. No autonomous postings.

Reference process taxonomy: [SAP end-to-end Business Suite](https://learning.sap.com/courses/exploring-ai-driven-lead-to-cash-in-sap-customer-experience/introducing-sap-business-suite_b6bdb5b0-9c4f-48fc-b237-0e375298ec7b), [Microsoft Dynamics Order-to-Cash](https://learn.microsoft.com/en-us/dynamics365/guidance/business-processes/order-to-cash-overview), [Microsoft Source-to-Pay](https://learn.microsoft.com/en-us/dynamics365/guidance/business-processes/source-to-pay-overview), and [Oracle legal entities/ledgers](https://docs.oracle.com/en/cloud/saas/applications-common/26c/faesc/model-legal-entities.html). These are **design references**, not a claim of product parity or copied vendor IP.

## 2. Enterprise organizational model (logical future state)

| Object | Business meaning | Required constraints |
| --- | --- | --- |
| Tenant / Organization | Contract, SaaS isolation and subscribed modules | One authenticated user may belong to multiple tenants; NEVER cross-query without changing scoped session |
| Legal entity | Registered company with statutory obligations | Separate ownership, fiscal calendar, currency/accounting book and taxes; distinct from a mere branch |
| Business unit / Branch / Location | Operational management within a legal entity | Scoped approvals, stock, cash points and reporting; no implicit mixing of separate legal entities |
| Ledger / Book | Accounting basis and local/statutory/reporting currency for a legal entity | Source-owned postings; primary vs future secondary book/consolidation; no invented consolidated balances |
| Chart of Accounts and dimensions | Accounts, cost center, project, product/location segments | Valid account classes, normal side, control roles, active posting leaves, mappings and effective revisions |
| Fiscal year / Period | Open/closed/locked reporting windows | Transactional close checks and audited reopen approvals; no silent backdated posting |
| Region/accounting policy | Currency unit scale, tax, rounding, invoice requirements, e-invoicing, recognition basis | Versioned; jurisdiction reviewed; explicit effective dates; never browser locale as authority |
| User, membership and policy | OWNER/finance approver/manager/cashier and future capability-based permission sets | Server-owned grants, MFA for high-risk actions, permission boundaries and separation of duties |
| Document and source receipt | Business intent, history and accounting link | Stable IDs, monotonic revision, typed source, idempotency key, immutable source fingerprints |
| Journal / subledger | Financial recognition and related AR/AP/customer/supplier movement | Atomic balanced entry; no direct client balance mutation; source-to-control reconciliation |

**Current V2 reality:** most SQL and frontend read models are company-scoped `organization_id` with fixed strict roles. Separate legal-entity-ledger hierarchies, configurable approvals, consolidation, FX and tax adapters **are future domains**. Do NOT change this guarantee in the existing writer without verified domain/migration design and founder approval.

## 3. Canonical end-to-end processes

Each process has its own **separate page or task workflow**; cross-module links follow document IDs and permitted actions.

### 3.1 Lead / Order → Cash (L2C / O2C)
Lead (optional CRM) → Customer → Quotation (optional) → Sales Order (optional) → Fulfillment/Service completion (when applicable) → **Sales Invoice** (draft → submit → independently approve where policy requires → issue) → **AR subledger** → Cash/Bank/Wallet receipt evidence → Receipt allocation → AR settlement → credit note/refund/chargeback where justified → GL/TB/financial statement reconciliation.

- **Fast service path for microbusiness:** Customer → service invoice → authenticated issuance → AR → authorized receipt → settlement; optional quote/order steps absent, not fake-completed.
- **Goods path:** sales reservation, delivery/dispatch and tax/COGS timing are separate accounting events, governed by company policy; do not treat an invoice as proof of delivered stock.
- Recognition depends on region/accounting policy: current approved V2 service-only out-of-tax-scope issuance is **Dr AR, Cr Service Revenue**; no tax/COGS is supported or inferred.
- Current controlled-cash manual attestation is distinct from **independent bank statement verification**. A receipt must never imply cleared bank funds when no matching bank evidence exists.
- Overpayment, unapplied cash, credit limits, aging, dunning, returns, refunds, deferred revenue and bad-debt provisioning are separate future workflows—not invented implicit buttons.

### 3.2 Source / Procure → Pay (S2P / P2P)
Vendor onboarding → Request/requisition (optional per configuration) → RFQ and comparison (optional) → Purchase Order / contract → Goods or Service Receipt → Vendor Bill with validation (2-way/3-way match as applicable) → **AP subledger** → authorized payment run/transfer → bank reconciliation → GL/TB and supplier statement reconciliation.

- Service-only purchase may not need stock receiving; inventory procurement requires physical quantity/valuation controls.
- The matching and liability recognition **must follow approved policies**; a PO is an intent/commitment, not automatically a payable expense.
- Matching failures, credit/debit notes, partial deliveries, supplier advances and duplicate vendor invoices require explicit exceptions and evidence.
- Never silently write AP from a draft/vendor import with no approved source.

### 3.3 Record → Report (R2R)
Company/ledger policy → CoA/dimensions → fiscal periods → source-backed immutable journals → posting receipts and adjustments/reversals → GL → certified Trial Balance → period-end accruals/deferrals/depreciation/FX as authorized → reconciliation & control accounts → period lock/close → P&L, Balance Sheet, Cash Flow and explanatory reports → exports with provenance.

- Cashbook income minus expenses is **not** accrual profit. A valid double-entry GL/TB alone does **not** certify P&L or Balance Sheet without account mappings, policies, verified opening balances and closing rules.
- As-of reports require consistent source coverage; any missing/stale page, fiscal policy mismatch or untrusted legacy opening fails closed.
- Historical revisions and corrections are auditable; avoid destructive posting edits.

### 3.4 Cash & Treasury
Cash points/float → Cash receipts and payments → Transfer authorization → Bank accounts/statements → import & duplicate detection → matching + reconciling items → independent bank reconciliation → fees/interest/FX differences → cash-flow reporting. Manual cash claim, statement-confirmed deposit and accounting balance are three **different states**.

### 3.5 Inventory & Operations
Products/services/UOM/tax profiles → Warehouses/bins → Purchase receipt → Transfer/adjustment/stock count with approvals → Sales dispatch/returns → inventory valuation/COGS → profitability reconciliation. Support future perpetual inventory, inventory costing policy, serial/batch/expiry, multi-warehouse and intercompany transfers—only after source/GL contracts and concurrency controls.

### 3.6 Hire / Recruit → Retire
Employees → contracts → attendance/leave → timesheets → payroll inputs and tax/benefits → approval → exact payroll liabilities and expenses → bank payment and statutory remittance → employee reporting/audit. Strong payroll data privacy; HR users do not automatically get full GL access.

### 3.7 Fixed Assets / Projects / Service
Acquisition and capitalization → depreciation policy → transfer → impairment/disposal → GL audit; Project budgets → timesheets/cost allocation → contract billing → profitability; service appointments/work orders → consumption/costing → service invoice. Never infer capitalization/recognition rules from generic cash entries.

### 3.8 Analytics & AQVORA Copilot
Role-scoped, source-provenance-first dashboards: cash, revenue, open AR/AP, expenses, stock, approvals, overdue items, financial statements and anomalies **only for supported verified sources**. Copilot may explain numbers, suggest classifications, prepare draft entries and route approvals; no impersonation, unauthorized reads or silent posting.

## 4. Workflow contract required for every financial document

1. **Identity & scope:** `organization_id`, future `legal_entity_id`, customer/vendor/account/warehouse links, currency, business/posted timestamps and actor identity.
2. **States:** `draft → submitted → approved (if policy) → posted/issued` plus rejected/cancelled/voided or reversed **as distinct legal states**; no one-size-fits-all transitions for all source types.
3. **Policy:** role/capability, threshold, delegated authority, independent maker/checker when required; current V2's distinct OWNER is the **conservative baseline**, not the global final configurable policy.
4. **Atomicity:** validate source/revision/policy and post in one server transaction; tenant, period, account and balanced journal checks; no client-side amount mutations.
5. **Evidence:** receipt with company, source type/id/revision/fingerprint, actor, journal, exact lines, durable idempotency intent; recover after timeout, no new key without investigation.
6. **Accounting meaning:** explicit trigger and correct journal for source kind. Drafts, quotes and POs are **not** posted revenue/expense by default. Tax, deferred revenue, VAT, discount, FX and settlement rules are configured and tested before activation.
7. **Reads:** stable snapshot/page identity, source totals, explicit V2 vs legacy, effective policy and currency scale, cutoff and complete scope. Missing/unauthorized ≠ zero.
8. **Corrections:** authorized credit/reversal/refund process preserving original source and audit; not DELETE/UPDATE financial history.
9. **Operations:** offline read/draft queue can exist, but high-risk financial posting always confirms live server authorization; queued stale intent must be reconciled.
10. **Testing:** concurrent issuers, exact retry/lost ACK, role revocation, policy/fiscal change races, wrong tenant, bad amount, backup/restore and business reconciliation.

## 5. Founder-locked UX information architecture

Navigation groups (modules only shown when enabled *and* authorized):
- **Home:** personal tasks, 0–4 true KPIs, one primary trend + secondary chart, alerts tied to evidence.
- **Sales:** Customers, Quotes/Orders (future), Invoices, Receipts, Receivables.
- **Purchases:** Vendors, Requisitions/POs, Bills, Payments, Payables (future).
- **Inventory:** Products, Warehouses, Stock & Adjustments (future).
- **Finance:** Chart of Accounts, Journal, General Ledger, Trial Balance, Cash/Bank, Financial Statements.
- **People/Operations:** HR, Payroll, Projects, Fixed Assets, service workflows as modules ship.
- **Insights & AI:** Reports, source-linked insights and dedicated AQVORA Copilot route with optional contextual drawer.
- **Administration:** Legal entities, branches, roles/approval policy, fiscal/tax/currency policy, feature activation, audit logs, backups.

Visual contract: founder-supplied Poital.flow Sales Overview screenshot is **locked**; muted lavender-grey background/sidebar, white surfaces, airy spacing, Inter, minimal icons, navy/emerald identity, <=4 desktop KPIs, thin lavender/teal charts, separate substantial workflows, responsive 360–1440 px, light/dark, keyboard accessible. Do not replace with giant cards, giant AI rail or decorative chart placeholders.

All enabled UI actions must have genuine success/failure/permission/loading/disabled states. Use progressive enhancement: one-person small-shop template can start immediately **after** accepted onboarding controls; sophisticated multi-entity approval setup is optional, not forced on every customer.

## 6. Rollout sequence / no skipped foundation

**Gate 0 — integrate and validate existing V2 first:** backend #41→#63 and frontend #64→#71 reconciliation; actual customer → service invoice → independent approval → source posting → controlled cash receipt → AR settlement → GL/TB. Hosted isolated synthetic staging, AAL2, exact currency scale, signed-off tax/period/company policy, legacy/offline queue protection, restore and false-duplicate tests. No production company activation.

**Wave 1 — core finance & O2C:** complete approvals/receipt/credit workflows, true invoice read/print export, CoA/fiscal UI, authoritative P&L/Balance Sheet and bank reconciliation only when mapped and certified; tested source provenance.

**Wave 2 — P2P/AP & cash/bank:** vendors, controlled purchase bill posting, AP settlement, payment approvals and reconciliation, partial/duplicate vendor invoices, credit cases.

**Wave 3 — POS & inventory:** SKU/UOM/warehouse, sales/POS, receipt/dispatch, stock costing and returns, purchase integration and valuation to GL.

**Wave 4 — enterprise globalization:** multiple legal entities/books, location/dimension accounting, country tax/e-invoicing adapters, FX/translation, intercompany, consolidated and comparative reporting, configurable approvals and business-unit scopes; country policies require legal/accounting signoff.

**Wave 5 — people/assets/projects & AI expansion:** payroll/HR, fixed assets, project/service costing, authorized predictive insights and human-reviewed AI drafting.

Wave numbering shows **dependency ordering**, not a shipped status or a promise of completion dates. Company signup and trustworthy onboarding are a foundation thread throughout waves.

## 7. Must-not-miss release acceptance

- Full synthetic document journey meets source receipts, exact Dr/Cr, AR/AP controls, GL and TB; post-issue receipts consistent after retry/lost network.
- Trusted signed-off currency unit scale, tax, fiscal calendar, account control roles; **#68 remains blocking**. No guessed currency conversion.
- Real hosted isolated Supabase Auth (AAL2), cross-tenant denial, independent two-user roles, RLS grants, revoked-session denial and realistic rate/replay abuse.
- Migration order, restore drill, company opt-in, immutable opening balance manifest and **old-client/offline queue** fencing pass. No hidden legacy “balancing plug”.
- Fail-closed incomplete reports, snapshots, approvals, unauthorized actions and source corruption; no sample fallback in cloud business views.
- Source-level audit and durable intent trace from UX to immutable journal and document state; documented exceptions and correction paths.
- Real-browser mobile/tablet/desktop/dark/light/keyboard/screen-reader and founder-reference visual review. Functionality and clarity precede illustration polish.
- Performance/load on large synthetic tenants, tested query plans and bounded source readers. Zero unjustified production changes; rollback/runbook and founder approval.

**Implementation rule:** treat this blueprint as proposed and reviewable. Changes to the current SQL writer or legal/tax/financial policy must be narrow, separately tested and approved. Never retrofit a generic configurable approval engine into an unreviewed live posting path.
