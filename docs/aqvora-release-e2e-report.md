# AQVORA release candidate: Issue #72 verification

**Release decision: NO-GO for production or existing-company enrollment.** This branch prepares a reproducible local accounting/security rehearsal. Passing local/CI tests permits engineering review; it does not grant finance, hosted staging, browser acceptance or production approval.

## Scope and exact base

Branch: `codex/issue-72-release-e2e-hardening`, created at PR #84's exact head `f200cc9068c06887f08b4dfb837f4068c7f720dc`. PR #84 remains untouched. It integrates frontend #82, backend #83 and main's six PWA branding assets; its [baseline CI 44879946409](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44879946409) passed 761 application, 47 PostgreSQL and 22 real Auth tests. Reviewed #83, Issue #72, active migrations, source contracts, currency validation, legacy transaction/balance triggers, offline queue/recovery and the service worker before implementation.

No UI component, financial SQL, migration, public grant, company-default policy or production setting is changed. The founder separately authorized one narrow shared-validator correction after real E2E exposed the timestamp bug described below. Synthetic fixture enrollment is limited to newly generated companies in a loopback disposable stack. Existing test companies and business Supabase projects are never used. Source currency remains synthetic PKR exponent 2, service-only verified out-of-tax-scope, without FX or bank-clearing claims.

## Integration failure found and approved correction

The [first E2E run 44882108412](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44882108412) passed application verification and the 47 independent PostgreSQL cases, but failed two new Auth E2E cases. Ten of eleven new security cases passed, including real sign-out and in-flight revocation. One test incorrectly expected SQLSTATE `23505` for a duplicate customer; the existing API deliberately returns `P0001` with `Customer code already identifies a different request`. The fixture assertion now verifies that exact existing contract.

The substantive failure was in `src/accounting/currencyReportEvidence.ts`: it cast the whole report source to the narrower currency evidence type and compared the entire runtime object across pages. Real PostgREST calls legitimately return different `observed_at` timestamps, so valid complete report collection failed. A new local regression reproduced the failure before the correction.

The founder explicitly approved changing this shared validator only. It now projects the six documented currency-evidence fields before comparison. All existing policy identity, revision, exponent, denominator, provenance, fingerprint, timeline and tenant validation remains. Outer source validation still enforces authorization, snapshot tokens, counts and exact financial totals. New regressions accept timestamp-only changes and reject altered policy/timeline, snapshot token, tenant, reader identity, role and source count. No UI component or unrelated frontend code was changed.

The [next full run 44882730122](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44882730122) passed all eleven new security scenarios and the complete monetary workflow through settlement, source validators and paginated reconciliation. Its final restore failed because the ordinary local `postgres` role cannot transfer managed Auth-schema ownership to `supabase_admin`. The restore harness now uses the existing container-local `supabase_admin` maintenance role for dump/restore and checks that it is the maintenance superuser. It preserves source owners/ACLs and does not grant elevated application privileges or suppress restore errors. Auth user/session/MFA-row digests are also compared without exporting credentials.

## Implemented journey and independent evidence

`tests/aqvora_release_e2e.test.ts` uses three separately created Auth users: OWNER A/maker, distinct OWNER B/checker and a foreign user. Each signs in with a password, enrolls TOTP and obtains an actual Auth-issued AAL2 JWT. The target company has two canonical OWNER memberships. Privileged setup creates test-only mappings and approved-reference fixtures; all customer, account/period, invoice, controlled-cash, receipt and report operations use PostgREST with user JWTs.

