# Verified service Sales Invoice → AR API (Issue #57)

Backend branch based only on PR #53 at `6f2a2a36cd4cae69db3fc99382514ff2defb533d`.
This implements persisted operational sources and atomic journal issuance. It is
an isolated Draft implementation, with no production migration, customer enrollment,
writer activation, frontend change or claim of production readiness.

Issue #60 extends this backend with the [customer receipt contract](aqvora-customer-receipt-api.md).
On that stack, issued invoice detail adds allocated/outstanding minor units,
`settlements_supported:true` and basis `v2_posted_receipt_allocations`;
the unsettled-only reconciliation below describes the original #59 contract.

## Supported scope and policy gates

Only service invoices in company base currency are supported. These records do
not deliver inventory or recognize stock/COGS. Every amount is a canonical integer
minor-unit **string**; every quantity is a positive integer string in millionths
(one whole service unit = `1000000`). Unit price is per whole unit. Each line's
gross is `div(quantity * unit_price + 500000, 1000000)` using exact PostgreSQL
NUMERIC integer division, then an explicit minor-unit discount is subtracted.
There is no invoice-level discount, float arithmetic, tax rate, tax amount, FX,
payment, allocation, credit, refund or inferred fiscal closing entry.

Quantity, unit price, line gross and total gross must fit positive signed BIGINT.
Discounts must be canonical nonnegative integers no greater than line gross.
An invoice must have a positive net face value. There are 1–100 service lines.
The server recalculates all amounts and rejects unknown line properties,
including `tax_minor` and stock/item claims. Positive half-minor ties round up
per line; integer division avoids intermediate rounding even at BIGINT maximum.

Submission, approval and issue require a trusted active
`private.aqvora_sales_policies` record covering the business date and currency.
This release supports only **verified out-of-tax-scope service treatment** with
an explicit jurisdiction, evidence and approver. Missing/unsupported jurisdiction
policy blocks, rather than asserting tax is zero. A client or company OWNER cannot
write this policy table or choose AR/revenue/control roles through an RPC.
Only a separately reviewed, founder-approved setup may provision policy/mappings.
No such real policy is supplied by these migrations; tests use synthetic TEST-ONLY
evidence. Review legal/accounting eligibility before any real configuration.

Issuance additionally requires the existing `aqvora_enabled_companies` gate.
Both the trusted policy table and enrollment remain empty after a fresh migration.
This PR provides no enrollment/configuration/activation endpoint. Drafts may be
saved while policy is unknown; they have no financial effect.

## Actors, authorization and isolation

The canonical schema allows OWNER, MANAGER, CASHIER. No proposed Accountant,
Sales, Purchasing or Viewer roles are invented or granted. All RPCs check current
canonical active membership, AAL2 and a live matching `auth.sessions` row.
JWT user metadata has no authorization authority.

| Action | Authorized actor |
| --- | --- |
| Read company customers, invoices, receipts, audit | OWNER / MANAGER |
| Create customer or service draft | OWNER / MANAGER |
| Edit and submit a draft | Its original maker, still OWNER / MANAGER |
| Approve submitted invoice | OWNER distinct from original maker; no self-approval exception |
| Reject submitted invoice to draft, with reason | OWNER |
| Cancel any unissued company invoice, with reason | OWNER / MANAGER |
| Issue approved invoice | OWNER / MANAGER; checker must still be an active OWNER |
| Archive customer, with expected revision and reason | OWNER |
| Credit/reverse/refund an issued invoice | Unavailable and blocked |

Every source and reference has a company composite key. Source tables have RLS
and explicit revocation of direct reads and writes; only guarded RPCs expose
money as strings. `SECURITY DEFINER` functions use empty search paths and explicit
authorization. Private helpers, policies and number counters have no client
execution or table grants. No SQL function dynamically executes client SQL.

## Wire contracts and RPCs

TypeScript wire types are in `src/accounting/salesContracts.ts`. Call through
Supabase `rpc()` or authenticated PostgREST. Send UUIDs, ISO company business
dates, uppercase exact company currency and decimal strings for revisions/money.
Never use Number/parseFloat for financial values or revisions. Dates must be
between 0001-01-01 and 9999-12-31; due date cannot precede business date.

