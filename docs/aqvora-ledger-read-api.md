# AQVORA V2 General Ledger and Trial Balance read API

Issue #51; stacked on backend PR #44 at `0d1d0bf6`. Contract version
`aqvora-read-v1`. No frontend activation, company enrollment, financial writer
change, legacy balance change, hosted migration or production deployment.

## Transport and authorization

Call these functions through authenticated Supabase PostgREST `POST /rest/v1/rpc/NAME`
or `supabase.rpc(NAME, arguments)`. Use a publishable key and the user's access
token. No service-role key belongs in an application client.

Every request checks `auth.uid()`, AAL2, a matching live `auth.sessions` row,
and active canonical `organization_members` OWNER/MANAGER membership. The caller
selects a company; the server authorizes that company. JWT user metadata and
client role/completeness flags confer no authority. Anonymous execution and
direct V2 financial-table writes remain denied. A token or cursor never grants
access and is reauthorized on every call.

The private certifier and public wrappers use `SECURITY DEFINER` because
RLS-filtered empty input cannot distinguish denied access from complete empty
books. All source predicates bind the authorized company, `search_path` is empty,
and the private certifier is not executable by public/anon/authenticated roles.
There are no dynamic SQL, temporary report tables, financial writes or row locks.

## Exact signatures

```sql
read_aqvora_general_ledger(
  p_organization_id uuid, p_account_id uuid,
  p_from_date date, p_to_date date, p_currency text,
  p_limit integer default 100, p_cursor jsonb default null,
  p_snapshot_token text default null
) returns jsonb;

read_aqvora_trial_balance(
  p_organization_id uuid, p_from_date date, p_to_date date, p_currency text,
  p_limit integer default 100, p_cursor jsonb default null,
  p_snapshot_token text default null
) returns jsonb;
```

Dates are inclusive company business dates, supplied as ISO `YYYY-MM-DD`, from
0001-01-01 through 9999-12-31. Infinity, null, invalid dates and reversed ranges
fail. Currency must be the company's exact uppercase three-letter base currency;
there is no conversion. Page size is 1–200. A GL account must be a same-company
posting leaf; archived accounts remain readable. TB includes all posting leaves,
including inactive and unused zero-balance leaves; headings are excluded.

Wire TypeScript interfaces are in `src/accounting/readContracts.ts`. Amounts,
revisions, counts and ordinals are canonical decimal integer **strings**;
`returned_count` and `line_no` are bounded JSON numbers. Never convert money
through `Number`, `parseFloat` or JSON numeric coercion. Aggregate using `BigInt`
or exact decimal arithmetic. The previous browser `parseMinorUnits/addExact`
helpers impose BIGINT bounds and **must not** parse these widened aggregates.

## Consistency and pagination

All read functions, including the private certifier, are `STABLE`. PostgreSQL
uses one MVCC statement snapshot for authorization, certification, totals and
rows, including their nested SELECTs. A concurrent posting appears entirely or
is absent entirely; a reader does not block the writer. Role/session revocations
committed before a request are effective immediately. An already running request
can finish against its initial statement snapshot. No response is a promise that
the source has remained unchanged after the response was generated.

Across HTTP requests, consistency is **optimistic, restart on change**. There is
no long-lived database snapshot or materialized export. A SHA-256 source
fingerprint binds company, date range, currency, every included immutable journal,
its ordered lines/receipt/audit, and the complete current company chart/period
metadata. GL and TB share the same fingerprint for the same filters. A new or
backdated posting through `to_date`, reversal, chart edit/archive or period
close/reopen invalidates the prior fingerprint. A posting after `to_date` does
not invalidate an otherwise unchanged source. Account/period changes conservatively
invalidate it even when unrelated to the requested dates. This fingerprint is a
change detector, not an authorization credential or external audit signature.

1. Start without a cursor/token. Retain `source.snapshot_token`.
2. Send that token with every subsequent GL/TB request using these same filters,
   including account drill-down. Send `next_cursor` unchanged to continue a page.
3. GL order is `(business_date, journal UUID, line_no)` ascending; TB order is
   `(account code COLLATE "C", account UUID)` ascending. UUID order is a
   deterministic tie-breaker, not a chronological posting sequence.
4. Verify contiguous `ordinal` values, `returned_count`, final collected count
   equal to `matched_count`, and terminal `has_more=false/next_cursor=null`.
   Replaying a cursor returns the same rows while the token is valid. Cursors
   are bound to report kind, token and account; unknown/foreign anchors fail.
   They are not signed: choosing another valid anchor intentionally skips rows,
   which the ordinal/count checks expose. Clients must use returned cursors.
5. On SQLSTATE `40001`, discard the entire accumulated report and restart from
   page one. Do not append new-source pages, substitute cached/sample rows, or
   convert any error/partial collection into zero. Use a bounded retry policy.

Every response's totals cover the **entire requested source**, independent of
page size. `source_complete=true` attests to that certified V2 source; it does
not mean a paginated row collection is finished. An empty verified V2 source
returns exact zeros. A denied, failed or inconsistent source returns an error.
For frequently changing large books, uninterrupted exports will need a separately
designed persisted snapshot/export service; this API deliberately fails closed.

## Source envelope and completeness proof

`source` includes contract version, company, currency, inclusive dates,
`snapshot_token`, `observed_at`, authorized user/role, and:

