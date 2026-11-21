# Issue #68 currency integrity review

The currency policy implementation from Draft #78 remains the foundation. This follow-up closes a reproduced gap in **unposted source reads**: draft or submitted documents could return a revision from the wrong effective date, omit a configured binding, contradict the currency, or disagree with their policy snapshot after privileged fixture corruption. Posted-source certification already rejected these inconsistencies. The failure was in the read contract; this review found no application grant allowing the corruption itself.

## Verified preparation and lineage

- Reviewed current GitHub metadata, histories, CI and contracts for Drafts #41, #44, #53, #59, #63, #71, #73 and #78, plus Issues #68 and #72. Read #73's architecture blueprint, delivery matrix and backend handoff. `04_CURRENT_HANDOFF.md` is not present in the repository or its fetched history.
- #63 head: `256172d18a435f1e91cdee56da2709e6e30ce154`; passing [CI 44787873091](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44787873091).
- New branch: `codex/issue-68-currency-integrity-review`, created in a separate clean worktree from #78 head `a2103739399775b78e4672c408b073c3b6e16be5`; all three jobs passed in [CI 44873818617](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44873818617). Git ancestry confirms #63 is an ancestor. No frontend sibling or architecture history was merged.
- Supabase CLI remains pinned to 2.121.0. Reviewed current official session/RLS documentation and the CLI v3 breaking-change notice. Generated the new migration with `supabase migration new`; no hosted target was linked or queried.

## Implementation and compatibility

`20261121065636_aqvora_currency_source_read_integrity.sql` adds one private STABLE invoker helper with an empty search path and revoked PUBLIC/anon/authenticated execution. Three existing private JSON serializers call it. Existing public RPC authorization and signatures remain unchanged; no new public endpoint or mutation permission is introduced.

The helper independently compares the stored company/revision, source currency, effective business date and any stored policy snapshot. It rejects inconsistent or missing configured evidence with `23514`. Detail, list, audit and creation-retry paths inherit validation from these serializers. It performs no writes, locks, rounding or floating-point calculations.

Valid source JSON is unchanged, including genuine pre-policy absence. The upgrade test creates an issued invoice, controlled-cash receipt, allocations and audit under #78, applies only the new migration, then compares all source responses, receipt replay, exact open balances and the report token. A second upgrade test proves unconfigured legacy invoice/cash drafts remain readable and cancellable after the entire currency batch.

Policy decisions from #78 remain explicit: empty configuration, immutable company books, transaction currency equal to ledger currency, display precision equal to the approved exponent, and same-unit dated reattestation only. No production approval, FX, tax expansion, cash rounding, redenomination or legacy conversion is inferred. Price arithmetic remains exact quantity-millionths with per-line half-up rounding before discount.

## Verification

Before the fix, **13 regression cases failed** because the RPC successfully returned contradictory unposted evidence; the historical positive control passed. After the migration, the focused source-read suite passes **16/16**, including the two populated upgrades. The existing currency and full-migration smoke suites also pass.

- New application cases cover invoice, cash and receipt drafts with future revisions, removed bindings and wrong currencies; submitted invoice/receipt snapshots with altered or absent currency evidence; unchanged historical source/audit after reattestation; populated #78 upgrade and legacy cancellation.
- Added a real Auth/PostgREST case using a TOTP-issued manager session. Synthetic privileged corruption commits before separate HTTP detail/list/retry requests; all must return `23514`. The fixture is repaired in `finally`, and exact source/retry equality is then checked. The new helper's direct execution grant must remain denied.
- Added an independent PostgreSQL case that reads an approved historical invoice while a future policy append remains uncommitted. A 1.5-second statement timeout bounds the read; its response must remain identical after the append commits. Existing posting/policy races, stale-isolation rejection and rollback tests continue to run with this migration.
- Both migration orders and the full-schema logical `pg_dump -Fc` / `pg_restore` drill include the new migration through the currency dependency list. Existing restore checks verify exact journals, allocations, source receipts, audit, private policy rows, grants and post-close replay.

Final CI counts and links will be recorded after the new Draft PR runs. Local TypeScript, strict TypeScript, lint, size, production build and dependency audit passed; audit found zero vulnerabilities. The execution host has no usable Docker/PostgreSQL runtime, so independent PostgreSQL and real local Supabase tests run on disposable GitHub Actions services. PGlite execution on Windows is additional evidence, not a replacement for those services.

## Frontend handoff and release limits

Continue using `read_aqvora_currency_policy(p_organization_id,p_currency,p_as_of_date)` and `src/accounting/currencyContracts.ts`. Require source-bound or certified report evidence, matching company/currency/date/revision/fingerprint and complete pagination before converting BigInt amounts with the exact denominator. A current policy lookup does not certify an arbitrary historical row. SQLSTATE `23514` must clear the affected source display; do not substitute cached metadata, guessed precision or a fictitious zero. See `aqvora-currency-policy-api.md` for the full wire contract and error handling.

Founder/accountant approval remains required for actual company/book currency, units, authority version, jurisdiction, approval evidence, historical cutover and release. Test reference values PKR/USD 2, JPY 0, KWD 3 and CLF 4 were rechecked against the [SIX ISO 4217 XML list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml) on 2026-11-21; these fixtures are not production finance approvals.

No `main` update, merge, production deployment, existing Supabase business-project use, hosted migration, paid resource, existing-company enrollment, frontend modification, legacy cashbook/balance/queue change or V2 activation is authorized or performed. Policies/enrollment remain empty outside disposable synthetic fixtures. Hosted business behavior, large-tenant capacity, physical/PITR recovery and country approvals are unverified. The three inherited mutable-search-path advisor warnings remain separate release items.

Next step: founder/backend/frontend review of #68 and its contract. Issue #72 remains a separate assignment after that review; its implementation has not started.
