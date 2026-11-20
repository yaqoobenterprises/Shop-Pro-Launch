# Customer Receipt → AR contract (Issue #60)

Backend stack: #44 → #53 → #59 → this Draft PR. No UI, production schema, existing-company enrollment, writer activation, legacy cashbook operation or balance changes are authorized here. The migration seeds **no receipt policies and no enabled companies**. Synthetic fixtures alone configure writers. This is a controlled-cash MVP; deployment/release is not approved.

## Evidence and accounting scope

There is no verified bank feed or statement reconciliation. Bank deposits, FX, refunds, credits, unapplied cash, tax, inventory and offline posting are rejected/unsupported. The evidence method is `dual_control_cash_attestation`: a server-numbered cash collection claim by an active OWNER/MANAGER and a **different active OWNER** explicitly attesting an exact in-person cash count. It is a manual operational control, not independent proof of physical custody, a bank statement, or detection of collusion. An organization must approve the cash-handling process, mapping and evidence limits before release.

`private.aqvora_receipt_policies` is trusted administrative configuration: inactive by default, company/currency/date bounds, physical cash asset/debit/control=`cash`, AR asset/debit/control=`receivable`, revision, approver and evidence. There is deliberately no public policy/activation RPC. Cash creation/confirmation, receipt submit/approve/post require the active customer, valid policy, active posting accounts and open fiscal period. Posting additionally requires explicit company enrollment. No browser account ID, `verified` flag or free-form bank reference can override these checks.

A confirmed instrument is immutable and company/customer/currency/date/amount bound. Only its original maker may create a receipt draft. It may have one live receipt, with **1–99 distinct issued verified service invoices**, sorted by invoice UUID. All invoices must belong to the same company/customer/currency, use the trusted AR mapping, and predate or equal the cash business date. Its entire amount must equal allocation sum. Partial payment means partial settlement of an invoice; splitting a single instrument into multiple posted receipts is unavailable. Cancelling an unposted receipt frees that instrument for a replacement draft. Confirmed cash itself cannot be edited/cancelled/refunded.

Posting atomically creates `Dr Cash = instrument amount` and one `Cr AR = allocation amount` per invoice. It never posts revenue/tax again or mutates the invoice. Each credit has customer `party_id` and invoice `open_item_id`; all lines have null stock movement. Receipt, allocations, journal, generic posting receipt, source posting response, sequence and audit are one PostgreSQL transaction. There is no balancing plug. Money is positive canonical JSON **strings** (`"1"` = one minor unit), bounded by `9223372036854775807` per instrument/line/invoice. JSON numbers, decimals, signs, zero and leading zeroes are rejected. Sums use PostgreSQL `numeric`; wire aggregates remain strings beyond BIGINT. Revisions/counters/audit IDs are also strings; line/page sizes are numbers. Never convert money to JavaScript `Number`.

Unconfirmed and confirmed-but-unposted collections are exposed by source reads but excluded from posted-V2 books. Approval does not reserve an invoice balance. The workflow therefore does not claim all economic cash has been recorded; pending cash must be resolved operationally and blocks customer archival. A confirmed collection that cannot be allocated requires a separately approved refund/unapplied-cash workflow; this release cannot resolve that case.

## Authorization and state

Every public RPC requires a Supabase AAL2 JWT, matching **live `auth.sessions`** entry for `auth.uid()`, and canonical active membership. Caller-supplied company IDs are authorization inputs, never inferred authorization. JWT metadata/profiles do not grant roles. No new business role is invented.

| Operation | Allowed actor |
| --- | --- |
| Create cash claim | OWNER/MANAGER |
| Confirm counted cash | Distinct OWNER, literal `cash_counted_in_person`, counted amount exactly matches |
| Cancel unconfirmed claim | Maker or OWNER, reason required |
| Create/edit/submit receipt | Original collection/receipt maker, OWNER/MANAGER |
| Approve submitted receipt | Distinct OWNER |
| Reject submitted receipt | OWNER, reason required; returns draft |
| Cancel unposted receipt | OWNER/MANAGER, reason required |
| Post approved receipt | OWNER/MANAGER, checker and cash counter still active OWNER |
| Read source, balances, history | OWNER/MANAGER (including archived customer history) |
| Direct table/helper access | No PUBLIC/anon/authenticated privileges |

Receipt lifecycle: `draft → submitted → approved → posted`; rejection returns `draft`; cancellation is terminal before posting. Confirmed cash, posted/cancelled receipts, allocations, issue responses and audit have immutable update/delete triggers. Generic journal reversal of invoices or receipts is blocked. Private policy and all new tables have RLS enabled, restricted grants and fixed function `search_path`. Current membership, matching session, company, policy, customer, accounts, period, source receipt and invoices are row locked during writes. The same invoice rows are locked in ascending UUID order for all receipt writers; cumulative posted allocations are rechecked **after** lock acquisition. No concurrent receipt can exceed invoice face. A committed posting holds shared authorization/configuration/period locks until commit, serializing revocation/closure with the financial effect.

