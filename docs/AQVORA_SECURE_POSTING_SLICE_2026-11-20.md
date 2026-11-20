# AQVORA V2 secure posting slice

**Status:** isolated backend foundation; no production migration, activation, or legacy cashbook change.

## What is implemented

Three ordered migrations create a separate company-scoped Chart of Accounts, fiscal periods, immutable posted journals and lines, durable receipts, and append-only audit entries. The `post_aqvora_journal` RPC writes a balanced journal, lines, receipt, and audit entry in one PostgreSQL transaction. Monetary input must be a canonical decimal integer string; PostgreSQL `bigint` and exact `numeric` sums enforce bounds and balance. The `lookup_aqvora_receipt` RPC recovers a committed result after a lost response. Retrying the same key with a changed date, currency, lines, or reversal metadata fails. A unique `(organization_id, intent_key)` constraint serializes racing requests.

The `reverse_aqvora_journal` RPC appends opposite lines linked to the original. A unique company-scoped `reversal_of` prevents a second reversal. Original history and audit records cannot be updated or deleted. Reversal of an archived account remains possible in a later open period.

Posting and receipt lookup require `auth.uid()`, an AAL2 token, and an active canonical `organization_members` OWNER or MANAGER row. The membership row is locked while posting, so a concurrent role change cannot slip between the check and commit. V2 table reads use the same canonical membership and AAL2 rule. Clients have no direct write grants on any V2 table. The only public writer APIs are the three explicitly granted RPCs. The `aqvora_enabled_companies` table starts empty and is writable only by a trusted administrator; no existing company is enabled by migration. Disabling a company blocks new posts while an authorized caller can still recover a previously committed receipt.

## Relationship to earlier draft PRs

- #23 and #29 harden lost acknowledgements and receipt replay in the **legacy cashbook**. This slice does not reuse that writer or create a second cashbook posting path.
- #26 and #30 harden canonical membership, MFA, and balance mutation for the **legacy schema**. This slice independently checks the canonical membership and AAL2 inside its new RPCs; those PRs still need separate integration and migration-order review.
- #31 quarantines legacy balance snapshots. This slice does not consume or reconcile them.
- #38 supplies exact minor-unit and financial read-model contracts. The SQL writer uses the same integer-string boundary but has no production UI or certified report reader yet.

## Verification and limits

PGlite tests apply these migrations to an isolated synthetic fixture and also after the full repository migration chain. They cover imbalance, float/overflow rejection, retries, a same-engine concurrent retry, closed periods, role demotion and deactivation, AAL1, cross-company access, direct write denial, account constraints, reversal, totals, and immutability. They do not prove independent PostgreSQL connection contention, Supabase Auth/PostgREST behavior, production migration order, or the effective grants in a real isolated Supabase project. No such project was available for this work.

The new Chart and periods must currently be provisioned by a trusted migration or administrator. There is no end-user configuration API, feature flag, journal UI, certified report snapshot, tax/FX logic, or AR/AP/inventory operational writer. Legacy cashbook and offline data remain untouched. Before any rollout, reconcile the pending security migrations and legacy balances, test a real isolated Supabase environment with independent sessions, rehearse backup/restore and migration order, and fence old clients so there is one authoritative writer.