1. New company starts with no writer enrollment. An attempted issue fails without journals or receipts. Only this new synthetic company is then enrolled.
2. Customer creation succeeds; a case-insensitive duplicate code fails.
3. Quantity `1500000` × price `101` rounds half-up to gross `152`; discount `2` yields **150 minor units**. Draft creates no journal.
4. Maker A submits; self approval fails; independent OWNER B approves. Source revision/fingerprint bind issuance.
5. The first issue response body is deliberately discarded after a successful HTTP response. Original-intent lookup and three simultaneous exact retries recover one immutable **Dr AR 150 / Cr Revenue 150** journal.
6. A creates a 60-minor cash claim; B confirms the count and independently approves its receipt. Concurrent receipt posting creates one **Dr Cash 60 / Cr AR 60** journal. Outstanding AR is **90**.
7. A second independently confirmed/approved receipt settles **90**. Final AR is **zero**. Three journals/six lines have total debits=credits **300**, closing Cash **150**, AR **0**, Revenue **-150** on a debit-minus-credit basis.
8. Existing integrated runtime validators consume real invoice/cash/receipt responses and collect GL/TB at one row per page. Counts, ordinals, source tokens and currency evidence must agree with certified AR and independent raw SQL arithmetic. Exact currency formatting yields `PKR 1.50` from 150 minor units.
9. Period closure preserves original invoice/receipt replay and every posted source, amount, receipt and audit. A real legacy cashbook sentinel remains unchanged, including its balance, account ledger and draft rows; its company remains unenrolled in V2.

This is API/database/contract E2E. It does not drive the React interface or reproduce a real customer's browser, bank, tax jurisdiction or human approval process.

## Negative and concurrent verification

`tests/aqvora_release_security_e2e.test.ts` adds independent synthetic companies for each case:

- Anonymous, AAL1 and foreign identities; cross-company customer/invoice identifiers; editable `user_metadata` impersonation; denied direct table/private RPC access.
- Self invoice approval, self cash confirmation and self receipt approval; changed trusted service policy after submission.
- Two simultaneous submissions against one revision; changed fingerprint, different actor, different intent on an issued source and reusing an intent for another invoice. No duplicated journal or consumed invoice number.
- Closed-period issue rejection, reopen and exact post-close replay.
- Missing/repeated pages passed through the actual integrated collector; relevant policy changes produce `40001` and require a full restart.
- Privileged fixture corruption of the currency exponent causes invoice, receipt, AR, GL and TB reads to reject with `23514`; repair in `finally` restores the original evidence.
- Posted journal, line, receipt and allocation immutability, including privileged direct SQL attempts and unsupported generic reversal.
- Competing 90-minor settlements against face 150: one succeeds, one fails; allocated 90/outstanding 60, without over-allocation.
- Membership revocation begins before an HTTP issue request; `pg_blocking_pids` proves the real request is waiting, then committed revocation causes denial and zero journals. Existing PG suites also cover the reverse lock ordering and fiscal/disable/session races.
- Actual Auth sign-out removes the live session; the previously issued, still-signed JWT cannot read or issue afterward.

The response-loss test discards the committed response body. It does not simulate every network failure point or certify host crash recovery.

## Migration and logical recovery

No migration files are added or reordered. Existing disposable PostgreSQL tests rehearse both fresh filename order and the documented deployed order, all grants, rollback and logical recovery. The E2E proof records every migration filename and SHA-256, and compares CLI migration versions with that exact sequence.

The new restore test dumps the actual disposable Supabase database in PostgreSQL custom format, including Auth and application data, and restores into a separately named empty database on the same disposable server. It compares complete company source/line/allocation/receipt/audit/policy snapshots and legacy sentinel rows. It starts another loopback-only PostgREST container with a temporary NOINHERIT authenticator role and the same local JWT verification configuration. Original Auth-issued OWNER JWTs must recover original invoice/receipt responses and replay exactly against restored sessions. Foreign/AAL1 access, direct writes and new posting in the closed period must remain denied. Full paginated AR/GL/TB certification must reconcile after restore.

The temporary REST container, database and authenticator role are removed in `finally`. Dumps remain in process memory and are not uploaded. Only a credential-free JSON proof is published as a CI artifact: source head, synthetic company ID, exact amounts, journal/source digest, legacy digest, snapshot token, migration hashes and restore digest.

**Limits:** logical restore uses the same server's existing global roles, extension binaries and local JWT verification material. A new GoTrue service is not started against the restored database and MFA is not re-enrolled there. Separate encrypted Auth signing/MFA key recovery, different-cluster provisioning, physical backup/PITR, hosted backup retention/RPO/RTO, crash consistency and disaster recovery are unverified. This must never be described as physical/PITR certification.

## Legacy/offline and deployment compatibility

