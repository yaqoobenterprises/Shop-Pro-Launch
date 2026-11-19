# Shop Pro V2 product blueprint

**Decision proposal · 19 November 2026 · application revision `4f730eb`.** Build a small-business accounting workspace around one shop-scoped posting engine. An operator can describe a payment in their own words. A bookkeeper can enter the same payment as a journal voucher. Both see the same preview, post the same journal and open the same receipt. Keep the cashbook available throughout the transition.

| Design document | What the implementation team should take from it |
| --- | --- |
| [Module requirements](MODULE_REQUIREMENTS.md) | Screens, commands, operational journeys, permissions and module acceptance tests |
| [Accounting architecture](ACCOUNTING_ARCHITECTURE.md) | Chart, balanced posting contract, statements, reconciliation and historical boundary |
| [UX design system](UX_DESIGN_SYSTEM.md) | Page composition, interaction, responsive behavior, language, accessibility and verification |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md) | Dependencies, owner decisions, evidence gates, pilot and recovery |

## Where the product starts

| Evidence at the reviewed revision | Product consequence |
| --- | --- |
| `src/App.tsx`, `MainShell`, selects Cashbook/Entries, LedgerMate, Overview, transaction explorer, Reports, Accounts and Settings. The view key `sales` opens `TransactionsExplorerView`. `DESIGN.md` and `src/index.css` define a navy and emerald workspace, Inter, RTL handling and mobile navigation. | Preserve familiar entry points, bookmarks, saved preferences and keyboard workflows. Introduce Sales as its own document workspace. |
| `src/parser/classifier.ts`, `src/services/ledgerService.ts` and `src/types/ledger.ts` implement classification, drafts, posting and cashbook types. `src/config/features.ts` has `entryModes` and `languageUr` disabled at this revision. | Smart entry has a starting vocabulary. Professional vouchers, end-to-end language support and a journal engine require new implementation and testing. |
| The launch baseline at `supabase/migrations/20261016094952_shop_pro_launch_baseline.sql` contains legacy retail objects and the active cashbook tables, views and movement triggers. `private.post_ledger_transaction` and `public.post_transaction_draft` govern distinct steps. | An existing table named `sales` or `stock_movements` is insufficient evidence of a working invoice, payable or audited stock valuation. Verify effective definitions and data provenance before reusing it. |
| `src/services/offlineQueue.ts`, `localRecoveryBundle.ts` and `storageEngine.ts` serve different local paths. The Phase 01 audit found a reachable Quick Expense path separate from the authoritative cashbook. | Give shortcuts, imports and reconnect a common posting contract. Inventory existing local-only records before switching a shop. |
| Phase 01 `docs/CORE_AUDIT.md`, `BUSINESS_RULES.md`, `DOMAIN_GLOSSARY.md` and `REFACTOR_PLAN.md`, followed by `docs/PHASE_02_BASELINE.md` and `tests/cashbook_regression.test.ts` on the audit worktree. The audit artifacts are uncommitted there. | Carry the audit evidence forward through a separate reviewed integration. The baseline completed all seven checks. The expanded suite recorded 323 passes and one verified expected failure in 53 files. A lost acknowledgement can produce two receipts of 100.50. A01 deployment parity remains open. Neither result measures live exposure. |

## Who uses it and what ships

The owner needs cash on hand, obligations, and a clear explanation of changes in earnings. A counter operator needs quick bilingual entry and a receipt they can find after reconnecting. A bookkeeper needs evidence, multi-line vouchers, reconciliations, period controls and statements. A reviewer needs access to the underlying documents and history within the permissions the owner grants.

| Product increment | Deliverable visible to the shop | Release condition |
| --- | --- | --- |
| Accounting minimum, one approved base currency | Workspace, both entry modes, receipts/payments/transfers, Chart of Accounts, general journal, general ledger, cash/bank reconciliation, trial balance, income statement and balance sheet. Legacy periods have an explicit reporting basis. LedgerMate initially locates and explains verified records. | One pilot shop reconciles its cutover, both modes pass the same fixture, and a lost reply produces one receipt. Users can operate when the model is unavailable. |
| Trade bookkeeping | Customers and vendors, service invoices and bills, partial settlements, credits, aging and statements. | Receivables and payables reconcile to their control accounts on every tested date. |
| Stock and management reporting | Stock items, receipts, issues, returns and counts, valuation, cost of goods sold, cash flow and comparisons. Extend LedgerMate as each trusted reader ships. | Opening valuation and recognition policy signed off. Stock value and cash-flow change tie to the ledger. |
| Later, on evidence of demand | Recurring drafts, bank-feed connectors, forecasts and additional currencies. | A separate business case, policy and reconciliation test for each. Keep payroll, manufacturing, procurement approvals and ERP-wide orchestration outside these releases. |

