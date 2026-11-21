# AQVORA currency unit policy — Issue #68

Backend base: Draft #63, `256172d18a435f1e91cdee56da2709e6e30ce154`.
Compatible integration references: frontend #71 and architecture #73. Neither history is merged.
This change is an inactive backend contract. Founder review, finance approval and a separate release decision remain required.

## Accounting decisions

`private.aqvora_currency_policies` is the sole currency unit authority for this V2 slice. It starts empty. No locale, ICU, browser, organization symbol, currency code lookup or country default supplies an exponent. Trusted database maintenance must provision an externally reviewed company approval; no browser, OWNER, MANAGER, anon or public policy mutation endpoint exists. A reference string records evidence, not proof that an accountant or ISO approved a company.

Each immutable revision records company, currency identity, integer exponent (0–9), effective date, authority reference/version, company approval reference/OWNER and SHA-256 fingerprint. Approval requires an active canonical company OWNER at provisioning time. Provisioning is a privileged operational action, not a user-session RPC; it does not attest MFA or replace founder/accountant approval. Audit provenance lives in the immutable revision itself. Application policy reads require a live AAL2 session and active OWNER/MANAGER membership.

Transaction currency equals ledger/base currency in this slice. FX, alternate display currency and consolidation remain unsupported. Display decimal places equal the approved unit exponent; no cash rounding or display rounding is introduced. `minor_units_per_major` is the exact string `1` followed by exponent zeroes. Price/discount/journal units all use that same denominator. Service quantity remains integer millionths, with exact per-line half-up rounding before discount using `div(qty * price + 500000, 1000000)`. Policy metadata never changes an amount.

A company book retains one currency and exponent permanently. Revisions may reattest authority/approval with later effective dates, preserving the same units. A new revision must be exactly the previous revision + 1, dated after the latest revision and every existing invoice, cash collection, customer receipt and journal, including drafts. This deliberately blocks retroactive reinterpretation and future-dated draft ambiguity. A first policy cannot be attached to a company with existing unscaled V2 documents. Changing book units, adopting ISO changes with different exponents, converting old history or changing source rounding requires a separate approved book/cutover design. No such operation ships here.

Historical sources retain their original revision even after a future revision is appended. Pre-policy rows retain NULL revision and their original fingerprints/audits/receipt values. Reads remain available as raw minor units; `display_complete=false` prevents invented historical major amounts. New documents and postings require a configured dated policy. Existing unscaled drafts may be cancelled; they cannot be approved/posted by assigning a new interpretation. Legacy Shop Pro rows, balances and queues are outside this policy and unchanged.

## Read RPC

```ts
supabase.rpc("read_aqvora_currency_policy", {
  p_organization_id: companyId,
  p_currency: "PKR",
  p_as_of_date: "2026-11-20"
});
```

`src/accounting/currencyContracts.ts` defines the discriminated response. An illustrative **synthetic** configured response is:

```json
{
  "contract_version": "aqvora-currency-read-v1",
  "organization_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "transaction_currency": "PKR",
  "ledger_currency": "PKR",
  "as_of_date": "2026-11-20",
  "status": "configured",
  "display_complete": true,
  "policy": {
    "contract_version": "aqvora-currency-policy-v1",
    "status": "configured",
    "organization_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "transaction_currency": "PKR",
    "ledger_currency": "PKR",
    "currency_exponent": 2,
    "minor_units_per_major": "100",
    "display_decimal_places": 2,
    "revision": "1",
    "effective_from": "2026-01-01",
    "fingerprint": "<64 lowercase hexadecimal characters>",
    "provenance": {
      "kind": "trusted_company_accounting_policy",
      "authority_reference": "<reviewed reference>",
      "authority_revision": "<reference version>",
      "approval_reference": "<company approval evidence>",
      "approved_by": "<company OWNER UUID>"
    },
    "source_rounding": "quantity_millionths_half_up_per_line_v1",
    "fx_supported": false
  }
}
```

