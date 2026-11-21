import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLegacySnapshot, configureExactPgTypes, LEGACY_SOURCE_TABLES,
  writePrivateSnapshot } from '../scripts/aqvora_legacy_snapshot_export.mjs';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACCOUNT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENTRY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TRANSACTION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CAT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

type DbRow = Record<string, unknown>;
const rows = (): Record<string, DbRow[]> => ({
  transactions: [{ id: TRANSACTION, organization_id: ORG, type: 'income',
    status: 'active', amount_paisa: '20000', business_date: '2026-11-19',
    device_entry_time: '2026-11-19 10:00:00+00', account_id: ACCOUNT,
    idempotency_key: 'synthetic-key', account_posted: true }],
  payment_accounts: [{ id: ACCOUNT, organization_id: ORG,
    current_balance: '200.00', opening_balance: '0.00', balance_paisa: '20000' }],
  account_ledger_entries: [{ id: ENTRY, organization_id: ORG, account_id: ACCOUNT,
    transaction_id: TRANSACTION, amount_paisa: '20000', balance_after_paisa: '20000',
    business_date: '2026-11-19', entry_type: 'INCOME' }],
  account_transfers: [], audit_log: [], transaction_drafts: [],
  categories: [{ id: CAT, organization_id: ORG, kind: 'income' }],
});
const expected = (dataset: Record<string, DbRow[]>) => ({
  transactions: dataset.transactions.length,
  payment_accounts: dataset.payment_accounts.length,
  account_ledger_entries: dataset.account_ledger_entries.length,
  account_transfers: dataset.account_transfers.length,
});

function makeDb(dataset = rows(), options: {bypass?: boolean; rowSecurity?: string;
  onQuery?: (query: string) => void} = {}) {
  const commands: {sql: string; params?: unknown[]}[] = [];
  return {
    commands,
    async query(sql: string, params?: unknown[]) {
      commands.push({ sql, params });
      options.onQuery?.(sql);
      if (sql.includes('transaction_read_only')) {
        return { rows: [{ read_only: 'on', row_security: options.rowSecurity ?? 'on',
          is_superuser: false, can_bypass_rls: options.bypass ?? false,
          captured_at: '2026-11-21 10:00:00+00' }] };
      }
      if (sql.startsWith('SELECT id::text')) {
        return { rows: [{ id: ORG, currency: 'PKR' }] };
      }
      const match = sql.match(/^SELECT \* FROM public\.([a-z_]+) WHERE organization_id = \$1::uuid ORDER BY id$/);
      if (match) return { rows: dataset[match[1]] };
      return { rows: [] };
    },
  };
}
const opts = (d = rows()) => ({
  organizationId: ORG, sourceProjectRef: 'synthetic-source-001',
  expectedCounts: expected(d),
});
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('AQVORA private one-tenant repeatable read snapshot extraction', () => {
  it('checks nonprivileged RLS session, source currency, all seven collections and commits', async () => {
    const db = makeDb();
    const snapshot = await collectLegacySnapshot(db, opts());
    expect(snapshot.schema_version).toBe(1);
    expect(snapshot.organization_id).toBe(ORG);
    expect(snapshot.currency).toBe('PKR');
    expect(snapshot.transactions[0].amount_paisa).toBe('20000');
    expect(db.commands[0].sql).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(db.commands[1].sql).toBe("SET LOCAL TIME ZONE 'UTC'");
    expect(db.commands.at(-1)?.sql).toBe('COMMIT');
    const reads = db.commands.filter(c => c.sql.startsWith('SELECT * FROM public.'));
    expect(reads).toHaveLength(7);
    expect(reads.map(c => c.sql.split('public.')[1].split(' ')[0]))
      .toEqual(LEGACY_SOURCE_TABLES);
    expect(reads.every(c => JSON.stringify(c.params) === JSON.stringify([ORG]))).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('service_role');
  });

  it('fails closed on count drift with ROLLBACK and no accepted snapshot', async () => {
    const db = makeDb();
    await expect(collectLegacySnapshot(db, {
      ...opts(), expectedCounts: { ...opts().expectedCounts, transactions: 999 },
    })).rejects.toThrow(/drift/);
    expect(db.commands.at(-1)?.sql).toBe('ROLLBACK');
    expect(db.commands.some(c => c.sql === 'COMMIT')).toBe(false);
  });

  it('rejects privileged or RLS-disabled database sessions', async () => {
    for (const db of [makeDb(rows(), { bypass: true }),
      makeDb(rows(), { rowSecurity: 'off' })]) {
      await expect(collectLegacySnapshot(db, opts())).rejects.toThrow(/non-privileged/);
      expect(db.commands.at(-1)?.sql).toBe('ROLLBACK');
      expect(db.commands.some(c => c.sql.startsWith('SELECT * FROM public.'))).toBe(false);
    }
  });

  it('rejects cross-tenant and duplicate source identities', async () => {
    const foreign = rows();
    foreign.transactions[0].organization_id = OTHER;
    const db = makeDb(foreign);
    await expect(collectLegacySnapshot(db, opts(foreign))).rejects.toThrow(/cross-tenant/);
    const duplicated = rows();
    duplicated.categories.push({ ...duplicated.categories[0] });
    await expect(collectLegacySnapshot(makeDb(duplicated), opts(duplicated)))
      .rejects.toThrow(/duplicated/);
  });

  it('rejects JS Number rounding on bigint, numeric and date types', async () => {
    const badInt = rows();
    badInt.transactions[0].amount_paisa = 20000;
    await expect(collectLegacySnapshot(makeDb(badInt), opts(badInt)))
      .rejects.toThrow(/Money precision/);
    const badDecimal = rows();
    badDecimal.payment_accounts[0].current_balance = 200;
    await expect(collectLegacySnapshot(makeDb(badDecimal), opts(badDecimal)))
      .rejects.toThrow(/Decimal precision/);
    const badDate = rows();
    badDate.transactions[0].business_date = new Date();
    await expect(collectLegacySnapshot(makeDb(badDate), opts(badDate)))
      .rejects.toThrow(/Date\/time precision/);
  });

  it('rejects a missing expected count or unsafe input before connecting', async () => {
    const db = makeDb();
    await expect(collectLegacySnapshot(db, { ...opts(), organizationId: 'x' }))
      .rejects.toThrow(/UUID/);
    await expect(collectLegacySnapshot(db, { ...opts(), expectedCounts: { transactions: 1 } }))
      .rejects.toThrow(/mandatory/);
    expect(db.commands).toHaveLength(0);
  });

  it('overrides PG date, JSONB and big-number parsers without affecting standard types', () => {
    const exact = configureExactPgTypes({ types: { getTypeParser: (oid: number) =>
      () => 'fallback-' + oid } });
    for (const oid of [20, 1082, 1114, 1184, 1700, 114, 3802]) {
      expect(exact.getTypeParser(oid)('9007199254740993')).toBe('9007199254740993');
    }
    expect(exact.getTypeParser(23)('12')).toBe('fallback-23');
  });

  it('writes only owner-private files outside Git, never overwrites existing data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aqvora-private-test-'));
    temporary.push(dir);
    const path = join(dir, 'source.json');
    const snapshot = await collectLegacySnapshot(makeDb(), opts());
    await writePrivateSnapshot(path, snapshot);
    expect(JSON.parse(await readFile(path, 'utf8')).transactions).toHaveLength(1);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(writePrivateSnapshot(path, snapshot)).rejects.toThrow(/EEXIST/);
    await expect(writePrivateSnapshot('relative.json', snapshot)).rejects.toThrow(/absolute/);
  });
});
