# Shop Pro domain glossary

Use the **working term** in requirements and test names. Existing SQL names, JSON keys and IndexedDB formats are cited so a developer can trace historical data. Wording changes that affect interpretation of money require the owner's decisions in [BUSINESS_RULES.md](BUSINESS_RULES.md).

## The small-business model

A **shop** has members and payment accounts. A **cashbook entry** records one classified receipt or payment against one account. A **transfer** moves funds between two accounts. Both can produce **account movements**. Operating reports use cashbook entries. Account reconciliation uses movements. Keeping these two record sets distinct prevents counting a transfer as income, counting an opening twice, or treating a reversal as fresh turnover.

| Working term | Current representation | Meaning and proposed usage |
| --- | --- | --- |
| Shop | `organizations.id`, `organization_id`, sometimes “tenant”, “business” | Scope for accounts, postings and reports. Use “shop” in the interface. Pass an explicit shop ID across persistence boundaries. |
| Shop membership | `organization_members`, `shop_members`, `profiles` | The first holds a user/shop role and active flag. The latter two also contain overlapping identity/role information. Hardening names membership as the authority. Identify mirrors explicitly. A profile name is display data. |
| Payment account | `payment_accounts`, `LedgerAccount`, legacy `PaymentAccount` | A place where shop money is held, such as the cash drawer, bank or wallet. “Account” also means sign-in identity elsewhere. Prefer “payment account” in financial code and “user account” in authentication. |
| Opening balance | `opening_balance`, `OPENING_BALANCE` movement | Amount held at setup or cutover. It contributes to available funds once and has no operating result. Distinguish an opening amount from owner capital received during a reporting period. |
| Current account balance | `balance_paisa`, legacy `current_balance` | Current amount after postings. The former stores minor units and the latter major units. Name the unit at conversion boundaries. Label a historical dashboard's current balance explicitly. |
| Cashbook entry | `public.transactions`, `src/types/ledger.ts: Transaction` | A posted source record with positive magnitude, classification, account and business date. Prefer `CashbookEntry` in new app interfaces. “Transaction” also names a DB atomic operation, a sale and a signed movement in older code. |
| Draft / pending posting | `transaction_drafts`, `TransactionDraft`, `pending_account_id` | A draft has no posted effect. Pending posting means the account has been selected locally and cloud confirmation is outstanding. “Saved” should specify which of these the operator achieved. |
| Pending operation | `QueuedTransaction`, `OfflineAccountOperation`, draft with pending account | Durable intent to post or change something. Track queued, needs sign-in, needs correction and confirmed outcomes separately. `active` describes a posted entry's economic status. |
| Posting key | `idempotency_key`, `idempotencyKey` | Stable identity of one user instruction across attempts. Distinct purchases can have equal amounts, dates and words. Preserve those distinct keys. |
| Operating income / expense | `income`, `expense`; separate legacy `sales`, `expenses` | Money received from business activity or paid for an operating cost under the agreed basis. “Sales” is too narrow for all cashbook receipts. A retail expense row currently follows a different path. |
| Operating result | `net_profit_paisa`, “NET PROFIT” | Income less expenses for active entries matching the filter. Include the basis and period in exported reports. Owner to approve the user-facing term. |
| Owner contribution | `capital_in`, posting label `CAPITAL` | Owner money introduced to the shop. This entry records a flow. It does not measure total owner equity. |
| Owner drawing | `withdrawal`, `WITHDRAWAL` | Money taken out of the business for personal use. Label “Owner drawing” where an operator might interpret “Withdrawal” as bank-to-cash. |
| Balance adjustment | `adjustment`, `adjustment_dir`, `ADJUSTMENT` | Reasoned increase or decrease to the selected account, excluded from operating result. The amount is meaningful only together with direction. Avoid treating every unknown payment as an adjustment. |
| Internal transfer | `account_transfers`, `TRANSFER_OUT`, `TRANSFER_IN` | One event, two opposite movements, zero shop-wide change. Call it an “account transfer” in the user workflow. Reserve “payment” for money crossing the shop boundary. |
| Account movement | `account_ledger_entries`, `AccountLedgerEntry`; older `account_transactions` | Signed posting effect on one payment account. A cashbook entry can have several movements after corrections. Use source transaction/transfer IDs to trace an effect. Legacy `account_transactions` uses a different schema and units. |
| Reversal / void / restore | `REVERSAL` movement, `transactions.status`, `void_reason`, `audit_log` | Void changes economic status, reversal offsets a previous movement, restore reinstates an entry. A note edit can have audit history and no reversal. “Delete” is misleading for a void. |
| Category / alias | `categories.kind`, `category_aliases`, legacy `categories.type` | Modern categories classify income or expense. Aliases are parser vocabulary. Retail “product/service/both” is another classification on the historical schema. `category_name` can be a lookup/display label rather than a persisted classification. |
| Business date / device time / posting time | `business_date`, `device_entry_time`, `created_at` | Effective shop calendar day, device capture instant, server insertion time. Label each where used. Rename the regional `getKarachiBusinessDate` concept to `getShopBusinessDate` while preserving fallback behavior and callers. |
| Minor-unit amount | `amount_paisa`, `amountPaisa`, `amount`, `current_balance` | A paisa is the PKR minor unit. `transactions.amount_paisa` is unsigned in meaning and positive. `account_ledger_entries.amount_paisa` is signed. Transfers use decimal major units on the SQL wire. Prefer `amountMinor` versus `deltaMinor` internally and explicit mapping for major-unit fields. |
| Activity history / audit history | `audit_log`, legacy `audit_logs`, account movements | Modern audit rows capture transaction update snapshots and actor. Initial creation has attribution on the transaction and its movement. The baseline trigger is BEFORE UPDATE although `AuditLogEntry.action` also permits “create”. Identify which history a screen or backup contains. |

