# Cashbook rules and decisions

**Status, 19 November 2026.** The rules in the first two sections describe the checked-in cashbook. The decision register records proposed policy for owner review. It does not authorize a change to entries, opening balances or historical reports. Finding IDs refer to [CORE_AUDIT.md](CORE_AUDIT.md).

## What enters the books

A shop records money received or paid through a cash, bank, digital-wallet or other payment account. The operator reviews the amount, type, category where applicable, business date and account. A parser suggestion or saved draft has zero effect on cash and profit. A cloud posting changes the account and records its movement in the same database transaction. An offline confirmation is an instruction awaiting a cloud result. Demo has its own local behavior.

Let **A** be a positive integer amount in the shop's minor currency unit. Effects below describe an active, newly posted entry. A zero in the result column means the event has no effect on reported income less expenses.

| Event | Selected account | Operating result | Where to verify |
| --- | ---: | ---: | --- |
| Operating receipt, `income` | +A | +A | Baseline SQL, `private.ledger_transaction_delta` and `view_daily_summary`. Optional category, if supplied, must match income kind. |
| Operating payment, `expense` | −A | −A | Same functions, expense category kind. A positive stored magnitude represents an outflow. |
| Owner contribution, `capital_in` | +A | 0 | `check_transaction_category_match` clears the category. Summary reports it separately. |
| Owner drawing, `withdrawal` | −A | 0 | Same trigger. A cash withdrawal from bank into shop cash is a transfer if the money stays with the business. |
| Balance adjustment, `adjustment` | +A in or −A out | 0 | `chk_adjustment_requires_note` and draft counterpart require direction and a nonblank note. Preserve direction in individual records and exports. |
| Account opening | Starting amount | 0 | `LedgerService.createPaymentAccount` accepts zero or positive amounts. `private.record_account_opening_balance` records a movement for a positive opening. Zero needs no movement. Migration cutover has separate rules. |
| Internal transfer | −A source, +A destination | 0 | `private.protect_account_transfer`, `private.post_account_transfer`. Two distinct accounts, amount positive, active accounts in the shop at posting. One parent transfer, two signed movements. |
| Historical `investment` | +A under SQL | No dedicated summary bucket | Baseline `ledger_transaction_delta` and enum versus `src/types/ledger.ts`. Classification and occurrence require review, A16. |

**Operating result** = active income − active expenses in the selected business dates and filters. The SQL views apply the active filter. `src/lib/reportAnalytics.ts` assumes its caller supplies the appropriate rows. `LedgerReportsView.loadReport` requests active records. A type- or category-filtered result describes that selection. It cannot establish whole-shop profit. Purchases on credit, unpaid invoices, inventory consumption, depreciation and tax accruals have no corresponding calculation in this cashbook.

**Account reconciliation** for post-cutover movements starts with the opening movement and adds each signed movement exactly once, including reversals. If the opening is already in the movement sum, adding it again doubles it. `balance_after_paisa` is the stored balance after a posting was applied. Backdated business activity can be entered later, so this value need not be the closing balance of its business date. Transfers sum to zero across both accounts. Current active-account balances in Overview are a different measure from movement over the selected period.

**Historical boundary.** Baseline SQL backfills an account on older transactions, leaves their `account_posted` flag false, and seeds opening movements from pre-existing balances. The post-update trigger deliberately skips such records. Summing every historical transaction on top of those opening balances can double-count history. The audit did not establish which deployed accounts have this history.

## Lifecycle and controls

| Stage | Current contract and boundary |
| --- | --- |
| Interpret | `src/parser/normalizer.ts` extracts dates/amounts. `classifier.ts` uses category kind, sign, owner-action terms, an unusual-amount threshold and a roughly three-minute duplicate heuristic. A repeated real sale remains possible. The duplicate warning and a durable retry key solve different problems. |
| Review | `ConfirmationModal.toParseResult` checks a real ISO calendar date at or before shop today, a positive two-place amount, category compatibility and adjustment reason/direction. Cashbook batches retain failed entries for retry. The paper-register importer implements different checks (A08). |
| Save and post | `createTransactionDraft` persists a local draft before attempting cloud sync. SQL `post_transaction_draft` locks the shop's draft, validates the active account, resolves the in-shop category, creates the transaction, then deletes the draft. Missing category can resolve to null. Each transaction has a unique idempotency key and a required account. A confirmed draft can survive locally with a pending account. See A02 for the exceptional path. |
| Date and currency | `getKarachiBusinessDate` uses configured shop timezone with Asia/Karachi fallback. `business_date` is an accounting date. `device_entry_time` and server timestamps are instants. The SQL insert trigger rejects future transaction dates. The transfer insert trigger sets the server's current shop date. Currency changes are guarded after transactions or movements exist. Region UI is currently feature-gated. |
| Overdraft | The later baseline definition of `apply_account_delta` checks shop and active account and allows a negative balance. This supports recording a real late expense. Whether a cash drawer should warn or refuse differs from whether a bank can overdraw. |
| Amend | `LedgerService.editTransaction` allows amount, note or category updates for an active record. Owner/manager correction paths require a matching cloud session and last-seen `updated_at`. The movement trigger reverses the old economic effect and applies the new one when financial fields change. A note-only update creates an audit event without a new money movement. |
| Void and restore | An active entry can be voided with a nonblank reason. SQL supplies actor/time. A void retains the row, removes it from active totals and reverses a previously posted account effect. Restore returns the record to active, clears current void fields and reapplies that effect. Audit snapshots retain earlier states. Reversals use the original business date. The normal UI operates on transactions. SQL contains separate transfer reversal logic. |
| Read and export | SQL daily/monthly views separate operating flows, owner movements and adjustments. Period charts aggregate operating receipts/payments. The explorer can include voided history. The workbook is built from filtered active records. Ordinary offline reads, archived-account lookups and Settings export have known completeness limits (A05, A11). |
| Recover | An instruction saved on one device, a synchronized posting and a validated backup are different states. Reconciliation must preserve shop, actor, amount, account, date, direction and intent key. A checksum alone cannot establish that every related table/operation was captured. |

