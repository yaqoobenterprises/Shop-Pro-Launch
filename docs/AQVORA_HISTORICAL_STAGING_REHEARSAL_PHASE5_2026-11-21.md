# AQVORA — historical Cashbook → V2 journal staging rehearsal (Phase 5)

**Date:** 2026-11-21. **SYNTHETIC / DISPOSABLE ONLY. NOT a historical user-data migration.**

Parent stack: Draft #88 → #90 → #91 → #92 → #93 → **this Draft**. Release status [issue #89](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89). Never merge the child blindly into main.

## What this iteration actually does

The pure `scripts/aqvora_historical_staging_rehearsal.mjs` adapter runs the #93 private source/CoA review and converts a **fully synthetic**, complete seven-table ledger-matched Cashbook example into the **actual secure V2 RPC** shape: `public.post_aqvora_journal(organization_id, intent_key, business_date, lines)`.

The adapter **does not connect to PostgreSQL, Supabase, Vercel or any network**, does not post entries, and **rejects any source project reference other than `synthetic-ci-fixture`**. The only recognized environment marker is `disposable-in-memory-postgres`. It rejects pending cloud drafts, historical voids, test-tagged fixtures, source exceptions, unconverted source-account movement, nonzero unreviewed openings, invalid company identities, journal imbalance, invalid amounts or idempotency keys. No existing company is ever enabled by this module.

The new automated integration test `tests/aqvora_historical_staging_rehearsal.test.ts` uses **in-memory PGlite and synthetically generated 2 transactions + 1 cash-to-bank transfer** to:

1. Install the repository's existing V2 SQL migrations on isolated ephemeral PostgreSQL.
2. Create a fake source UUID and a separate **fake target organization**, one fake owner/valid session, synthetic CoA and fiscal period, and synthetic currency evidence.
3. Enable **only the ephemeral target company** in this ephemeral database. No production service, migration or credentials are accessed.
4. Post three proposed journals using the **actual existing V2 authorizing RPC** with a synthetic AAL2 session (not public SQL INSERT), replay the same request and recover the posting receipt.
5. Assert same-intent changed-payload rejection and compare three immutable journals, six exact minor-unit lines, balanced totals, source-account cash/bank movement, and the certified V2 Trial Balance read.
6. Assert the module remains `real_import_allowed:false` even after these tests. **Tests are not evidence of real source legal/accountant approval or live tenant Auth/PITR backup.**

The source→journal intent key in parent #93 has also been corrected to a **bounded 71-character deterministic SHA-256** of the entire private `(source_project_ref,source_organization_id,kind,source_id,revision_hash)` tuple. The old concatenated format could exceed the backend journal RPC's 160-character limit.

## Explicitly absent

- **No live existing-company financial posting** (the production DB has no AQVORA V2 schema).
- No private 7-table snapshots for the 4 actual legacy organization UUIDs, no device IndexedDB backup, no independent production logical/PITR restore and no bank/cash statement reconciliation.
- No signed target legal-company mapping, CoA account decisions or fiscal-period approval. User's 415-row CSV is preserved, but is insufficient for full historical immutable reversal and transfer evidence.
- No historical import source-evidence table, independent maker/checker attestations, trusted server-side verified source revision chain, or staging-import service. The **generic V2 posting RPC is not yet a production historical import API**: its journal receipt alone does not prove original historic source signatures and reviewer decisions.
- No automatic close of remaining independent PRs, merge to main, deployed staging, real data import, financial writer activation or paid cloud resources.

## Next Codex backend acceptance gate

Build a private, source-linked, immutable import batch and audit receipt API in a separate Draft PR (not raw client journal insertion): validate *source project + organization UUID + row ID + revision SHA256* uniqueness, legal target tenant and account/period membership, checker distinct from maker, source cutoff, exact PKR minor units, approved agency revenue vs liability, historical void/edit reversal chain, tenant-isolated MFA, crash/lost-ACK and parallel same-key retries. Only pass an isolated fixture after full restore and source→V2 GL/TB per-account parity is proven.

Use the [Supabase local development guidance](https://supabase.com/docs/guides/local-development) for disposable containers rather than modifying existing companies. <https://supabase.com/docs/guides/local-development/database-migrations> documents reproducible local migration testing. No production approval is implied by green CI.

**Operator warning:** the service and existing data behind shop-pro-launch.vercel.app are still legacy; Vercel free quota has previously returned HTTP 402. This test harness does not deploy or circumvent that restriction.