## Names that can cause the wrong change

| Current name and location | Proposed interpretation |
| --- | --- |
| `sales` in `src/App.tsx`, `src/components/sales/TransactionsExplorerView.tsx` | **Transaction register**. This screen contains all cashbook transaction types. Preserve persisted view IDs or provide a compatibility mapping when renaming. |
| “Cash flow over time” / “CASH FLOW TREND”, `LedgerReportsView.tsx`, `buildReportsWorkbook.ts` | **Income and expenses over time** describes the plotted series. “Net account movement” would also require owner flows and adjustments. |
| `VOID_EXPENSE` used by `LedgerService.editTransaction`, `voidTransaction`, `restoreTransaction` | **Correct cashbook entry** is closer to the capability exercised. Confirm the role matrix before introducing narrower permission names. |
| “Investment” in baseline SQL | Legally stored historical type with positive account effect. Keep the raw classification until B2 is decided. |
| “Cash In Hand” in `buildReportsWorkbook` and `TransactionReceiptDetails.tsx` | A specific account label. If lookup fails, preserve the ID and show “Unknown account” until resolved. |
| “Full dump”, local recovery bundle, cloud backup | Name the artifact by coverage: transaction export, device recovery bundle or cloud archive. List pending operations, auth dependencies and excluded private data as applicable. |
| `isUnavailableOrUnauthorized`, `ledgerService.ts` | Currently includes network, authorization, constraint and schema errors. Introduce outcome names that tell the operator whether to reconnect, sign in, correct the entry or contact support. |
| `isQueuedOffline` versus a bare boolean | Prefer a named posting outcome at service boundaries. In Accounts a true return from `transferBetweenAccounts` means queued. A successful promise alone says nothing about bank or cash balances. |

## Compatibility boundary

`src/types/index.ts` and `src/services/contracts.ts` still model products, stock, customers, invoices, split tenders, cost of goods sold and daily closings. `StorageEngine.createSaleTransaction` computes retail gross profit from the discounted sale total less tax and item costs. `getDailyClosingSummary` reconciles opening cash, cash sales, capital, expenses, withdrawals, purchases and transfers. Those rules draw on retail tables and major-unit values. The modern cashbook has no inventory valuation or automatic accounts-receivable settlement. Importing retail profit, customer collections or closings wholesale into the cashbook would require an explicit mapping of each economic event.

Start with TypeScript interfaces and user-facing labels at the boundary. A database table rename, enum rewrite, queue migration or reinterpretation of old rows is a separate change with its own compatibility and reconciliation requirements. See [REFACTOR_PLAN.md](REFACTOR_PLAN.md).