```sql
create_aqvora_customer(p_organization_id uuid,p_code text,p_name text) returns jsonb
archive_aqvora_customer(p_organization_id uuid,p_customer_id uuid,
  p_expected_revision bigint,p_reason text) returns jsonb
list_aqvora_customers(p_organization_id uuid,p_after_code text default null,
  p_limit integer default 100) returns jsonb

create_aqvora_sales_draft(p_organization_id uuid,p_intent_key text,
  p_customer_id uuid,p_business_date date,p_due_date date,p_currency text,
  p_lines jsonb) returns jsonb
edit_aqvora_sales_draft(p_organization_id uuid,p_invoice_id uuid,
  p_expected_revision bigint,p_customer_id uuid,p_business_date date,
  p_due_date date,p_currency text,p_lines jsonb) returns jsonb
transition_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid,
  p_expected_revision bigint,p_action text,p_reason text default null) returns jsonb
issue_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid,
  p_expected_revision bigint,p_fingerprint text,p_intent_key text) returns jsonb

get_aqvora_sales_invoice(p_organization_id uuid,p_invoice_id uuid) returns jsonb
lookup_aqvora_sales_issue(p_organization_id uuid,p_intent_key text) returns jsonb
list_aqvora_sales_invoices(p_organization_id uuid,p_after_id uuid default null,
  p_limit integer default 100) returns jsonb
list_aqvora_sales_audit(p_organization_id uuid,p_invoice_id uuid,
  p_after_id bigint default 0,p_limit integer default 100) returns jsonb
```

List RPCs return arrays of at most 1–200 items. Walk customers in `code COLLATE C`
order using the last code, invoices in UUID order using the last ID, and audit
in event-ID order using the last ID; a short/empty page ends traversal. UUID order
does not imply chronological issue order. List pages are live statement snapshots,
not a complete certified export. For GL/TB use the #53 token/restart protocol.

Customer code is unique case-insensitively within a company, permanently reserved
after archival. Identical create retries by the original creator return the same
customer; conflicting name/case/creator under that code is rejected. Customer
names/identities have no public edit/delete endpoint in this slice. Archival blocks
future submission/approval/issue but preserves issued identity snapshots and reads.

Draft creation intent is 1–100 trimmed characters, unique per company. The exact
normalized original request and actor are retained; equivalent creation retry
returns the current existing source without recreating it. A different request
or actor under that key fails. Full line replacement is maker-only in Draft with
compare-and-swap revision. After an uncertain edit reply, read the source to
resolve its revision; do not retry with an invented new document key.

Lifecycle is `draft → submitted → approved → issued`, with submitted rejection
to Draft and cancellation before issue. Every transition increments revision and
appends before/after audit snapshots. Submission binds server customer/policy
snapshots and a SHA-256 financial fingerprint. Approval rechecks those snapshots,
period, mappings, fingerprint and distinct maker. Approved content cannot be
edited; stale policy/archival requires cancellation and a fresh approved source.

## Issuance transaction and retry contract

One issuance transaction locks actor session/membership, company (shared), source,
current checker membership, enrollment, customer/policy/period and mapped accounts.
Company administration/period close uses the existing exclusive company lock.
Revocation/closure either wins first or waits for a valid in-flight issue.
The issuer must be authorized even when recovering a previously committed intent.
Historic receipt recovery does not require the original period/customer/enrollment
to remain open/active/enabled, and does not reissue money.

The transaction allocates a company-local sequence (`SI-1`, `SI-2`, …), inserts
one immutable journal, two lines, generic posting receipt/audit, an immutable
source issuance receipt, source journal link and final source audit/state. The
number counter participates in the transaction; rollback leaves no partial issue
or consumed number. Company-wide intent uniqueness, source row locks and unique
source-journal keys prevent racing duplicate issues. No client supplies a journal
ID, document number, mapping, source authorization Boolean or control role.

Retain the **approved** revision, fingerprint and issuance intent across retries.
The receipt binds all three plus invoice ID and original issuer identity. Exact
replay returns the exact saved response; changed arguments/actor under the same
intent fail. A different intent cannot issue an already issued source. A concurrent
same-key/different-invoice conflict may return SQLSTATE 23505 and rolls back all
effects. Recover lost ACK with `lookup_aqvora_sales_issue`; null means unresolved,
not permission to post a different source. A different authorized reader may look
up the original receipt without taking ownership of that issuance request.