## RPC signatures

PostgREST uses `POST /rest/v1/rpc/<name>` and **named JSON arguments exactly below**. Bearer is the user JWT, not service role. Every signature begins with `p_organization_id uuid`. Defaults may be omitted.

| Function | Remaining named arguments | Result |
| --- | --- | --- |
| `create_aqvora_cash_collection` | `p_intent_key text, p_customer_id uuid, p_business_date date, p_currency text, p_amount_minor jsonb, p_source_kind text` | CashCollection |
| `confirm_aqvora_cash_collection` | `p_collection_id uuid, p_expected_revision bigint, p_counted_minor jsonb, p_attestation text` | CashCollection |
| `cancel_aqvora_cash_collection` | `p_collection_id uuid, p_expected_revision bigint, p_reason text` | CashCollection |
| `get_aqvora_cash_collection` | `p_collection_id uuid` | CashCollection + posted_receipt_id |
| `list_aqvora_cash_collections` | `p_after_id uuid=null, p_limit integer=100` | CashCollection[] |
| `create_aqvora_customer_receipt_draft` | `p_intent_key text, p_collection_id uuid, p_allocations jsonb` | CustomerReceipt |
| `edit_aqvora_customer_receipt_draft` | `p_receipt_id uuid, p_expected_revision bigint, p_allocations jsonb` | CustomerReceipt |
| `transition_aqvora_customer_receipt` | `p_receipt_id uuid, p_expected_revision bigint, p_action text, p_reason text=null` | CustomerReceipt |
| `post_aqvora_customer_receipt` | `p_receipt_id uuid, p_expected_revision bigint, p_fingerprint text, p_intent_key text` | CustomerReceiptIssue |
| `get_aqvora_customer_receipt` | `p_receipt_id uuid` | CustomerReceipt + issue/reconciliation if posted |
| `lookup_aqvora_customer_receipt_issue` | `p_intent_key text` | durable CustomerReceiptIssue or null |
| `list_aqvora_customer_receipts` | `p_after_id uuid=null, p_limit integer=100` | CustomerReceipt[] |
| `list_aqvora_receipt_audit` | `p_entity_type text, p_entity_id uuid, p_after_id bigint=0, p_limit integer=100` | audit events[] |
| `get_aqvora_invoice_open_balance` | `p_invoice_id uuid, p_as_of_date date` | InvoiceOpenBalance |
| `list_aqvora_open_invoices` | `p_customer_id uuid, p_currency text, p_as_of_date date, p_after_id uuid=null, p_limit integer=100, p_snapshot_token text=null` | OpenInvoicePage |
| `read_aqvora_receivables` | `p_currency text, p_as_of_date date, p_customer_id uuid=null` | ReceivablesReconciliation |

Wire interfaces: [`receiptContracts.ts`](../src/accounting/receiptContracts.ts). Input allocations contain **only** `{ "invoice_id": "uuid", "amount_minor": "40" }`. Server derives issued invoice revision/hash, collection identity, dates, currency, amount, mappings, UUID allocation IDs and journal references. Revision/fingerprint comes from the current approved receipt response, not a client calculation.

Example partial allocation request (using real IDs from prior RPC responses):

```json
{
  "p_organization_id": "<company uuid>",
  "p_intent_key": "<stable creation intent>",
  "p_collection_id": "<confirmed CC source uuid>",
  "p_allocations": [{"invoice_id":"<issued invoice uuid>","amount_minor":"40"}]
}
```

Durable issue result includes `receipt_id`, `collection_id`, `source_ref` (`CC-n`), `receipt_number` (`CR-n`), `journal_id`, server journal intent, company/customer/date/currency, amount, source/posted revision, fingerprint, poster/time and allocation references (`allocation_id`, `invoice_id`, exact amount, journal/line). `reconciliation` on posted detail explicitly reports `bank_verified:false` and evidence method.

## Retry, pagination and errors

Creation and posting intents are trimmed nonempty strings of at most 100 characters, unique per company in their respective operation namespace. Exact cash/receipt creation retries return the current source, without reserving another number. Posting retries bind receipt ID, **approved** revision/hash and actor: identical request returns the identical immutable durable result, even after period close, enrollment disablement or policy change. Caller must still have current AAL2/live session/OWNER-or-MANAGER access. Different actor/payload fails; a second posting intent for a posted receipt fails. A collision between different receipts rolls back all effects including receipt number. Receipt sequence is transactional; audit identity IDs may have gaps after rollback. Never assume a network timeout means failure: look up the original issue intent and replay that same posting request. Do not change intent to retry an unknown outcome.

Revisions protect edits/transitions by compare-and-swap. Confirm/transition operations are not silently replayed: after a lost response, fetch source and inspect revision/audit. They cannot duplicate a financial journal.

