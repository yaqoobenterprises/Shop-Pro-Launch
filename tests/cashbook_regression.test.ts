// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReportTrend, calculateReportTotals } from '../src/lib/reportAnalytics';
import { setSecurityPrincipal } from '../src/lib/security';
import * as cloud from '../src/lib/supabase';
import { ledgerService } from '../src/services/ledgerService';
import { removeOfflineDraft, saveOfflineDraft } from '../src/services/offlineDraftStore';
import type { Transaction, TransactionDraft } from '../src/types/ledger';

const bookDay = '2020-11-19';
const owner = '11000000-0000-4000-8000-000000000001';
const otherOwner = '11000000-0000-4000-8000-000000000002';
const retryOwner = '11000000-0000-4000-8000-000000000003';
const cash = '22000000-0000-4000-8000-000000000001';
const bank = '22000000-0000-4000-8000-000000000002';
const otherCash = '22000000-0000-4000-8000-000000000003';
const retryCash = '22000000-0000-4000-8000-000000000004';

type Entry = Pick<Transaction, 'type' | 'amount_paisa' | 'adjustment_dir'> & { note: string };

// BUSINESS_RULES.md worked example. All expectations below are hand-calculated in minor units.
const workedEntries: Entry[] = [
  { type: 'income', amount_paisa: 10050, note: 'Customer receipt' },
  { type: 'expense', amount_paisa: 3225, note: 'Shop supplies' },
  { type: 'capital_in', amount_paisa: 50000, note: 'Owner contribution' },
  { type: 'withdrawal', amount_paisa: 1200, note: 'Owner drawing' },
  { type: 'adjustment', amount_paisa: 55, adjustment_dir: 'in', note: 'Drawer overage' },
  { type: 'adjustment', amount_paisa: 30, adjustment_dir: 'out', note: 'Drawer shortage' },
];
const workedTotals = {
  income_paisa: 10050, expense_paisa: 3225, net_profit_paisa: 6825,
  capital_in_paisa: 50000, withdrawal_paisa: 1200,
  adjustment_in_paisa: 55, adjustment_out_paisa: 30, transaction_count: 6,
};
const zeroTotals = {
  income_paisa: 0, expense_paisa: 0, net_profit_paisa: 0,
  capital_in_paisa: 0, withdrawal_paisa: 0,
  adjustment_in_paisa: 0, adjustment_out_paisa: 0, transaction_count: 0,
};

