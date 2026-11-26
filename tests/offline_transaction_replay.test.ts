// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cloud from '../src/lib/supabase';
import { setSecurityPrincipal } from '../src/lib/security';
import { ledgerService } from '../src/services/ledgerService';
import { dequeueOfflineTransaction, enqueueOfflineTransaction, getOfflineQueue, type QueuedTransaction } from '../src/services/offlineQueue';

const owner = '11000000-0000-4000-8000-000000000001';
const cash = '22000000-0000-4000-8000-000000000001';
const id = '33000000-0000-4000-8000-000000000001';
const key = 'offline-replay-original-intent';

describe('direct offline replay against isolated PostgreSQL', () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  let item: QueuedTransaction;
  let loseReply = false;
  let hideReceipt = false;
  let lookupError = false;
  let corruptReceipt: Record<string, unknown> = {};
  const requests: Request[] = [];

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"aal":"aal1"}'::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    for (const filename of [
      '20261016094952_shop_pro_launch_baseline.sql',
      '20261016122204_enforce_mfa_for_enrolled_users.sql',
      '20261017062800_launch_authorization_hardening.sql',
      '20261020055612_fix_mfa_factor_access_policy.sql',
      '20261020060229_fix_profiles_rls_recursion.sql',
    ]) await db.exec(readFileSync(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2)', [owner, 'replay@example.test']);
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
    await db.query(`INSERT INTO payment_accounts (id, organization_id, name, type, opening_balance)
      VALUES ($1, get_auth_org_id(), 'Synthetic cash', 'CASH', 0)`, [cash]);
  });

  beforeEach(async () => {
    await db.exec('BEGIN');
    const { rows } = await db.query<{ org: string }>('SELECT get_auth_org_id() AS org');
    item = {
      id, idempotencyKey: key, organizationId: rows[0].org, createdBy: owner, accountId: cash,
      type: 'income', amountPaisa: 10050, categoryId: null, businessDate: '2020-11-19',
      deviceEntryTime: '2020-11-19T10:00:00Z', note: 'Receipt A', rawText: 'Service 100.50',
      createdByName: 'Operator', status: 'queued', attempts: 0, createdAt: 1,
    };
    setSecurityPrincipal({ id: owner, organizationId: rows[0].org, role: 'OWNER', fullName: 'Operator' });
    loseReply = hideReceipt = lookupError = false;
    corruptReceipt = {};
    requests.length = 0;
    vi.spyOn(cloud, 'hasConfiguredCloudSession').mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Real supabase-js serializes requests; this adapter executes their conflict semantics
    // under authenticated PostgreSQL RLS. No hosted database or network is used.
    const dispatch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname !== '/rest/v1/transactions') throw new Error('Unexpected table request');
      if (request.method === 'POST') {
        const ignore = request.headers.get('Prefer')?.includes('resolution=ignore-duplicates');
        const conflict = ignore ? 'DO NOTHING' : `DO UPDATE SET
          amount_paisa = EXCLUDED.amount_paisa, status = EXCLUDED.status,
          note = EXCLUDED.note, business_date = EXCLUDED.business_date`;
        const result = await db.query<{ receipt: Record<string, unknown> }>(`
          WITH inserted AS (
            INSERT INTO transactions (id, organization_id, account_id, type, amount_paisa,
              category_id, adjustment_dir, business_date, device_entry_time, note, raw_text,
              status, idempotency_key, created_by, created_by_name)
            SELECT id, organization_id, account_id, type, amount_paisa, category_id,
              adjustment_dir, business_date, device_entry_time, note, raw_text, status,
              idempotency_key, created_by, created_by_name
            FROM jsonb_populate_record(NULL::transactions, $1)
            ON CONFLICT (idempotency_key) ${conflict} RETURNING *
          ) SELECT to_jsonb(inserted) AS receipt FROM inserted`, [await request.text()]);
        if (loseReply) { loseReply = false; throw new TypeError('Lost reply after commit'); }
        return Response.json(hideReceipt ? [] : result.rows.map(({ receipt }) => ({ ...receipt, ...corruptReceipt })));
      }
      if (request.method === 'GET') {
        if (lookupError) return Response.json({ message: 'Lookup unavailable' }, { status: 503 });
        expect(url.searchParams.get('organization_id')).toBe(`eq.${item.organizationId}`);
        expect(url.searchParams.get('idempotency_key')).toBe(`eq.${key}`);
        const result = await db.query<{ receipt: Record<string, unknown> }>(`
          SELECT to_jsonb(t) AS receipt FROM transactions t
          WHERE organization_id = $1 AND idempotency_key = $2`, [item.organizationId, key]);
        return Response.json(hideReceipt ? [] : result.rows.map(({ receipt }) => ({ ...receipt, ...corruptReceipt })));
      }
      throw new Error('Unexpected method');
    };
    vi.spyOn(cloud, 'getSupabaseClient').mockReturnValue(createClient(
      'https://replay.invalid', 'fixture', { accessToken: async () => 'fixture', global: { fetch: dispatch } },
    ));
    await enqueueOfflineTransaction(item);
  });

  afterEach(async () => {
    await dequeueOfflineTransaction(key);
    await db.exec('ROLLBACK');
    setSecurityPrincipal(null);
    vi.restoreAllMocks();
  });
  afterAll(async () => { await db.close(); });

  async function snapshot() {
    return (await db.query(`SELECT
      (SELECT count(*)::int FROM transactions) AS receipts,
      (SELECT balance_paisa FROM payment_accounts WHERE id = '${cash}') AS balance,
      (SELECT coalesce(sum(amount_paisa),0)::bigint FROM account_ledger_entries WHERE account_id = '${cash}') AS movements,
      (SELECT count(*)::int FROM audit_log) AS audits,
      (SELECT status FROM transactions WHERE id = '${id}') AS status`)).rows[0];
  }

  async function commitWithLostReply() {
    loseReply = true;
    const first = await ledgerService.flushOfflineQueue();
    expect(first.syncedCount).toBe(0);
    expect(first.errors).toHaveLength(1);
    expect(await getOfflineQueue()).toHaveLength(1);
    expect(await snapshot()).toMatchObject({ receipts: 1, balance: 10050, movements: 10050 });
  }

  it('confirms an inserted receipt before removing the pending intent', async () => {
    expect(await ledgerService.flushOfflineQueue()).toEqual({ syncedCount: 1, errors: [] });
    expect(await getOfflineQueue()).toEqual([]);
    expect(await snapshot()).toMatchObject({ receipts: 1, balance: 10050, movements: 10050 });
  });

  it('retries a lost acknowledgement without adding money or audit events', async () => {
    await commitWithLostReply();
    const before = await snapshot();
    expect(await ledgerService.flushOfflineQueue()).toEqual({ syncedCount: 1, errors: [] });
    expect(await snapshot()).toEqual(before);
    expect(await getOfflineQueue()).toEqual([]);
  });

  it('never restores a receipt voided after the acknowledgement was lost', async () => {
    await commitWithLostReply();
    await db.query("UPDATE transactions SET status = 'voided', void_reason = 'Correction' WHERE id = $1", [id]);
    const before = await snapshot();
    expect(before).toMatchObject({ balance: 0, movements: 0, status: 'voided' });
    expect(await ledgerService.flushOfflineQueue()).toEqual({ syncedCount: 1, errors: [] });
    expect(await snapshot()).toEqual(before);
  });

  it('preserves a later correction and retains conflicting intent for review', async () => {
    await commitWithLostReply();
    await db.query('UPDATE transactions SET amount_paisa = 20000 WHERE id = $1', [id]);
    const before = await snapshot();
    const retry = await ledgerService.flushOfflineQueue();
    expect(await snapshot()).toEqual(before);
    expect(retry.syncedCount).toBe(0);
    expect(retry.errors).toHaveLength(1);
    expect(await getOfflineQueue()).toEqual([expect.objectContaining({ amountPaisa: 10050, status: 'failed' })]);
  });

  it('two drainers of the same intent leave one receipt and one movement', async () => {
    const results = await Promise.all([ledgerService.flushOfflineQueue(), ledgerService.flushOfflineQueue()]);
    expect(results.every((result) => result.errors.length === 0)).toBe(true);
    expect(await snapshot()).toMatchObject({ receipts: 1, balance: 10050, movements: 10050, audits: 0 });
    expect(await getOfflineQueue()).toEqual([]);
  });

  it.each(['hidden', 'error'])('keeps recovery state when receipt lookup is %s', async (failure) => {
    await commitWithLostReply();
    hideReceipt = failure === 'hidden';
    lookupError = failure === 'error';
    const before = await snapshot();
    const result = await ledgerService.flushOfflineQueue();
    expect(result.syncedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
    expect(await getOfflineQueue()).toHaveLength(1);
  });

  it.each([
    ['organization_id', 'other-shop'], ['created_by', 'other-user'], ['account_id', 'other-account'],
    ['id', 'other-receipt'], ['idempotency_key', 'other-key'], ['amount_paisa', 10051],
    ['business_date', '2020-11-20'], ['type', 'expense'], ['category_id', cash],
    ['adjustment_dir', 'out'], ['note', 'Different note'], ['raw_text', 'Different source'],
    ['device_entry_time', '2020-11-19T11:00:00Z'], ['status', 'unknown'],
  ])('rejects a mismatched %s on both insertion and retry receipts', async (field, value) => {
    corruptReceipt = { [field]: value };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await ledgerService.flushOfflineQueue();
      expect(result.syncedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(await getOfflineQueue()).toHaveLength(1);
    }
    expect(await snapshot()).toMatchObject({ receipts: 1, balance: 10050 });
  });

  it.each(['organizationId', 'createdBy', 'accountId'] as const)('does not infer missing original %s', async (field) => {
    await enqueueOfflineTransaction({ ...item, [field]: undefined });
    const result = await ledgerService.flushOfflineQueue();
    expect(result.syncedCount).toBe(0);
    expect(await getOfflineQueue()).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it('leaves another creator or shop queued without a cloud request', async () => {
    for (const changed of [{ createdBy: 'other-user' }, { organizationId: 'other-shop' }]) {
      await enqueueOfflineTransaction({ ...item, ...changed });
      expect(await ledgerService.flushOfflineQueue()).toEqual({ syncedCount: 0, errors: [] });
      expect(await getOfflineQueue()).toHaveLength(1);
      expect(requests).toHaveLength(0);
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('retains invalid amount %s without posting', async (amountPaisa) => {
    await enqueueOfflineTransaction({ ...item, amountPaisa });
    expect((await ledgerService.flushOfflineQueue()).syncedCount).toBe(0);
    expect(await getOfflineQueue()).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it.each(['signed-out', 'expired'])('does not replay with a %s session', async (state) => {
    if (state === 'signed-out') setSecurityPrincipal(null);
    else vi.mocked(cloud.hasConfiguredCloudSession).mockResolvedValue(false);
    expect(await ledgerService.flushOfflineQueue()).toEqual({ syncedCount: 0, errors: [] });
    expect(await getOfflineQueue()).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });
});