- A populated legacy cashbook account/transaction is created through its real authenticated HTTP path. Exact SQL snapshots before/after V2 settlement and restore must match; its `777` balance and account-ledger history are preserved.
- Application regression tests exercise disabled invoice/receipt writers with legacy pending work and an original session-scoped V2 issue key already present. No network request or queue mutation is allowed. Tenant-scoped recovery-bundle restore is idempotent and does not overwrite the original financial intent.
- These queue tests use the test environment's queue adapter. Existing offline, sync, backup/restore and recovery suites also run. Physical browser IndexedDB/SQLite persistence, old installed clients, reconnect replay and service-worker update behavior still require browser/cutover testing.
- The inherited service worker calls `skipWaiting` and `clients.claim`, and deletes other cache versions during activation. This branch does not change it. Real installed-client/cache-update and offline queue fencing are release blockers; source tests cannot prove that an upgrade is safe on a customer's device.
- The integrated UI and staging gates remain unchanged and default OFF. Local RPC verification bypasses neither SQL authorization nor these production defaults, but it does not certify the hosted React flow. Existing preview quota limitations are not a reason to deploy/promote or buy resources.

## Reproducing the checks

Application commands (CI test URL/key are deliberately non-business placeholders):

```sh
npm ci
VITE_SUPABASE_URL=https://supabase-ci.invalid VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_test npm test -- --reporter=dot
npm run typecheck
npm run check:strict
npm run lint
npm run check:size
npm run build
npm audit --audit-level=high
```

Use the checked-in Supabase CLI version **2.121.0** and Docker. The exact tested init, TOTP configuration, excluded services, PostgreSQL test order and cleanup are in `.github/workflows/ci.yml`. Do not link a hosted project. After starting a newly initialized disposable local stack:

```sh
npx supabase status -o json > /tmp/aqvora-local-status.json
db_container=$(docker ps --filter 'name=^/supabase_db_' --format '{{.ID}}')
AQVORA_DISPOSABLE_STACK=1 AQVORA_LOCAL_SUPABASE_STATUS=/tmp/aqvora-local-status.json \
  AQVORA_E2E_RESTORE_CONTAINER="$db_container" AQVORA_E2E_EVIDENCE_PATH=/tmp/aqvora-e2e-evidence.json \
  npm run test:release:e2e
```

`test:release:e2e` deliberately fails when required disposable configuration is absent; it cannot silently turn skipped real-service tests into a green acceptance run. The harness rejects hosted API/DB endpoints before creating Auth users or connecting. Status files contain local secrets: do not commit or upload them.

The Windows editing host has no usable Docker/PostgreSQL runtime. Application/contract/compatibility checks execute there; actual PostgreSQL and real local Supabase/restore execution use disposable GitHub Actions services. Final commit, CI job URLs, exact results, any corrected failures and artifact links are recorded in the companion Draft PR and final engineering report. No hosted or production result is inferred from a passing local job.

## Release gate decision

| Gate | Required disposition |
| --- | --- |
| Local two-OWNER Auth/SQL/contract journey, negatives and logical restore | Require green CI on the final source head and inspect the credential-free proof |
| Hosted isolated staging | NO-GO until explicit founder authorization; none provisioned |
| Browser/UI/installed PWA acceptance | Not performed here; ChatGPT/frontend ownership and separate acceptance remain |
| Currency, service/tax policy and jurisdiction approval | Synthetic fixtures only; founder/accountant approval outstanding |
| Existing-company migration/openings/offline queues/old-client fencing | NO-GO; no enrollment, guessed opening or cutover authorized |
| Production capacity and operational recovery | Small synthetic regression probes only; hosted load, PITR and recovery objectives outstanding |
| Inherited security advisor findings | Review `public.enforce_transaction_author`, `private.ledger_transaction_delta`, `private.protect_transaction_account_posting` mutable search paths before release |
| Production merge/deploy/promotion | NO-GO; no authorization, action or readiness claim |

The next authorized engineering step is review of this local Issue #72 evidence and the remaining acceptance matrix. A hosted/browser rehearsal and any production action require their own founder decisions. All incomplete capabilities remain disabled.
