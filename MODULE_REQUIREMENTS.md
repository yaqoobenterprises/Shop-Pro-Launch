# Shop Pro V2 — module requirements

**Status:** Proposed requirements, not delivered features. Read with [PRODUCT_BLUEPRINT.md](PRODUCT_BLUEPRINT.md) and [ACCOUNTING_ARCHITECTURE.md](ACCOUNTING_ARCHITECTURE.md). Existing cashbook history and pending work must remain accessible until independently reconciled.

## Non-negotiable product contract

- One shop-scoped source of truth for posted financial records; one balanced journal engine for Smart Entry and Professional Voucher.
- Drafts, queued work, rejected imports, and posted receipts are visibly different states. No pending item affects a verified financial statement.
- Money uses exact currency minor units. Every posting has business date, server posting instant, account, authenticated actor, source, stable intent ID, and audit/reversal trail.
- Every completed report, export, assistant answer and chart uses the same authorized period, basis, source IDs, and coverage.
- Tenant and permission checks are enforced in database functions/RLS, not just by hiding client buttons.
- English, Urdu, and Roman Urdu input must pass fixture tests before rollout. AI can propose drafts but never bypass confirmation or authoritative posting.
- Cloud-first multi-device sync must preserve same receipt across interrupted requests. Offline mode queues recoverable intent rather than claiming server success.

## Users and permissions

| User | Primary jobs | Safety |
| --- | --- | --- |
| Owner | Financial overview, company controls, membership and accounting policy | High-impact changes require actor, reason, approval where configured, audit event |
| Accountant / bookkeeper | Chart, journals, reconciliation, reports, period close | Balanced, approved posting with traceable supporting references |
| Counter operator | Smart entry, basic receipts, own work and drafts | No permission to rewrite posted books or view another shop |
| Reviewer | Inspect documents, reports, exceptions and reversals | Read-only unless explicit approval permission |

Owner must approve which roles can see reports, perform adjustments, reopen periods, use AI or export data. Support active membership changes, MFA policy and shop selection without cross-shop reads.

## Accounting minimum — Release A

| Module | Screens and actions | Must pass |
| --- | --- | --- |
| Overview | Period selector, as-of balances, income/expense, charts, pending issues, drill-through | Distinguish period flow from balance as-of; no fabricated zero on unavailable data |
| Smart Entry | Parse plain text, category/date/account preview, confirm, find receipt | PRINT 300 or PAPER -2000 creates reviewable draft; posting exactly once |
| Professional Entry | Journal voucher with multiline debit/credit, narration, source and preview | At least two journal lines, exact debits = credits, correct period/role |
| Chart of Accounts | Hierarchy, active leaves, account lookups and reporting mappings | Unique shop code, immutable ID, no deletion of used ledger accounts |
| General Journal / Ledger | Voucher sequence, all lines, opening/closing, reversals, filters | Trace every value back to original source; posted entries immutable |
| Cash / Bank | Drawers, banks, wallets, transfers and statement reconciliation | Transfer has two offsetting legs and zero effect on profit |
| Trial Balance | Opening, movement, ending Dr/Cr columns | Debits equal credits, with complete authoritative source |
| Profit & Loss | Revenue, returns, COGS, operating, finance and other results | Same figures as underlying GL; legacy cashbook basis shown separately |
| Balance Sheet | Assets, liabilities, equity and unclosed result at chosen date | Assets = liabilities + equity in exact minor units |
| Drafts & Sync | Pending, failed, confirmed, retry and recovery inbox | No duplicate posting after dropped response or reconnect |
| Settings / Audit | Accounts, permissions, policies, close/reopen, backups | Each sensitive change authorized, retained and reviewable |

### Shared acceptance data

Legacy fixture: Cash opening 200.00 and Bank 0.00; income 100.50; expense 32.25; owner capital 500; drawing 12; adjustments +0.55/-0.30; transfer 100 to Bank. Final Cash **656.50**, Bank **100.00**, legacy operating result **68.25**. A repeated request must not change amounts or counts.

V2 fixture: Three inventory units bought at 60 on vendor credit, sell two at 100 on customer credit, collect 80, pay vendor 60. Expected inventory 60, bank 20, receivables 120, payables 120, revenue 200, COGS 120 and earnings 80. Assets **200** = liabilities **120** + earnings **80**; unclosed trial balance Dr = Cr = **320**. This is a proposed synthetic fixture, not proof the current app supports inventory.

## Trade — Release B

- Customers/vendors with stable IDs, shop access, references and contact privacy.
- Invoices, bills, line items, due dates, series, partial collections/payments, deposits, returns, credit notes, and printable status.
- Open-item allocations reconcile to receivable/payable control accounts at any as-of date. A receipt against an existing invoice does not recognize revenue twice.
- Corrections do not overwrite settled documents; they create linked, traceable adjustment/reversal documents.

## Stock — Release C

- Items/SKUs, units, warehouses/locations, receipt, issue, return, stock count, cost valuation and COGS.
- Start with an owner-approved costing policy (FIFO or weighted average). Tax and multi-currency stay gated.
- Per item/location quantity and value schedules reconcile to financial Inventory GL. Reversal and reconnect cannot apply one stock movement twice.

## LedgerMate AI

- Search verified records; explain basis, dates, source evidence and missing coverage.
- Tools check user/shop permissions each call; source notes and retrieved text are untrusted.
- Proposed entries show editable data and impact. Post, void, close, send and authorize actions require conventional user confirmation outside chat.
- Test English, Urdu, Roman Urdu, unavailable cloud, malicious document text, role changes and private conversation isolation.

## Nonfunctional and acceptance gates

- Accessibility: keyboard navigation, contrast, mobile touch and safe areas, reduced motion, complete RTL paths.
- Reliability: stable request keys, durable IndexedDB acknowledgement, recorded retry state, accurate as-of/period semantics.
- Reporting: deterministic snapshots, paginated source reads, identical on-screen/export/AI figures, explicit partial coverage.
- Security: effective RLS, SQL privileges, definer functions, staged schema testing, no secret in browser or AI prompts.
- Recovery: owner-approved RPO/RTO, encrypted private backups, rehearsed restore including balances, identities and pending operations.

Each module PR must document accounting invariants, failure tests, tenant isolation, UX states, source mapping and rollback. No module is marked complete because an underlying old table happens to exist.