```json
{
  "basis": "v2_posted_journals",
  "source_complete": true,
  "legacy_included": false,
  "opening_migration_verified": false,
  "consistency": "restart_on_source_change",
  "source_journal_count": "2",
  "source_line_count": "4",
  "source_debit_minor": "202",
  "source_credit_minor": "202"
}
```

Source counts and gross Dr/Cr cover **all history through `to_date`**, including
the history before `from_date` used for brought-forward balances. Certification
verifies each journal has 2–100 contiguous lines, matching header totals and
canonical posted payload, same-company posting accounts, valid fiscal coverage,
one matching durable receipt, and exactly one matching immutable audit event.
Reversal lines must invert the original journal and its dimensions exactly.
Missing lines/receipts/audit, payload mismatch, wrong currency, or imbalance
fail closed. It reads the authoritative database, never a caller's collection
or assertion of completeness. Operator-level trigger bypass/database corruption
requires separate operational controls; a balanced TB alone cannot prove
economic correctness, classifications or missing business documents.

## Accounting semantics and response fields

All signed balances use **debit minus credit**, regardless of normal side.
`opening_minor` sums recorded V2 lines before `from_date`; period debit/credit
sums the inclusive interval; `closing_minor = opening + debit - credit`.
No assumed legacy opening, cash-account balance, balancing plug, earnings
transfer or fiscal-year reset is inserted. `opening_migration_verified=false`
means these are recorded V2 book balances, not a certified complete economic
opening for an existing business.

GL returns `account`, these four balance fields, page metadata and `rows`.
Each row carries journal ID, intent key, business date, posted instant/actor,
fiscal period ID, reversal link/reason, immutable audit event ID, line number,
account ID, exact debit/credit, party/open-item/stock references (nullable),
ordinal and `running_balance_minor` carried across every page. The existing
schema has no formal voucher number, document kind or narration: `journal_id`
and `intent_key` are the available voucher provenance. No voucher is fabricated.
Account name/status/revision describe the current chart; original label snapshots
were not stored in posted lines. Their changes invalidate the fingerprint.

TB returns account rows with identity, ordinal, opening/movement/closing and
`closing_debit_minor=max(closing,0)`, `closing_credit_minor=max(-closing,0)`.
`totals` contains opening debit/credit balances, gross period debits/credits,
and closing debit/credit balances. Each pair must reconcile exactly or the
request fails. These are whole-report totals on every page.

Originals and reversals are each included once at their own business dates.
A later reversal never removes the original from an earlier cutoff. Closed
and reopened periods keep all posted history; a close does not produce a
closing journal. Retained earnings, year-end closing and signed migration
openings remain unavailable pending approved policies and explicit postings.

## Errors and integration gates

| SQLSTATE | Meaning | Client behavior |
| --- | --- | --- |
| `42501` | Auth/session/MFA/company role denied or execute privilege denied | Clear sensitive results; reauthenticate or show access denied |
| `22023` | Bad range/currency/page/account/cursor | Correct input; never use another company's account |
| `22007` / `22008` | PostgreSQL rejected date input | Correct ISO date |
| `40001` | Source fingerprint changed | Discard report and restart |
| `23514` | Incomplete/inconsistent financial source or TB integrity failure | Report unavailable; investigate server-side |

Supabase/PostgREST also rejects invalid or expired JWTs before SQL. Network,
timeout and other database errors remain unavailable results, not financial zero.
Do not feed a single page into the older pure financial snapshot calculator.
The integration branch must validate the response's company/currency/version,
complete the pagination protocol, retain source provenance and respect permission
changes. No UI adapter or writer is activated by this PR.

## Migration, performance and verification

Three additive migrations add three company-leading indexes and three functions
(one private certifier, two public RPCs). They create no financial/source tables,
rewrite no history, change no existing grants/policies/writer functions and leave
enrollment empty. Rehearse both repository and deployed migration order; full
dump/restore tests also call the new reader on restored data.

The date index starts with `(organization_id,business_date,id)`; GL account
history uses `(organization_id,account_id,journal_id,line_no)`; audit lookup uses
`(organization_id,journal_id)`. Existing receipt and journal keys cover source
joins. Certification costs O(company journals and lines through cutoff), plus
company chart/period metadata. Per-journal hashing bounds each line aggregation
to 100, but building the company fingerprint and window balances still consumes
memory/work proportional to that company's source on **each page**. It is not
a constant-time keyset export. No partitioning/projection is claimed.

`aqvora_read_rpc.test.ts` exercises synthetic accounting/security contracts in
PGlite. `aqvora_read_postgres.test.ts` exercises independent PostgreSQL 17
sessions, concurrent commit visibility, cursor drift, and a 1,000-journal query
plan printed in CI. `aqvora_real_supabase.test.ts` uses real Auth-issued
AAL1/AAL2 tokens against local PostgREST with synthetic users only. The existing
migration-order/recovery suite includes the new RPC. Local database suites
require disposable markers and localhost targets; CI provisions all infrastructure.

Hosted staging configuration/latency/load, approved accounting closing/opening
policies, legacy reconciliation/queues, old-client fencing and the separate
frontend integration remain release gates. Do not merge, apply hosted migrations
or enroll an existing company without founder approval.