describe('worked cashbook in PostgreSQL and the report reader', () => {
  const db = new PGlite({ extensions: { uuid_ossp } });

  async function signIn(userId: string) {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }

  async function createDraft(entry: Entry, date = bookDay) {
    const result = await db.query<{ id: string }>(`
      INSERT INTO transaction_drafts (organization_id, type, amount_paisa, adjustment_dir,
        business_date, raw_text, note, created_by, created_by_name, idempotency_key)
      VALUES (get_auth_org_id(), $1, $2, $3, $4, $5, $5, auth.uid(), 'Operator', $6)
      RETURNING id
    `, [entry.type, entry.amount_paisa, entry.adjustment_dir ?? null, date, entry.note, entry.note]);
    return result.rows[0].id;
  }

  async function post(draftId: string, accountId = cash) {
    const result = await db.query<{ id: string; account_id: string; idempotency_key: string }>(
      'SELECT id, account_id, idempotency_key FROM post_transaction_draft($1, $2)', [draftId, accountId],
    );
    return result.rows[0];
  }

  async function postWorkedDay() {
    for (const entry of workedEntries) await post(await createDraft(entry));
    await db.query(`
      INSERT INTO account_transfers (organization_id, from_account_id, to_account_id, amount, date, created_by)
      VALUES (get_auth_org_id(), $1, $2, 100.00, $3, auth.uid()::text)
    `, [cash, bank, bookDay]);
  }

  async function expectBalances(cashMinor: number, bankMinor: number, cashLegs: number, bankLegs: number) {
    const { rows } = await db.query(`
      SELECT a.id, a.balance_paisa, (100 * a.current_balance)::bigint AS mirror,
        coalesce(sum(m.amount_paisa), 0)::bigint AS movement_sum, count(m.id)::int AS legs
      FROM payment_accounts a LEFT JOIN account_ledger_entries m ON m.account_id = a.id
      WHERE a.id IN ($1, $2) GROUP BY a.id ORDER BY a.id
    `, [cash, bank]);
    expect(rows).toEqual([
      { id: cash, balance_paisa: cashMinor, mirror: cashMinor, movement_sum: cashMinor, legs: cashLegs },
      { id: bank, balance_paisa: bankMinor, mirror: bankMinor, movement_sum: bankMinor, legs: bankLegs },
    ]);
  }

  async function activeEntries(start: string, end: string) {
    const { rows } = await db.query<{ entry: Transaction }>(`
      SELECT to_jsonb(t) AS entry FROM transactions t
      WHERE status = 'active' AND business_date BETWEEN $1 AND $2
    `, [start, end]);
    return rows.map(({ entry }) => entry);
  }

  async function expectReports(daily: typeof workedTotals, monthly = daily) {
    const day = await db.query('SELECT * FROM view_daily_summary WHERE business_date = $1', [bookDay]);
    expect(day.rows).toEqual([expect.objectContaining(daily)]);
    const month = await db.query('SELECT * FROM view_monthly_summary WHERE year = 2020 AND month = 11');
    // The monthly view exposes amount buckets only. Check the count in the TS month reader.
    const { transaction_count: _count, ...monthAmounts } = monthly;
    expect(month.rows).toEqual([expect.objectContaining(monthAmounts)]);

    const dayEntries = await activeEntries(bookDay, bookDay);
    expect(calculateReportTotals(dayEntries)).toEqual(daily);
    expect(calculateReportTotals(await activeEntries('2020-11-01', '2020-11-30'))).toEqual(monthly);
    expect(buildReportTrend(dayEntries, bookDay, bookDay)).toMatchObject([{
      key: bookDay, income_paisa: daily.income_paisa, expense_paisa: daily.expense_paisa,
      net_profit_paisa: daily.net_profit_paisa, transaction_count: daily.transaction_count,
    }]);
  }

  beforeAll(async () => {
    await db.waitReady;
    // PGlite uses Date.now for PostgreSQL's clock. Opening and transfer triggers assign the shop day.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(bookDay + 'T10:00:00Z'));
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"aal":"aal1"}'::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    const migrations = [
      '20261016094952_shop_pro_launch_baseline.sql',
      '20261016122204_enforce_mfa_for_enrolled_users.sql',
      '20261017062800_launch_authorization_hardening.sql',
      '20261020055612_fix_mfa_factor_access_policy.sql',
      '20261020060229_fix_profiles_rls_recursion.sql',
    ];
    for (const filename of migrations) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
    }
    await db.query(`INSERT INTO auth.users(id,email) VALUES
      ($1,'one@example.test'), ($2,'two@example.test'), ($3,'retry@example.test')`, [owner, otherOwner, retryOwner]);
    await db.exec('SET ROLE authenticated');
    await signIn(owner);
    await db.query(`
      INSERT INTO payment_accounts (id, organization_id, name, type, opening_balance) VALUES
        ($1, get_auth_org_id(), 'Fixture cash', 'CASH', 200.00),
        ($2, get_auth_org_id(), 'Fixture bank', 'BANK', 0)
    `, [cash, bank]);
    await signIn(otherOwner);
    await db.query(`
      INSERT INTO payment_accounts (id, organization_id, name, type)
      VALUES ($1, get_auth_org_id(), 'Other cash', 'CASH')
    `, [otherCash]);
    await post(await createDraft({ type: 'income', amount_paisa: 777, note: 'Second shop receipt' }), otherCash);
    await signIn(owner);
  });

  // Each scenario starts from the same accounts and the same separately owned control receipt.
  beforeEach(async () => { await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK'); });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  it('posts an opening once and leaves drafts outside the balance and reports', async () => {
    await createDraft(workedEntries[0]);
    await expectBalances(20000, 0, 1, 0);
    expect((await db.query(`
      SELECT entry_type, amount_paisa, balance_after_paisa, business_date::text FROM account_ledger_entries
    `)).rows).toEqual([{
      entry_type: 'OPENING_BALANCE', amount_paisa: 20000, balance_after_paisa: 20000, business_date: bookDay,
    }]);
    expect((await db.query('SELECT * FROM view_daily_summary')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM view_monthly_summary')).rows).toEqual([]);
  });

  it('reconciles each classified movement and the two legs of one internal transfer', async () => {
    await postWorkedDay();
    await expectBalances(65650, 10000, 8, 1);
    const movements = await db.query(`
      SELECT t.type, t.adjustment_dir, m.amount_paisa, m.balance_after_paisa
      FROM account_ledger_entries m JOIN transactions t ON t.id = m.transaction_id
      WHERE m.account_id = $1 ORDER BY t.amount_paisa DESC
    `, [cash]);
    expect(movements.rows).toEqual([
      { type: 'capital_in', adjustment_dir: null, amount_paisa: 50000, balance_after_paisa: 76825 },
      { type: 'income', adjustment_dir: null, amount_paisa: 10050, balance_after_paisa: 30050 },
      { type: 'expense', adjustment_dir: null, amount_paisa: -3225, balance_after_paisa: 26825 },
      { type: 'withdrawal', adjustment_dir: null, amount_paisa: -1200, balance_after_paisa: 75625 },
      { type: 'adjustment', adjustment_dir: 'in', amount_paisa: 55, balance_after_paisa: 75680 },
      { type: 'adjustment', adjustment_dir: 'out', amount_paisa: -30, balance_after_paisa: 75650 },
    ]);
    const transfers = await db.query(`
      SELECT m.account_id, m.entry_type, m.amount_paisa, m.business_date::text
      FROM account_ledger_entries m JOIN account_transfers t ON m.transfer_id = t.id ORDER BY m.account_id
    `);
    expect(transfers.rows).toEqual([
      { account_id: cash, entry_type: 'TRANSFER_OUT', amount_paisa: -10000, business_date: bookDay },
      { account_id: bank, entry_type: 'TRANSFER_IN', amount_paisa: 10000, business_date: bookDay },
    ]);
    await expectReports(workedTotals);
  });

  it('returns the original receipt on a duplicate draft RPC without another movement', async () => {
    const draft = await createDraft(workedEntries[0]);
    const receipt = await post(draft);
    expect(await post(draft)).toEqual(receipt);
    expect((await db.query('SELECT id FROM transaction_drafts')).rows).toEqual([]);
    await expectBalances(30050, 0, 2, 0);
    await expectReports({ ...zeroTotals, income_paisa: 10050, net_profit_paisa: 10050, transaction_count: 1 });
  });

  it('reverses a voided expense and restores its original economic effect', async () => {
    await postWorkedDay();
    await db.exec("UPDATE transactions SET status = 'voided', void_reason = 'Wrong receipt' WHERE type = 'expense'");
    await expectBalances(68875, 10000, 9, 1);
    await expectReports({ ...workedTotals, expense_paisa: 0, net_profit_paisa: 10050, transaction_count: 5 });
    await db.exec("UPDATE transactions SET status = 'active' WHERE type = 'expense' AND status = 'voided'");
    await expectBalances(65650, 10000, 10, 1);
    await expectReports(workedTotals);
    expect((await db.query('SELECT action, changed_by FROM audit_log ORDER BY action')).rows).toEqual([
      { action: 'restore', changed_by: owner }, { action: 'void', changed_by: owner },
    ]);
  });

  it('reposts a corrected expense of 40.00 and audits a note-only edit without moving money', async () => {
    await postWorkedDay();
    const corrected = { ...workedTotals, expense_paisa: 4000, net_profit_paisa: 6050 };
    await db.exec("UPDATE transactions SET amount_paisa = 4000 WHERE type = 'expense'");
    await expectBalances(64875, 10000, 10, 1);
    await expectReports(corrected);
    await db.exec("UPDATE transactions SET note = 'Corrected supplier name' WHERE type = 'expense'");
    await expectBalances(64875, 10000, 10, 1);
    await expectReports(corrected);
    expect((await db.query(`
      SELECT old_data->>'note' AS old_note, new_data->>'note' AS new_note
      FROM audit_log WHERE action = 'edit' AND old_data->>'note' <> new_data->>'note'
    `)).rows).toEqual([{ old_note: 'Shop supplies', new_note: 'Corrected supplier name' }]);
  });

  it('separates daily totals from monthly activity and keeps a zero-activity date empty', async () => {
    await postWorkedDay();
    await post(await createDraft({ type: 'income', amount_paisa: 975, note: 'Prior day receipt' }, '2020-11-18'));
    await post(await createDraft({ type: 'income', amount_paisa: 123, note: 'Prior month receipt' }, '2020-10-31'));
    await expectReports(workedTotals, { ...workedTotals, income_paisa: 11025, net_profit_paisa: 7800, transaction_count: 7 });
    const quietDay = '2020-11-17';
    expect((await db.query('SELECT * FROM view_daily_summary WHERE business_date = $1', [quietDay])).rows).toEqual([]);
    const emptyEntries = await activeEntries(quietDay, quietDay);
    expect(calculateReportTotals(emptyEntries)).toEqual(zeroTotals);
    expect(buildReportTrend(emptyEntries, quietDay, quietDay)).toMatchObject([{
      key: quietDay, income_paisa: 0, expense_paisa: 0, net_profit_paisa: 0, transaction_count: 0,
    }]);
  });

  it('keeps each shop’s register, movements, accounts and summaries scoped to its owner', async () => {
    await postWorkedDay();
    await expectReports(workedTotals);
    await signIn(otherOwner);
    await expectReports({ ...zeroTotals, income_paisa: 777, net_profit_paisa: 777, transaction_count: 1 });
    expect((await db.query('SELECT id FROM payment_accounts WHERE id IN ($1, $2)', [cash, bank])).rows).toEqual([]);
    expect((await db.query('SELECT account_id, amount_paisa FROM account_ledger_entries')).rows)
      .toEqual([{ account_id: otherCash, amount_paisa: 777 }]);
  });

  describe('A02: the RPC posts the receipt but its reply is lost', () => {
    let recorded: { postings: number; income: number; balance: number };

    beforeAll(async () => {
      // Use a separate shop and autocommit so losing the reply cannot roll back the first posting.
      await signIn(retryOwner);
      await db.query(`INSERT INTO payment_accounts (id, organization_id, name, type, opening_balance)
        VALUES ($1, get_auth_org_id(), 'Retry cash', 'CASH', 200.00)`, [retryCash]);
      const draftId = await createDraft(workedEntries[0]);
      try {
        const { rows: [{ draft }] } = await db.query<{ draft: TransactionDraft }>(
          'SELECT to_jsonb(d) AS draft FROM transaction_drafts d WHERE id = $1', [draftId],
        );
        setSecurityPrincipal({ id: retryOwner, organizationId: draft.organization_id, role: 'OWNER', fullName: 'Operator' });
        await saveOfflineDraft(draft);
        const session = vi.spyOn(cloud, 'hasConfiguredCloudSession').mockResolvedValue(true);
        let lostReply = false;
        const dispatch: typeof fetch = async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          if (url.pathname === '/rest/v1/transaction_drafts' && request.method === 'POST') {
            // This fixture starts with identical local and server copies of the draft.
            expect((await request.json()).id).toBe(draftId);
            return Response.json(draft);
          }
          if (url.pathname === '/rest/v1/rpc/post_transaction_draft' && request.method === 'POST') {
            const args = await request.json();
            const receipt = await post(args.draft_id, args.selected_account_id);
            if (lostReply) return Response.json(receipt);
            lostReply = true;
            throw new TypeError('Reply lost after successful posting');
          }
          if (url.pathname === '/rest/v1/transactions' && request.method === 'GET') {
            const key = url.searchParams.get('idempotency_key')?.replace(/^eq\./, '');
            const result = await db.query('SELECT * FROM transactions WHERE idempotency_key = $1', [key]);
            return Response.json(result.rows);
          }
          if (url.pathname === '/rest/v1/transactions' && request.method === 'POST') {
            expect(url.searchParams.get('on_conflict')).toBe('idempotency_key');
            expect(request.headers.get('Prefer')).toContain('resolution=ignore-duplicates');
            const result = await db.query(`
              INSERT INTO transactions (id, organization_id, type, amount_paisa, account_id, business_date,
                raw_text, note, idempotency_key, created_by, created_by_name)
              SELECT id, organization_id, type, amount_paisa, account_id, business_date,
                raw_text, note, idempotency_key, created_by, created_by_name
              FROM jsonb_populate_record(NULL::transactions, $1)
              ON CONFLICT (idempotency_key) DO NOTHING RETURNING *
            `, [await request.text()]);
            return Response.json(result.rows);
          }
          throw new Error('Unexpected fixture request: ' + request.method + ' ' + url.pathname);
        };
        const client = vi.spyOn(cloud, 'getSupabaseClient').mockReturnValue(createClient(
          'https://cashbook.invalid', 'fixture', { accessToken: async () => 'fixture', global: { fetch: dispatch } },
        ));
        try {
          const result = await ledgerService.postTransactionDraft(draftId, retryCash);
          expect(lostReply).toBe(true);
          expect(result.isQueuedOffline).toBe(false);
          expect(result.transaction?.account_id).toBe(retryCash);
          const resultRows = await db.query<typeof recorded>(`
            SELECT transaction_count AS postings, income_paisa AS income,
              (SELECT balance_paisa FROM payment_accounts WHERE id = $1) AS balance
            FROM view_daily_summary WHERE business_date = $2
          `, [retryCash, bookDay]);
          expect(resultRows.rows).toHaveLength(1);
          recorded = resultRows.rows[0];
          // An unrelated regression must not be swallowed by the known-failure marker.
          expect([
            { postings: 1, income: 10050, balance: 30050 },
            { postings: 2, income: 20100, balance: 40100 },
          ]).toContainEqual(recorded);
        } finally {
          client.mockRestore();
          session.mockRestore();
        }
      } finally {
        await removeOfflineDraft(draftId);
        setSecurityPrincipal(null);
        await signIn(owner);
      }
    });

    // Keep only the accounting assertion inside it.fails. Setup/transport errors must fail the suite.
    it.fails('posts one 100.50 receipt and leaves Cash at 300.50 across the service fallback', () => {
      expect(recorded).toEqual({ postings: 1, income: 10050, balance: 30050 });
    });
  });
});