Missing policy is a successful authorized read with `status="unconfigured"`, `display_complete=false`, `policy=null`. Denied access, malformed dates, foreign/mismatched currency and corrupt policy return errors, never zero or unconfigured camouflage. The effective interval is `[effective_from, next revision effective_from)`; the final revision has no configured expiry. Business dates are explicit, not inferred from OS time.

## Financial source and report integration

All existing public RPC names, arguments, canonical integer strings and `aqvora-read-v1` identity remain. Additive evidence version `aqvora-currency-report-v1` distinguishes upgraded envelopes; a client must require it before displaying report major units.

| Surface | Evidence |
| --- | --- |
| Invoice/cash/customer receipt source JSON | `currency_policy` bound at original creation; approval fingerprints and audit rows include it |
| Invoice/receipt issue response and recovery lookup | Same bound `currency_policy`; original saved response returned on exact replay |
| Generic posting/recovery | Bound `currency_policy`, also included in immutable journal/receipt payload |
| Invoice open balance | Original invoice `currency_policy` and `display_complete` |
| AR/open-invoice/GL/TB `source` envelope | As-of `currency_policy`, `currency_policy_revisions`, `currency_policy_timeline_fingerprint`, `currency_policy_status`, `display_complete`, `currency_evidence_version` |

Journal/source revision FKs use `(organization_id,revision)`. Certification independently compares invoice/receipt/cash policy snapshots, journal evidence and saved posting response to immutable policy, in addition to existing source/audit/amount checks. Missing evidence on a revision-bound source is corruption. Unconfigured pre-policy history cannot acquire authority from a current lookup.

Reports may include several policy revisions only when currency/exponent agree. The returned timeline contains revisions effective through the cutoff. The source token hashes the existing complete financial source plus that timeline and display completeness. GL, TB and AR use the same token basis for equal parameters. Source amount or relevant policy changes cause `40001`; restart the **entire** pagination. Future policy after cutoff does not invalidate a historical report. Each STABLE reader uses one statement snapshot.

Use source-bound evidence for source amounts, and the certified envelope for aggregates. A current lookup alone cannot certify an old invoice, raw direct table row, cached report or unscaled import. Compare company, currency, effective date, revision and fingerprint across relevant responses. Revision changes with identical units are permitted and explicit; never require every historical invoice to carry today's revision.

For every report, retain the first token, verify subsequent tokens/evidence, contiguous GL/TB ordinals, unique row IDs, stable totals, returned counts, matched count and final `has_more=false`. An omitted/repeated page is not a complete report. The backend supplies these facts; it cannot prove a browser fetched all pages. AR continuation now rejects foreign/unmatched/settled UUIDs and requires its snapshot token; `returned_count` is additive. No stateful export service is introduced.

## Exact frontend interpretation

After validating a live authorized server response and corresponding source/report evidence:

```ts
const n = BigInt(canonicalMinor);
const magnitude = n < 0n ? -n : n;
const denominator = BigInt(policy.minor_units_per_major);
const whole = magnitude / denominator;
const fraction = magnitude % denominator;
const digits = policy.currency_exponent; // small metadata integer, never money
const exact = (n < 0n ? "-" : "") + whole.toString() +
  (digits === 0 ? "" : "." + fraction.toString().padStart(digits, "0"));
```

Require exponent 0–9, denominator equal to `10n ** BigInt(exponent)`, matching display places/currencies/company and recognized contract/provenance. Keep money, quantities, revisions and aggregates as canonical decimal strings/BigInt. Never pass actual money through Number, parseFloat, floating division or Intl currency defaults. Locale grouping can be applied to digit strings after exact conversion. When evidence is absent, unconfigured, contradictory or incomplete, display explicit raw minor units and an incomplete display state. No frontend component or flag is changed in this PR.

## Authorization, concurrency and errors

