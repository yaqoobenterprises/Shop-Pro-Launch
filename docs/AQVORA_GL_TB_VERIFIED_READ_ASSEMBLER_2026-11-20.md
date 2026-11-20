# AQVORA V2 — fail-closed General Ledger / Trial Balance read assembly

**Status:** isolated pure client-side integration contract; backend source is Codex Draft PR #53. No RPC route enabled, no production/project database access, no writer activation, and no global release.

## Files and roles

| File | Purpose |
| --- | --- |
| `src/accounting/verifiedReadValidation.ts` | Runtime validation of untrusted JSON: source metadata, authorization role, V2 basis, company/currency/date identity, SHA256 change token, arbitrary-precision exact decimal amounts and page metadata. |
| `src/accounting/verifiedReadCollection.ts` | All-or-nothing bounded pagination, using the same source token and returned cursor on subsequent calls. Detects drift, duplicate/missing row ordinals, cursor loops, incomplete terminal pages and over-limit reports. |
| `src/accounting/verifiedGeneralLedger.ts` | Validates one posting account, line provenance, exact side amounts, carried running balance across pages, opening+movement=closing and whole-result totals. |
| `src/accounting/verifiedTrialBalance.ts` | Validates account/row identity and uniqueness, opening/dr/cr/closing row arithmetic, whole-result debits/credits and exact account sum equality with server totals. |
| `tests/aqvora_verified_read_assembler.test.ts` | Network-independent positive, negative and failure tests for these contracts. |

### Usage (in a future isolated staging client, not enabled here)

```ts
const report = await readVerifiedTrialBalance(
  async (args) => {
    const { data, error } = await stagingSupabaseClient.rpc(
      "read_aqvora_trial_balance", args,
    );
    if (error) throw error;
    return data;
  },
  {
    p_organization_id: selectedAuthorizedCompanyId,
    p_currency: verifiedCompanyCurrency,
    p_from_date: "2026-11-01",
    p_to_date: "2026-11-30",
  },
  { pageSize: 100, maxPages: 100, maxRows: 20_000 },
);
```

Only wire up with reviewed isolated staging env/project gates and authenticated cloud company context. Runtime validation **does not authenticate** the RPC or substitute for database session/AAL2/tenant authorization, and cannot itself prove that a forged browser RPC response came from PostgreSQL.

### Guarantees & deliberate limits

- No fallback to demo/sample numbers after HTTP errors, `40001` source change, `42501` access denial, malformed payload, validation failure, incomplete page set, cursor cycle, overlimit or missing posting provenance.
- Only results using source `basis=v2_posted_journals`, `legacy_included=false`, `opening_migration_verified=false` and `source_complete=true` are assembled. UI must show these limitations rather than claiming full accounting for a migrated existing company.
- Amounts parse to **BigInt** with no 64-bit bound: SQL per-company totals may exceed signed BIGINT, while individual posted lines remain signed BIGINT-constrained by the database.
- No automatic retry that could accidentally mix pages. A `40001` error propagates; caller may discard everything and start a completely new report with a bounded retry policy.
- Changes of authorized user/role, source fingerprint, company/currency/dates, source counts, page totals or account identity during collection fail closed. Source token is a **change detector, not proof of permission or tamper-evident signature**.
- Records that cannot be fully read within configured `pageSize/maxPages/maxRows` produce **an error, not a truncated report**. Defaults: 100 rows/page, maximum 100 pages/20,000 rows.
- `readVerifiedGeneralLedger` checks running balance on every returned journal line; `readVerifiedTrialBalance` recalculates all displayed account totals. These are client-side checks on SQL-authorized, certified source fields; no accrual P&L/Balance Sheet is certified by these functions.

### Pending acceptance before production

1. Deliberately reconcile PR #53 backend contracts and the separate #50 UI/administration history. Do not blindly merge sibling PR stacks.
2. Isolated hosted Supabase Auth/PostgREST testing with real staging project and source data (not existing company projects); authenticated AAL2 + revoked sessions + company A vs B.
3. Historical opening migration, reconciliation of all legacy books/offline queues and approved fiscal/year-end policy.
4. Large-book service performance for repeated source certification scans and paging; query/load plan and possibly transactional/materialized export.
5. Table/audit RLS, policy and role review; three inherited security-advisor warnings; restore and emergency rollback exercise.
6. Minimal read-only functional GL/TB routes with loading, forbidden, incomplete, drift/restart, source-basis warnings and accessible export behavior. UI finishing stays paused by founder.

**No database migration, company enrollment, or SQL writer/API change is made here.**