## Information architecture

Desktop navigation groups the following destinations. On phones, pin Home, Entries, New, Books and More. New opens the same composer found on desktop. More contains Trade, Stock, Reports, LedgerMate and Settings according to access. Page links carry selected shop, date, filter and return destination. Opening a private or expired link repeats the permission check.

| Area | Destinations and primary journey |
| --- | --- |
| Home | Overview → selected movement or exception → source receipt. Today’s operating activity has its own section beside balances **as of** a timestamp. |
| Entries | Smart entry / Journal voucher → review → posting receipt. Register and Drafts & Sync show past work and recoverable items. Search by voucher, amount, date, counterparty or original cashbook reference. |
| Books | Cash & bank → account activity or statement matching. Chart of Accounts → general ledger account. General journal → voucher detail → source and reversals. Periods → checks and close review. |
| Trade | Sales → invoices, receipts, credit notes and customer statements. Purchases → bills, payments, vendor credits and statements. Contacts → customers and vendors. |
| Stock | Items → item card, movement register, valuation. Receive, issue, return and count actions open traced source documents. |
| Reports | Cashbook history, trial balance, income statement, balance sheet, cash flow, aging, stock valuation and management comparisons. A report cell opens its filtered ledger or schedule. |
| LedgerMate | Private conversations, evidence and draft proposals. On-page “Ask LedgerMate” inherits the visible date and object after server authorization. |
| Settings | Shop profile, language/theme, membership and permissions, accounting policies and periods, opening balances, import/export, recovery and audit history. High-impact setup changes open review. |

## Engineering boundaries and vocabulary

Keep the React/Vite client, serverless endpoint and Supabase PostgreSQL as a modular monolith. Organize by accounting, banking, trade, contacts, stock, reporting, identity and assistant. Within a feature, keep screens, typed command/query contracts and domain tests together. Expose narrow shared money, date, identity and receipt types. Keep network/storage adapters at the edge. Use PostgreSQL for the final atomic posting and scope checks. One transaction can update a voucher and its source document without a distributed queue. Add projections or background workers only where measured report latency or export size warrants them.

| Boundary | Owns | Other modules consume |
| --- | --- | --- |
| Accounting and identity | Chart, period, immutable posted journals, membership capabilities and posting receipts | Preview/post/lookup/reverse commands and authorized ledger reads |
| Banking, trade and stock | Statement matches, parties, documents, allocations and physical quantities | Reviewed posting instructions with stable source IDs. Accounting commits linked financial and operational effects together. |
| Reporting | Versioned report definitions, coverage, aggregates and export snapshots | The same result supplies screen, drill-through, export and assistant evidence. |
| Presentation and sync | Editable work, device drafts, routing and durable personal outbox | Server result or explicit pending state. Book balances come from confirmed reads. |
| Assistant | Conversation, tool selection and proposals | Existing authorized application services through a bounded adapter |

Use `CashbookEntry` for a historical receipt/payment, `PaymentAccount` for a cash location, `LedgerAccount` for a chart node and `JournalEntry` for a balanced voucher. Reserve `Invoice` for a customer charge and `Bill` for a vendor charge. Use `Receipt` for incoming money in trade and **posting receipt** for a server acknowledgement. Use `amountMinor` for unsigned magnitude, `deltaMinor` for signed change, `businessDate` for the shop calendar date, and `postedAt` for the committed instant. Store stable IDs across renamed accounts, translated labels and category aliases. Keep legacy JSON and DB names in versioned adapters.

## LedgerMate today

