# AQVORA Phase P0 — Fresh-company creation and two-independent-OWNER enrollment

**Date:** 2026-11-21. **Code-only Draft #101; NEVER apply to existing production Supabase without founder's separate release approval.** Branch builds on fresh ERP stack #87→#96→#97→#98→#100, excludes historic Cashbook import #90–#95. The original Shop Pro CSV remains private. Starting balance is **0**.

## Critical legacy trap resolved

Existing Shop Pro Auth signup trigger provisions a **different legacy organization** plus sometimes **PKR 10,000 Cash Drawer opening balance**. This **cannot** be silently converted to a genuine zero-balance AQVORA ERP company. New `public.create_aqvora_fresh_company` requires current AAL2 Auth session, creates an entirely separate **server-generated organization UUID**, owner membership and private immutable provenance **in one SQL transaction** with no payment accounts, transactions, CoA, journal, receipts, or writer enrollment. It returns an idempotent creation-intent receipt. Later the owner must explicitly select this new organization; existing first-profile selection alone cannot safely switch organizations. The old org and CSV are untouched.

Server-side triggers deny writing the original Cashbook's transactions, drafts, payment accounts, account ledger, transfer, inventory stock movement and account transfers for any company having this trusted fresh provenance. They do NOT affect existing legacy orgs, which have no provenance row. Foreign display names and client-provided org IDs cannot obtain provenance.

## Exact maker–checker activation workflow

1. A genuine new-company **OWNER with live auth.sessions, AAL2** creates CoA, fiscal period and obtains separately trusted, audited private currency/exponent policy. No money is posted by setup.
2. `public.propose_aqvora_fresh_finance_activation(org,maker_intent,period,policy_revision,reason)` requires active OWNER AAL2, locks company, checks immutable server-origin row, unchanged legal company+currency, **zero V2 and legacy financial source**, six active posting account classes, exactly one open fiscal period, and a trusted source-bound currency/exponent policy. A SHA-256 canonical server evidence hash and maker session+request are stored **immutably**, with deterministic same-key receipt replay and changed payload rejection.
3. A **different real active OWNER** with a **distinct live AAL2 session** independently reviews the same evidence and explicitly attests. `public.approve_aqvora_fresh_finance_activation(org,maker_intent,checker_intent,attestation)` rechecks original maker session/OWNER status, seven-day expiry, entire company/CoA/period/currency hash, already-enabled state, then atomically inserts immutable checker approval and **one** row into `public.aqvora_enabled_companies`. Company-level `FOR UPDATE` and unique constraints serialize conflicting attempts. Checker approval receipt and enablement commit or roll back together. **One-owner companies cannot self-approve**; separate approved onboarding/invitation workflow is prerequisite.
4. If an approval response is lost, same-key replay or `public.lookup_aqvora_fresh_finance_activation(org,checker_intent)` returns original receipt **read-only** under current OWNER AAL2. Never invent a new intent to recover a missing acknowledgement.
5. **First actual posting is a separate documented owner-authorized balanced journal** via the existing V2 writer. Activation itself creates **zero financial journals and zero cash/capital/inventory**.

## Security boundaries and tests

Private provenance/proposal/checker tables: RLS enabled, NO `anon` or `authenticated` table DML/SELECT, immutable row triggers; only tightly authorized authenticated public RPCs may invoke reviewed server-owned `SECURITY DEFINER` logic with empty `search_path`. Verify grants/definer escape, Supabase Auth session revocation, separate user and session, malicious org/intent/period/reason changes, legacy origin rejection, source drift and immutable original receipts. The existing generic V2 writer remains disabled for all non-enrolled tenants.

New `tests/aqvora_fresh_dual_owner_activation_sql.test.ts` runs all migrations in disposable in-memory PostgreSQL, fake two-user Auth JWT AAL2, intentional existing legacy PKR10,000 money, new company creation/replay/collision, legacy cross-writer denial, missing configuration, six source CoA classes and a **synthetic** trusted PKR currency policy, maker/change/maker-as-checker/AAL1/drift/revoked-maker denial, second OWNER exact receipt + lost-ACK replay and subsequent first separate Dr Cash/Cr Capital journal. This is an **authorization and financial math fixture**, not real external owner verification or legal policy signoff.

Existing CI's `tests/aqvora_migration_reconciliation.test.ts` explicit migration order is extended with the four new SQL files, and tests the same set in both fresh and deployed-order disposable database restore pipelines. All changes are version-control only.

**External references verified:** Supabase guide https://supabase.com/docs/guides/api/securing-your-api (SQL grants + RLS distinct; SECURITY DEFINER functions bypass RLS). Supabase docs current Auth schema guidance requires server session checks, NOT user-controlled metadata roles. Real production grant advisors/backups must be reviewed separately before staged migration.

## Still blocked

- Full self-service multi-company selector + genuinely independent second-owner invitation/acceptance UX, trusted currency authority creation ceremony and company timezone/currency policies; makers/checkers must hold valid separate MFA user sessions.
- Real Supabase isolated hosted project, separate Auth users MFA, PostgREST RPC integration and concurrency across independent connections; test fixture alone is insufficient.
- Deployment needs actual migration history dry-run, PITR/restore, independent tax/IFRS policy, server-provenance audit, mobile/PWA regression and explicit founder authorization. Vercel quota and billing remain separate.
- No automatic historical import, production database migration, old-company writer activation, `main` merge, release deployment or paid resources. Existing Shop Pro remains independently live.

Release plan #89 and backend issue #99 remain open until hosted acceptance and independent review pass.
