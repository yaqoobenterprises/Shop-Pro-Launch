# Issue #68 verification record

Base: backend Draft #63 at `256172d18a435f1e91cdee56da2709e6e30ce154`.
Branch: `codex/issue-68-currency-policy`.

The final verification counts and CI links will be recorded here after the disposable jobs finish. This document does not authorize activation or claim hosted readiness.

## Verification scope

- PGlite contracts: PKR/USD/JPY/KWD/CLF policy and actual source invoice issuance; exact per-line tie rounding, BIGINT maximum, discounts, canonical strings; invoice/cash/customer receipt/generic posting/AR/GL/TB metadata equality; corrupt source/receipt/journal/policy rejection; OWNER/MANAGER, AAL1, cashier, foreign, inactive and revoked sessions; immutable book units; dated revisions and original response recovery; all report pagination tokens; arbitrary AR continuation rejection; full currency batch rollback; populated #63 upgrade without invented historical scale; new private function grants.
- PostgreSQL 17: independent sessions for posting-before-policy, policy-before-posting, competing policy revisions, invoice issuance and receipt settlement against policy changes, snapshot restarts, unsupported write isolation, and complete late-failure rollback. Waiting is verified from `pg_stat_activity`, not inferred from sleeps.
- Real local Supabase: actual password login, TOTP enrollment/verification, AAL1/AAL2 JWTs and PostgREST calls. Currency read states, global fixtures, private endpoint/grant denial, current membership/role/session revocation and fingerprint corruption. Existing source invoice/receipt tests also require bound metadata on real financial JSON responses, including the 150-minor-unit half-up invoice and BIGINT boundaries.
- Full migration/recovery: fresh filename order and documented deployed order; empty policy/enrollment; issued synthetic invoice, receipt, exact journals, historical/future policy revisions and original-intent replay; failed transaction; full-schema logical dump/restore into a separate disposable database and comparison of policy rows/fingerprints, amounts, counts, source receipts, audit, grants and period closure.

## Security and release review

No frontend components, `main`, existing Supabase business project, paid resource, hosted migration, legacy balance, offline queue or company activation is changed. All new policy helpers have explicit EXECUTE revocation; private table RLS/grants deny direct application access. The one new public RPC performs live company/MFA authorization. New security-definer functions use empty search paths. Policy references are recorded approval evidence, not an automatic finance/legal attestation.

Financial policy revisions and source bindings are immutable. Company locks serialize policy append with existing writer transactions. Unit-changing revisions and retroactive interpretation are blocked. READ COMMITTED is required for mutations so a stale transaction snapshot cannot issue with an obsolete policy. GL/TB/AR tokens include policy history at the report cutoff. Clients still must verify complete page coverage before calling a report complete.

## Limits

The Windows host has no Docker/PostgreSQL runtime; real PostgreSQL and local Supabase execution is delegated to disposable GitHub Actions services. PGlite uses PostgreSQL semantics but does not replace independent connection/Auth tests. The restore drill is logical `pg_dump`/`pg_restore`, not physical backup/PITR. Existing PostgreSQL/Supabase fixtures remain synthetic; no hosted staging, production load benchmark, production restore or country/accountant approval is claimed.

Founder/accountant approval is still required for the initial company currency, exact book units, authority version, approval evidence, jurisdiction/tax treatment, rollout and historical migration/cutover. Currency policies remain empty outside test fixtures. Changing currency/exponent, unsupported N/A-unit assets, FX, credits/refunds, legacy conversion and source-rounding changes require separate reviewed work. Issue #72 has not been started.