`api/ai-chat.js` verifies a bearer token against Supabase Auth’s user endpoint with a publishable/anon key. Its authenticated GET checks the configured model against Groq’s model catalog. POST sends bounded, redacted client context and chat to Groq’s OpenAI-compatible chat-completions endpoint. `GROQ_API_KEY` is server-side. `GROQ_MODEL` can override the code default `openai/gpt-oss-20b`. The handler checks up to 40,000 context characters, 30 messages and 60,000 aggregate message characters. `streamGroqReply` forwards text deltas. The request defines no application tools and the stream handler has no tool-call dispatcher.

`buildLedgerMateContext` requests cloud reads, computes totals in the client and formats a context string. Its sums convert through JavaScript Number before BigInt. The server authenticates the caller but cannot attest to that client-supplied string. `prepareLedgerMateAction` and `AiAccountantPanel` separately handle selected add/edit/void previews and confirmation. November migrations define private shop/user chat history. `local-ai/server.py` offers a separate loopback Ollama chat bridge without financial tools. These observations verify the implementation and credential placement. Deployed overrides, key validity, effective database policies, account entitlements, provider retention settings and multilingual quality require separately authorized verification.

Groq documents local function calling for the default model, with sequential calls and JSON mode. The application's server executes local tools. Groq documents limitations on combining Structured Outputs with streaming or tool use. Retain Groq for a controlled pilot, use non-streaming tool selection, and validate arguments and outputs in the application. Evaluate a model change only if the configured model fails the fixture, privacy, latency or availability gates. [Groq model card](https://console.groq.com/docs/model/openai/gpt-oss-20b) · [Tool capability matrix](https://console.groq.com/docs/tool-use/overview) · [Local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling) · [Structured Outputs](https://console.groq.com/docs/structured-outputs)

## Proposed LedgerMate contract

1. The page passes an object reference, date range, locale and question. A server handler resolves the session, active membership, selected shop, capabilities and session assurance on each turn and tool call. Search and follow-up authorization use the same reader as the screen. Cached answers and citations are scoped and rechecked on opening.
2. Register typed tools incrementally. `searchEntries` and `readLedgerAccount` retrieve scoped, paged sources. `runReport` and `comparePeriods` return versioned results with exact deltas. `readDocument`, `getPartyStatement`, `getStockPosition` and `listUnmatchedItems` become available with their modules. `proposeDraft` constructs an editable preview for journals, invoices, bills or business records. The tool schema binds actions to allowed document kinds, dates and bounded page sizes. The server supplies shop/actor identity.
3. Each fact has an opaque ID, canonical value, unit, basis, date range, as-of instant, coverage, source IDs and an authorized drill-through. Compute sums, rankings, variances and percentages in domain services. For a zero comparator, return “no comparison base.” Financial answers render from whitelisted fact references and approved explanation templates. Validate every claim, date, direction and referenced comparison before display. Reject unsupported claims and render source results directly when validation fails. A record note, prior answer or retrieved document is untrusted text.
4. A proposed change shows editable fields, suggested account IDs, provenance, ambiguity and accounting impact. A user explicitly saves a business record or submits a reviewed posting through the normal UI with a version-bound confirmation. Recheck permission and policy at commit. No model tool can commit, void, send an invoice, close a period or grant access. Keep confirmation distinct from the chat message “yes.”
5. Bound tool iterations, rows, elapsed time and per-user/shop requests. On denial return a generic access message, on partial coverage show the missing range, on timeout show the last verified result and its timestamp. Never fill missing data with zero. Use the existing structured entry UI and exact report search when cloud AI is unavailable. Persist private history according to owner retention policy. Log tool name, opaque request ID, result status and duration. Minimize data sent to Groq and exclude secrets, raw histories and unnecessary counterparty identifiers from telemetry.
6. Gate enablement on English, Urdu and Roman Urdu fixtures, identical source facts across UI/AI/export, evidence links after role changes, snippets containing instructions, interrupted calls, stale previews and blocked writes. An answer about an unsupported module should name the unavailable capability. A reconciliation suggestion must open the unmatched lines and require a reviewer to accept a match.

**Product acceptance.** On a phone, a counter operator can submit a reviewed receipt in any supported language and retrieve its voucher after reconnecting. On desktop, a bookkeeper can follow that voucher to both ledger lines, reconcile the cash account and reproduce the report amount. Both users see the same posting number, basis, business date and source within their allowed scope.
