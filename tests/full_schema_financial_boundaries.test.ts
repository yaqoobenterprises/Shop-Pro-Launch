// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const owner = '11000000-0000-4000-8000-000000000001';
const other = '11000000-0000-4000-8000-000000000002';
const cash = '22000000-0000-4000-8000-000000000001';
const otherCash = '22000000-0000-4000-8000-000000000002';
const day = '2020-11-19';

for (const migrationOrder of ['fresh install', 'deployed-order rehearsal'] as const) {
describe(`complete migration chain: financial authorization (${migrationOrder})`, () => {
  const db = new PGlite({ extensions: { uuid_ossp } });
  let org = '';
  let otherOrg = '';
  async function signIn(user: string, aal = 'aal1') {
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.query("SELECT set_config('request.jwt.claim.aal', $1, false)", [aal]);
  }
  async function denied(sql: string, params: unknown[] = []) {
    await db.exec('SAVEPOINT denied_attempt');
    try { await expect(db.query(sql, params)).rejects.toThrow(); }
    finally { await db.exec('ROLLBACK TO SAVEPOINT denied_attempt'); }
  }
  async function draft(user = owner) {
    const { rows } = await db.query<{ id: string }>(`
      INSERT INTO transaction_drafts (organization_id, type, amount_paisa, business_date,
        raw_text, created_by, created_by_name, idempotency_key)
      VALUES (get_auth_org_id(), 'income', 10050, $1, 'Synthetic sale', $2, 'Operator', gen_random_uuid()::text)
      RETURNING id`, [day, user]);
    return rows[0].id;
  }
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT jsonb_build_object('aal', current_setting('request.jwt.claim.aal', true)) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
    `);
    const migrations = [
      '20261016094952_shop_pro_launch_baseline.sql',
      '20261016122204_enforce_mfa_for_enrolled_users.sql',
      '20261020055612_fix_mfa_factor_access_policy.sql',
      '20261020060229_fix_profiles_rls_recursion.sql',
      '20261116195744_ai_accountant_chat_sync.sql',
      '20261116195839_ai_accountant_chat_sync_indexes.sql',
    ];
    const pending = '20261017062800_launch_authorization_hardening.sql';
    if (migrationOrder === 'fresh install') migrations.splice(2, 0, pending);
    else migrations.push(pending);
    migrations.push('20261117054753_ledgermate_multi_conversation_history.sql');
    migrations.push('20261120054717_close_financial_authorization_gaps.sql');
    for (const filename of migrations) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
    }
    await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4)',
      [owner, 'one@example.test', other, 'two@example.test']);
    await signIn(owner);
    org = (await db.query<{ id: string }>('SELECT get_auth_org_id() AS id')).rows[0].id;
    await db.query(`INSERT INTO payment_accounts (id, organization_id, name, type, opening_balance)
      VALUES ($1, $2, 'Fixture cash', 'CASH', 0)`, [cash, org]);
    await signIn(other);
    otherOrg = (await db.query<{ id: string }>('SELECT get_auth_org_id() AS id')).rows[0].id;
    await db.query(`INSERT INTO payment_accounts (id, organization_id, name, type, opening_balance)
      VALUES ($1, $2, 'Other cash', 'CASH', 0)`, [otherCash, otherOrg]);
    await signIn(owner);
  });
  beforeEach(async () => { await db.exec('BEGIN'); await signIn(owner); });
  afterEach(async () => { await db.exec('ROLLBACK'); });
  afterAll(async () => { await db.close(); });

  it('uses canonical demotion after sign-in when authorizing transaction edits', async () => {
    const posted = (await db.query<{ id: string }>(
      'SELECT id FROM post_transaction_draft($1,$2)', [await draft(), cash])).rows[0].id;
    await db.exec('RESET ROLE');
    await db.query("UPDATE organization_members SET role = 'CASHIER' WHERE organization_id = $1 AND user_id = $2", [org, owner]);
    await signIn(owner);
    await db.query('SELECT ensure_my_profile()');
    expect((await db.query('SELECT role FROM shop_members WHERE user_id = $1', [owner])).rows)
      .toEqual([{ role: 'CASHIER' }]);
    expect((await db.query("UPDATE transactions SET note = 'unauthorized edit' WHERE id = $1", [posted])).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM transactions WHERE id = $1', [posted])).rows).toHaveLength(1);
  });

  it('retains authorized owner and manager edits on existing receipts', async () => {
    const posted = (await db.query<{ id: string }>(
      'SELECT id FROM post_transaction_draft($1,$2)', [await draft(), cash])).rows[0].id;
    expect((await db.query("UPDATE transactions SET note = 'Owner review' WHERE id = $1", [posted])).rowCount).toBe(1);
    await db.exec('RESET ROLE');
    await db.query("UPDATE organization_members SET role = 'MANAGER' WHERE organization_id = $1 AND user_id = $2", [org, owner]);
    await signIn(owner);
    expect((await db.query("UPDATE transactions SET note = 'Manager review' WHERE id = $1", [posted])).rowCount).toBe(1);
  });

  it('rejects inactive membership on posting and receipt retries', async () => {
    const draftId = await draft();
    const posted = (await db.query('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash])).rows;
    expect(posted).toHaveLength(1);
    await db.exec('RESET ROLE');
    await db.query('UPDATE organization_members SET is_active = false WHERE organization_id = $1 AND user_id = $2', [org, owner]);
    await signIn(owner);
    await db.query('SELECT ensure_my_profile()');
    await denied('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash]);
    expect((await db.query('SELECT id FROM transactions WHERE id = $1', [posted[0].id])).rows).toHaveLength(0);
  });

  it('does not disclose a cross-company receipt by idempotency retry', async () => {
    await signIn(other);
    const draftId = await draft(other);
    await db.query('SELECT id FROM post_transaction_draft($1,$2)', [draftId, otherCash]);
    await signIn(owner);
    await denied('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash]);
    expect((await db.query('SELECT id FROM transactions WHERE organization_id = $1', [otherOrg])).rows).toHaveLength(0);
  });

  it('requires AAL2 for enrolled users even through the definer posting RPC', async () => {
    const draftId = await draft();
    await db.exec('RESET ROLE');
    await db.query('INSERT INTO auth.mfa_factors(id,user_id,status) VALUES (gen_random_uuid(),$1,$2)', [owner, 'verified']);
    await signIn(owner, 'aal1');
    await denied('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash]);
    await signIn(owner, 'aal2');
    expect((await db.query('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash])).rows).toHaveLength(1);
    await signIn(owner, 'aal1');
    await denied('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash]);
    await signIn(owner, 'aal2');
    expect((await db.query('SELECT id FROM post_transaction_draft($1,$2)', [draftId, cash])).rows).toHaveLength(1);
  });

  it('blocks direct balance changes but permits owner account metadata edits', async () => {
    const grants = (await db.query(`SELECT
      has_column_privilege('authenticated','payment_accounts','balance_paisa','UPDATE') AS minor,
      has_column_privilege('authenticated','payment_accounts','current_balance','UPDATE') AS mirror,
      has_column_privilege('authenticated','payment_accounts','opening_balance','UPDATE') AS opening`)).rows[0];
    expect(grants).toEqual({ minor: false, mirror: false, opening: false });
    await denied('UPDATE payment_accounts SET balance_paisa = 999 WHERE id = $1', [cash]);
    await denied('UPDATE payment_accounts SET current_balance = 9.99 WHERE id = $1', [cash]);
    await denied('UPDATE payment_accounts SET opening_balance = 9.99 WHERE id = $1', [cash]);
    expect((await db.query("UPDATE payment_accounts SET name = 'Renamed cash' WHERE id = $1", [cash])).rowCount).toBe(1);
    const { rows } = await db.query('SELECT balance_paisa, current_balance, opening_balance FROM payment_accounts WHERE id = $1', [cash]);
    expect(rows).toEqual([{ balance_paisa: 0, current_balance: '0.00', opening_balance: '0.00' }]);
  });
});
}