### Worked acceptance example

Use one shop, one business day, Cash opening **200.00**, Bank opening **0.00**, and two-decimal currency. The following inputs can be used as a common fixture for SQL, the service, Overview, Reports and export.

| Step | Cash | Bank | Cumulative operating result |
| --- | ---: | ---: | ---: |
| Opening | 200.00 | 0.00 | 0.00 |
| Receive operating income 100.50 in Cash | 300.50 | 0.00 | 100.50 |
| Pay expense 32.25 from Cash | 268.25 | 0.00 | 68.25 |
| Owner contributes 500.00 to Cash | 768.25 | 0.00 | 68.25 |
| Owner takes 12.00 from Cash for personal use | 756.25 | 0.00 | 68.25 |
| Cash adjustments +0.55 and −0.30, with separate reasons | 756.50 | 0.00 | 68.25 |
| Transfer 100.00 from Cash to Bank | **656.50** | **100.00** | **68.25** |

The six active cashbook entries give 6,825 minor units of operating result. The account opening and the transfer are outside that six-entry count. Net movement across the business is 556.50 and combined closing funds are 756.50. Voiding the expense raises Cash to 688.75 and the result to 100.50. Restoring it returns both figures to the bold values. Replaying the same confirmed receipt should leave every value and the count unchanged. Only the TypeScript operating totals and trend were executed during this audit. The balance, void and restore values are hand-calculated acceptance expectations.

## Owner decision register

| ID | Decision for the owner | Why the answer changes implementation |
| --- | --- | --- |
| B1 | Is the default headline “Income less expenses”, “Cash-basis operating result”, or “Net profit” with an explicit basis? Which receipts and payments count, including materials, loan principal, refunds, reimbursements and taxes collected? | Current classifications supply all profit inputs. Agree worked examples, including a refund for a prior period, before changing signs, labels or adding types. Keep unapproved items available for review. |
| B2 | Do contribution and drawings exclusively mean money moving between owner and shop? Does any existing `investment` mean the same as contribution, a loan, or something else? | Inspect historical **counts and provenance** under separate authorization. Preserve the original value until reviewed. A cash-to-bank transfer must never become a personal drawing. |
| B3 | Who may post owner movements, adjustments and shared drafts, see financial reports and LedgerMate, archive accounts, and correct or restore entries? Can a user belong to multiple shops? | `permissions.ts` names a report permission but `App.MainShell` renders Reports by view and base transaction reads are member-scoped. The SQL hardening helper chooses the first active shop by ID. Define shop selection, report confidentiality and whether recorder and poster must both be retained. |
| B4 | Should negative cash or wallet balances be blocked, warned about, or allowed like bank overdrafts? What happens when reversing history on an archived account? | Determines posting and reversal checks, allowable openings, archive/reactivation controls and treatment of pre-cutover entries. |
| B5 | Which business date governs delayed transfers, reversals, refunds and late corrections? Is there a backdating limit or review step? | Current transactions retain selected dates, transfers use insert day, and voids restate the original period. Decide how previously issued reports should reflect later changes. |
| B6 | Which screens can show provisional totals? Can a user export them, and how should a shop recover a legacy item whose owner or account cannot be proven? | Determines pending/failed visibility, official export completeness, shared-device scope and whether recovery needs a manual attribution workflow. |
| B7 | Is PKR the only supported launch currency? Should receipts, confirmations and reports always show fractional units when present? What maximum entry and aggregate are supported? | Aligns display with storage, prevents mixed labels and supplies precision and range tests. No indication that currency conversion is required. |
| B8 | Which local-only profiles, retail expenses, old device backups and desktop workflows need ongoing support? How should historical Quick Expense records be reconciled? | Determines compatibility adapters and manual review. Matching amount/date alone cannot identify duplicate purchases. |
| B9 | What data may be lost between backups, how soon must a shop be restored, and are preferences and private AI chat included? May notes and recent financial context be sent to the model provider, and for how long should history be kept? | Determines recovery scope, frequency, restoration drill, retention and disclosure. The repository's backup workflow is on demand. |
| B10 | Does a paper-register category column describe a real category or free-text detail? How should a user resume the same import versus intentionally importing identical rows? | Determines preview mapping, duplicate-intent boundaries and row-level retry receipts. |

Until these decisions are approved, preserve stored enum values, effective dates, pending records and historical classifications. The approved examples should become the acceptance criteria for the corresponding task in [REFACTOR_PLAN.md](REFACTOR_PLAN.md).