All new private helpers/tables revoke PUBLIC/anon/authenticated access. The policy table has RLS and no application grants/policies. Only the read RPC grants authenticated EXECUTE; it rechecks canonical membership, live `auth.sessions` and AAL2. Security-definer routines have fixed empty search paths. The organization currency trigger uses SECURITY DEFINER only to enforce private policy restrictions while existing organization RLS/column privileges control the attempted update. The trigger grants no mutation capability.

Provisioning locks approving membership before company FOR UPDATE. Financial RPCs retain session/membership locks, then company FOR SHARE, then existing source/period/account locks. Policy append sees committed document dates after waiting. Source revision is immutable; policy UPDATE/DELETE/TRUNCATE and book currency changes fail closed. READ COMMITTED is required for currency mutations and new financial source mutations. REPEATABLE READ/SERIALIZABLE mutations return `40001`, preventing stale policy snapshots; historical reads remain snapshot-consistent at other isolation levels.

| SQLSTATE | Meaning / action |
| --- | --- |
| `42501` | Policy read denied: role, company, live session or MFA; do not substitute cached authority |
| `22023` | Invalid currency/date/cursor; correct request |
| `23514` | Missing/corrupt/incompatible policy, stale revision or forbidden reinterpretation; investigate/review |
| `40001` | Changed report snapshot or unsupported write isolation; restart with fresh authorized READ COMMITTED transaction/report |

Existing source APIs retain their established errors for invalid lifecycle, payload/actor idempotency mismatch and unavailable periods/mappings. Do not automatically choose a new financial intent after an ambiguous response. Original exact replay remains available after period closure and future policy revisions. No amount/precision input was added to a posting request, so a client cannot override policy.

## Migration and recovery

After all eight #63 migrations ending `20261120172200_aqvora_receipt_reads.sql`, apply in filename order:

1. `20261121052824_aqvora_currency_policy_schema.sql`
2. `20261121052830_aqvora_currency_source_binding.sql`
3. `20261121052834_aqvora_currency_posting.sql`
4. `20261121052837_aqvora_currency_certification.sql`
5. `20261121053158_aqvora_currency_journal.sql`
6. `20261121053320_aqvora_currency_source_certification.sql`

Apply as one transactional release batch or with all financial clients fenced until the entire dependency chain is installed. Intermediate migration states are not supported application versions. Nullable revision columns preserve existing rows without monetary data rewrites; ALTER TABLE/FK validation still requires maintenance/locking rehearsal. Policies/enrollment stay empty. CLI is deliberately pinned at 2.121.0; the [CLI v3 changelog](https://supabase.com/changelog/supabase-cli-v3) requires migration review before upgrading that toolchain.

Before commit, a failed batch rolls back schema, functions and grants. After commit, do not delete immutable policy/source evidence to downgrade. Fence writers, restore a tested synthetic/full backup or deliver an additive reviewed forward repair. The automated recovery drill uses full-schema **logical** `pg_dump -Fc`/`pg_restore` into a separate disposable database; it is not a physical/PITR or hosted restore certification.

## Evidence and remaining approvals

Test reference fixtures use PKR 2, USD 2, JPY 0, KWD 3, CLF 4. Reference: [SIX ISO 4217 current list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), accessed 2026-11-21, maintained by [SIX](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html). These are synthetic test expectations, **not finance-reviewed production approvals**. N/A minor-unit assets, tax policy, FX and redenomination require explicit future decisions, never locale guesses. No ISO table is seeded into any company.

See `aqvora-currency-verification.md` for exact check counts, CI, source reconciliation, races, migration/restore and inherited findings. The Windows execution host has no Docker/PostgreSQL runtime; independent connections and real TOTP Auth/PostgREST run on disposable CI services. Hosted behavior, realistic load, physical/PITR recovery, finance/jurisdiction approval, legacy reconciliation/queue fencing and rollout remain unverified release gates. Issue #72 implementation is a separate assignment after #68 review.