Source lists use ascending UUID keyset pagination (1–200), returning arrays; use the last ID for continuation and stop on a short/empty page. They are live workflow views; concurrent additions/state changes can change later pages. Audit uses ascending event ID with the same bounds. Open invoice list requires its returned `source.snapshot_token` on continuation with the same company/customer/currency/as-of and `p_after_id`; journal/source change rejects it and requires restart. `matched_count` is the full open-invoice count; `has_more` controls continuation; `next_after_id` is last returned ID even on a terminal nonempty page. These are restart-on-change snapshots, not a long-held database transaction. One RPC executes within one PostgreSQL statement snapshot. No UI cached balance is an authorization/allocation authority.

SQLSTATE: `42501` inherited authorization failure; `22023` invalid explicit invoice cutoff (other input/workflow errors use `P0001`); `23505` competing unique instrument/intent/number; `23514` inconsistent certified source/reconciliation; `40001` inherited read snapshot changed. Invalid PostgreSQL dates/UUIDs/types may return native `22xxx`; do not parse message text as a stable machine code. Surface conflict/authorization safely, reload authoritative state on stale/conflict, and never auto-create a new intent on financial uncertainty. Certification failures require investigation and block financial reads/posting.

## As-of and source completeness

`face_minor = allocated_minor + outstanding_minor`; allocations include posted receipts with **business_date <= as-of**, and receipt date must be >= invoice date. Dates are plain company business dates, valid AD 0001–9999. Cash cannot be future dated relative to organization timezone/server clock. This is business-date accounting, not a bitemporal “what did we know then” audit: a subsequently posted backdated receipt changes that historical business-date result. Future corrupt sources can conservatively fail an invoice point read. Cutoff before invoice creation is rejected. `all_posted_allocated_minor` is separately exposed for all current posted dates and used to prevent over-allocation. No aging buckets, historical due-date amendments or FX are implemented (`aging_supported:false`).

Invoice point reads verify the issued source and every linked receipt, allocations, source issue response, journal lines and contiguous immutable audit. An independent indexed receipt-source lookup detects missing allocation rows, even if a balanced journal remains. Company/customer reconciliation compares outstanding to certified receivable control net. GL/TB certification validates receipt source kind/UUID/revision/hash and rejects missing/tampered sources, allocations, audit or arbitrary AR postings. GL rows expose `source_kind:"customer_receipt"`; the original invoice journal remains `sales_invoice`. Invoice detail retains original face/AR debit/revenue credit and now adds allocated/outstanding with `settlements_supported:true`, basis `v2_posted_receipt_allocations` (supersedes #59's unsettled-only fields).

Completeness is **only within certified posted V2 sources** (`legacy_included:false`, `opening_migration_verified:false`). It is not a migrated company balance, legacy cashbook, independent cash/bank reconciliation or aging claim. Source numbering/fingerprints/audit are tamper evidence under database controls, not a defense against an unrestricted DBA rewriting all records.

## Migration and verification

Apply only after all #59 migrations, in order: `20261120172141` schema; `172144` primitives; `172146` cash collections; `172149` drafts; `172152` posting; `172155` certification; `172158` balances; `172200` reads (full filenames in `supabase/migrations`). Each runs transactionally. No history amount/payload update occurs. The first migration replaces the invoice-only journal FK with typed generated invoice/receipt source columns and composite FKs; **STORED generated columns can rewrite/lock the journal table**, so eventual deployment needs a measured staging maintenance/rollback plan. Old GL/TB tokens must restart across schema change. The PR tests a populated #59 upgrade and fresh/deployed migration orders; an injected failed upgrade rolls back; pg_dump/pg_restore preserves source/intent/allocation IDs, numbering and closed-period replay.

Posting uses company-leading source/allocation/currency indexes and ordered invoice locks; the invoice-source JSON containment index covers missing allocation evidence. Currency drift uses two indexed ranges, avoiding a scan of every same-currency journal. Posting validates only touched invoice histories, not the whole company's history. Current certified GL/TB, open-invoice enumeration and AR reports still verify their company cutoff and can be expensive on large histories; they are not precomputed reporting snapshots. A 120-invoice/receipt PG probe records posting timings and actual query plans; temporary copies with 50,000 additional synthetic records verify unforced allocation and JSON-source index plans without polluting certified history. This is regression evidence, not a production throughput/SLA claim. The company receipt counter serializes numbering and can limit write throughput.

Automated suites: receipt workflow, security/corruption, empty/pagination reads; independent PG17 concurrency and populated upgrade; real local Supabase Auth/MFA/PostgREST; full migration order and physical restore. Existing application/accounting tests remain required. CI starts only disposable local services with synthetic identities/configuration. New migrations install no companies/policies; no production credentials are used. Release gates remain independent bank evidence (if required), pending-cash exceptions/refunds, approved company opening migration/certification and staging capacity/operational review.