Receipt fields include company, invoice, customer, document number, issue intent,
journal ID and server-generated journal intent, business date/currency, exact face
amount, approved/issued revisions, fingerprint and posting actor/time. The ordinary
journal intent is an independent unpredictable server-generated identifier.

## Financial example and reconciliation

For quantity `1500000`, unit price `101`, discount `2`, gross is `152` minor units,
and invoice face/net revenue is `150`. The immutable journal is:

| Account | Debit minor | Credit minor | Verified dimensions |
| --- | --- | --- | --- |
| Trusted Trade Receivables control | `150` | `0` | Customer UUID; invoice UUID as open item |
| Trusted service Sales Revenue | `0` | `150` | Source journal link |

There is no tax entry, cash movement, stock movement or legacy balance mutation.
The generic manual writer still rejects arbitrary AR postings and unverified
dimensions. A trigger blocks generic reversal of an invoice journal: until an
authorized linked credit workflow exists, issued corrections/refunds are blocked.
Issued and cancelled sources, journal history, receipts and audit cannot be
updated/deleted, even through ordinary privileged DML.

Invoice detail verifies exact source arithmetic, policy/customer snapshots,
financial fingerprint, two source-linked lines, header, both receipt contracts,
journal audit and a contiguous source audit chain including approval and issuance.
It returns reconciliation of face = AR debit = revenue credit, explicitly with
`settlements_supported=false`; this is an unsettled invoice basis, not a payment
allocation engine or complete AR aging service. Amounts, revisions, numbers and
audit IDs are strings on RPC boundaries.

GL/TB certification now fails closed for mismatched issued sources, missing
source links and unverified AR journals. The #53 API signature is unchanged; GL
rows add nullable `source_kind`, `source_id`, `source_revision` and
`source_fingerprint` so frontend drill-down can use invoice detail. Fingerprints
change on migration/new journals; consumers must restart collections normally.

## Migration order, verification and release gates

Apply these **only on disposable test infrastructure for this PR**, after #53:

1. `20261120161947_aqvora_sales_source_schema.sql`
2. `20261120162112_aqvora_sales_validation.sql`
3. `20261120162115_aqvora_customer_api.sql`
4. `20261120162118_aqvora_sales_draft_api.sql`
5. `20261120162121_aqvora_sales_lifecycle.sql`
6. `20261120162125_aqvora_sales_issue.sql`
7. `20261120162130_aqvora_sales_certification.sql`
8. `20261120162134_aqvora_sales_reads.sql`

Six operational/configuration tables, four journal provenance columns, company-local
numbering, composite foreign keys, immutable guards and company-leading indexes
are additive. No existing company is enabled and no real tax/mapping policy is
seeded. The original #53 journal certifier is retained as a private helper and its
original function identity becomes a source-aware wrapper; generic posting is
unchanged. Read source predicates always bind company IDs. Detail/list validation
uses per-invoice indexed joins instead of recertifying the entire ledger per row.
GL/TB still incur their documented whole-company cutoff certification cost.

Tests exercise PGlite arithmetic/security/lifecycle, independent PostgreSQL races,
real Auth-issued AAL1/AAL2 JWTs through local PostgREST, all migrations in fresh
and known deployed orders, rollback injection, full-schema restore including a
real issued invoice/receipts/sequence and post-close replay, and source query plans.
The source point-read plan is tested after creating 1,000 same-company and 1,000
foreign-company drafts through the guarded APIs; it must use the company/ID
primary-key index. This synthetic plan check is not a hosted load benchmark.
The fixture helpers reject nonlocal databases and require disposable markers.

PR #52/#54/#55 were reviewed without merging. Deliberate differences: service-only
verified tax treatment, no caller-supplied tax, canonical OWNER/MANAGER only,
OWNER-only checker with no maker exception, bigint revision strings and actual
SQL row locks/receipts replacing advisory client claims. #56 is a separate read
assembler and needs explicit integration review of additive source provenance.

Hosted staging/load, jurisdiction and rounding policy approval, linked credit and
settlement workflows, migration-ledger reconciliation, legacy openings/queues,
old-client fencing and security/recovery sign-off remain release gates. Three
inherited legacy mutable-search-path advisor warnings from #53 remain outside
this source slice. No merge, production migration or writer activation is authorized.
