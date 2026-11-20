// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOrg = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = "11111111-1111-4111-8111-111111111111";
const manager = "22222222-2222-4222-8222-222222222222";
const cashier = "33333333-3333-4333-8333-333333333333";
const otherOwner = "44444444-4444-4444-8444-444444444444";
const cash = "55555555-5555-4555-8555-555555555555";
const sales = "66666666-6666-4666-8666-666666666666";
const foreign = "77777777-7777-4777-8777-777777777777";
const receivable = "88888888-8888-4888-8888-888888888888";
const payable = "99999999-9999-4999-8999-999999999999";
const inventory = "aaaaaaaa-1111-4111-8111-111111111111";
const day = "2026-11-20";

const validLines = [
  { account_id: cash, debit_minor: "10050", credit_minor: "0" },
  { account_id: sales, debit_minor: "0", credit_minor: "10050" },
];
type Receipt = { journal_id: string; organization_id: string; intent_key: string; total_minor: string };

describe("AQVORA isolated PostgreSQL posting engine", () => {
  const db = new PGlite();
  let sequence = 0;
  const key = () => `case-${++sequence}`;
  const post = async (intent: string, lines: unknown = validLines, company = org, date = day) => {
    const result = await db.query<{ receipt: Receipt }>(
      "SELECT public.post_aqvora_journal($1,$2,$3,$4::jsonb) AS receipt",
      [company, intent, date, JSON.stringify(lines)],
    );
    return result.rows[0].receipt;
  };
  const lookup = async (intent: string, company = org) => {
    const result = await db.query<{ receipt: Receipt | null }>(
      "SELECT public.lookup_aqvora_receipt($1,$2) AS receipt", [company, intent],
    );
    return result.rows[0].receipt;
  };
  const asUser = async (user: string, aal = "aal2") => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.query("SELECT set_config('request.jwt.claim.aal',$1,false)", [aal]);
    await db.query("SELECT set_config('request.jwt.claim.session_id',$1,false)", [user]);
    await db.exec("SET ROLE authenticated");
  };
  const asAdmin = async () => db.exec("RESET ROLE");

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal', true),
             'session_id',current_setting('request.jwt.claim.session_id', true)) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY, currency text);
      CREATE TABLE public.organization_members (
        organization_id uuid NOT NULL, user_id uuid NOT NULL,
        role text NOT NULL, is_active boolean NOT NULL,
        PRIMARY KEY (organization_id,user_id));
      GRANT SELECT ON public.organization_members TO authenticated;
      GRANT USAGE ON SCHEMA private TO authenticated;
      INSERT INTO auth.users VALUES
        ('${owner}'),('${manager}'),('${cashier}'),('${otherOwner}');
      INSERT INTO auth.sessions VALUES
        ('${owner}','${owner}'),('${manager}','${manager}'),
        ('${cashier}','${cashier}'),('${otherOwner}','${otherOwner}');
      INSERT INTO public.organizations VALUES ('${org}','PKR'),('${otherOrg}','PKR');
      INSERT INTO public.organization_members VALUES
        ('${org}','${owner}','OWNER',true),
        ('${org}','${manager}','MANAGER',true),
        ('${org}','${cashier}','CASHIER',true),
        ('${otherOrg}','${otherOwner}','OWNER',true);
    `);
    for (const filename of [
      "20261120010000_aqvora_journal_schema.sql",
      "20261120010100_aqvora_posting_rpc.sql",
      "20261120010200_aqvora_reversal_rpc.sql",
      "20261120103750_aqvora_admin_schema.sql",
      "20261120103757_aqvora_admin_account_api.sql",
      "20261120103805_aqvora_admin_period_api.sql",
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8"));
    }
    await db.exec(`
      INSERT INTO public.aqvora_enabled_companies (organization_id)
        VALUES ('${org}'),('${otherOrg}');
      INSERT INTO public.aqvora_periods (organization_id,starts_on,ends_on,state)
        VALUES ('${org}','2026-11-01','2026-11-30','open'),
               ('${otherOrg}','2026-11-01','2026-11-30','open');
      INSERT INTO public.aqvora_accounts
        (organization_id,id,code,name,account_class,normal_side,is_posting)
        VALUES ('${org}','${cash}','1000','Cash','asset','debit',true),
               ('${org}','${sales}','4000','Sales','revenue','credit',true),
               ('${otherOrg}','${foreign}','1000','Other cash','asset','debit',true);
      INSERT INTO public.aqvora_accounts
        (organization_id,id,code,name,account_class,normal_side,is_posting,control_role)
        VALUES ('${org}','${receivable}','1100','Receivables','asset','debit',true,'receivable'),
               ('${org}','${payable}','2100','Payables','liability','credit',true,'payable'),
               ('${org}','${inventory}','1200','Inventory','asset','debit',true,'inventory');
    `);
  });
  afterEach(asAdmin);
  afterAll(async () => db.close());

  it("posts exact balanced minor units and persists matching receipt and audit", async () => {
    await asUser(owner);
    const intent = key();
    const receipt = await post(intent);
    expect(receipt).toMatchObject({ organization_id: org, intent_key: intent, total_minor: "10050" });
    expect(await lookup(intent)).toMatchObject(receipt);
    await asAdmin();
    const lines = await db.query("SELECT debit_minor,credit_minor FROM public.aqvora_journal_lines WHERE journal_id=$1 ORDER BY line_no", [receipt.journal_id]);
    expect(lines.rows).toEqual([
      { debit_minor: 10050, credit_minor: 0 }, { debit_minor: 0, credit_minor: 10050 },
    ]);
    const audit = await db.query("SELECT action,actor_id FROM public.aqvora_journal_audit WHERE journal_id=$1", [receipt.journal_id]);
    expect(audit.rows).toEqual([{ action: "POST", actor_id: owner }]);
  });

  it("rejects one-unit imbalance, floats, invalid sides, and overflow without writes", async () => {
    await asUser(owner);
    const intent = key();
    await expect(post(intent, [{ ...validLines[0] }, { ...validLines[1], credit_minor: "10049" }])).rejects.toThrow("unbalanced");
    await expect(post(intent, [{ ...validLines[0], debit_minor: 100.5 }, validLines[1]])).rejects.toThrow("canonical");
    await expect(post(intent, [{ ...validLines[0], credit_minor: "1" }, validLines[1]])).rejects.toThrow("exactly one side");
    await expect(post(intent, [{ ...validLines[0], debit_minor: "9223372036854775808" }, validLines[1]])).rejects.toThrow();
    expect(await lookup(intent)).toBeNull();
  });

  it("keeps totals exact above JavaScript's safe integer range", async () => {
    await asUser(owner);
    const amount = "9007199254740993";
    const receipt = await post(key(), [
      { ...validLines[0], debit_minor: amount },
      { ...validLines[1], credit_minor: amount },
    ]);
    expect(receipt.total_minor).toBe(amount);
    await asAdmin();
    const total = await db.query<{ amount: string }>(
      "SELECT sum(debit_minor)::text AS amount FROM public.aqvora_journal_lines WHERE journal_id=$1",
      [receipt.journal_id],
    );
    expect(total.rows[0].amount).toBe(amount);
  });

  it("rejects unverified control accounts and arbitrary source references", async () => {
    await asUser(owner);
    for (const accountId of [receivable, payable, inventory]) {
      await expect(post(key(), [
        { account_id: accountId, debit_minor: "1", credit_minor: "0",
          party_id: "pretend-party", open_item_id: "pretend-item", stock_movement_id: "pretend-stock" },
        { ...validLines[1], credit_minor: "1" },
      ])).rejects.toThrow("Verified source posting");
    }
    await expect(post(key(), [
      { ...validLines[0], debit_minor: "1", party_id: "pretend-party" },
      { ...validLines[1], credit_minor: "1" },
    ])).rejects.toThrow("Unverified source references");
  });

  it("recovers a lost response, rejects changed payload, and serializes retry keys", async () => {
    await asUser(owner);
    const intent = key();
    const receipt = await post(intent);
    expect(await post(intent)).toEqual(receipt);
    await expect(post(intent, [{ ...validLines[0], debit_minor: "1" }, { ...validLines[1], credit_minor: "1" }]))
      .rejects.toThrow("Idempotency key payload mismatch");
    const concurrent = key();
    const results = await Promise.all([post(concurrent), post(concurrent)]);
    expect(results[0]).toEqual(results[1]);
    await asAdmin();
    const count = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1 AND intent_key=$2", [org, concurrent]);
    expect(count.rows[0].n).toBe(1);
  });

  it("holds closed periods and lets authorized callers recover earlier receipts", async () => {
    await asUser(owner);
    const earlier = key();
    const receipt = await post(earlier);
    await asAdmin();
    await db.query("UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1", [org]);
    await asUser(owner);
    await expect(post(key())).rejects.toThrow("closed");
    expect(await post(earlier)).toEqual(receipt);
    expect(await lookup(earlier)).toEqual(receipt);
    await asAdmin();
    await db.query("UPDATE public.aqvora_periods SET state='open' WHERE organization_id=$1", [org]);
  });

  it("defaults closed to existing companies and retains safe receipt recovery after disablement", async () => {
    await asUser(owner);
    const earlier = key();
    const receipt = await post(earlier);
    await asAdmin();
    await db.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1", [org]);
    await asUser(owner);
    await expect(post(key())).rejects.toThrow("not enabled");
    expect(await lookup(earlier)).toEqual(receipt);
    expect(await post(earlier)).toEqual(receipt);
    await asAdmin();
    await db.query("INSERT INTO public.aqvora_enabled_companies (organization_id) VALUES ($1)", [org]);
  });

  it("rejects revoked sessions and currency drift before writing", async () => {
    await asUser(owner);
    const earlier = key();
    const receipt = await post(earlier);
    await asAdmin();
    await db.query("DELETE FROM auth.sessions WHERE id=$1", [owner]);
    await asUser(owner);
    await expect(post(key())).rejects.toThrow("revoked or missing");
    await expect(lookup(earlier)).rejects.toThrow("revoked or missing");
    expect((await db.query("SELECT * FROM public.aqvora_journals WHERE id=$1", [receipt.journal_id])).rows).toEqual([]);
    await asAdmin();
    await db.query("INSERT INTO auth.sessions (id,user_id) VALUES ($1,$1)", [owner]);
    await db.query("UPDATE public.organizations SET currency='USD' WHERE id=$1", [org]);
    await asUser(owner);
    await expect(post(key())).rejects.toThrow("currency differs");
    await asAdmin();
    await db.query("UPDATE public.organizations SET currency='PKR' WHERE id=$1", [org]);
  });

  it("enforces canonical role, active membership, MFA, and tenant isolation", async () => {
    await asUser(cashier);
    await expect(post(key())).rejects.toThrow("not authorized");
    await asUser(manager, "aal1");
    await expect(post(key())).rejects.toThrow("MFA");
    await asUser(manager);
    const intent = key();
    const receipt = await post(intent);
    await expect(post(key(), validLines, otherOrg)).rejects.toThrow("not authorized");
    await expect(post(key(), [{ ...validLines[0], account_id: foreign }, validLines[1]])).rejects.toThrow("foreign");
    await asAdmin();
    await db.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2", [org, manager]);
    await asUser(manager);
    await expect(lookup(intent)).rejects.toThrow("not authorized");
    await expect(post(intent)).rejects.toThrow("not authorized");
    await asAdmin();
    await db.query("UPDATE public.organization_members SET role='MANAGER', is_active=false WHERE organization_id=$1 AND user_id=$2", [org, manager]);
    await asUser(manager);
    await expect(post(key())).rejects.toThrow("not authorized");
    await asAdmin();
    await db.query("UPDATE public.organization_members SET is_active=true WHERE organization_id=$1 AND user_id=$2", [org, manager]);
    await asUser(otherOwner);
    await expect(lookup(intent)).rejects.toThrow("not authorized");
    expect(receipt.organization_id).toBe(org);
    expect((await db.query("SELECT * FROM public.aqvora_journals WHERE organization_id=$1", [org])).rows).toEqual([]);
    await asUser(owner, "aal1");
    expect((await db.query("SELECT * FROM public.aqvora_posting_receipts WHERE organization_id=$1", [org])).rows).toEqual([]);
    await asUser(cashier);
    expect((await db.query("SELECT * FROM public.aqvora_journals WHERE organization_id=$1", [org])).rows).toEqual([]);
  });

  it("blocks direct writes and enforces company-scoped chart and fiscal constraints", async () => {
    await asUser(owner);
    await expect(db.query(`INSERT INTO public.aqvora_periods
      (organization_id,starts_on,ends_on,state) VALUES ($1,'2026-12-01','2026-12-31','open')`, [org])).rejects.toThrow();
    await expect(db.query("DELETE FROM public.aqvora_posting_receipts WHERE organization_id=$1", [org])).rejects.toThrow();
    await asAdmin();
    await expect(db.query(`INSERT INTO public.aqvora_periods
      (organization_id,starts_on,ends_on,state) VALUES ($1,'2026-11-15','2026-12-15','open')`, [org]))
      .rejects.toThrow("overlap");
    await expect(db.query(`INSERT INTO public.aqvora_accounts
      (organization_id,code,name,account_class,normal_side,is_posting)
      VALUES ($1,'1000','Duplicate','asset','debit',true)`, [org])).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.aqvora_accounts
      (organization_id,code,name,account_class,normal_side,is_posting,parent_id)
      VALUES ($1,'1001','Foreign parent','asset','debit',true,$2)`, [org, foreign])).rejects.toThrow();
    await expect(db.query("UPDATE public.aqvora_accounts SET account_class='expense' WHERE organization_id=$1 AND id=$2", [org, cash]))
      .rejects.toThrow("immutable");
    await expect(db.query("UPDATE public.aqvora_periods SET ends_on='2026-12-01' WHERE organization_id=$1", [org]))
      .rejects.toThrow("immutable");
  });

  it("keeps posted records immutable and appends one linked reversal", async () => {
    await asUser(owner);
    const original = await post(key());
    await asAdmin();
    await db.query("UPDATE public.aqvora_accounts SET is_active=false WHERE organization_id=$1 AND id=$2", [org, cash]);
    await asUser(owner);
    const reversalKey = key();
    const reverse = async () => (await db.query<{ receipt: Receipt }>(
      "SELECT public.reverse_aqvora_journal($1,$2,$3,$4,$5) AS receipt",
      [org, original.journal_id, reversalKey, day, "Incorrect entry"],
    )).rows[0].receipt;
    const reversal = await reverse();
    expect(await reverse()).toEqual(reversal);
    await expect(db.query("UPDATE public.aqvora_journals SET total_minor=1 WHERE id=$1", [original.journal_id])).rejects.toThrow();
    await asAdmin();
    await expect(db.query("DELETE FROM public.aqvora_journal_lines WHERE journal_id=$1", [original.journal_id])).rejects.toThrow("immutable");
    const totals = await db.query<{ debit: string; credit: string }>(`
      SELECT sum(CASE WHEN account_id=$1 THEN debit_minor-credit_minor ELSE 0 END)::text AS debit,
             sum(CASE WHEN account_id=$2 THEN credit_minor-debit_minor ELSE 0 END)::text AS credit
      FROM public.aqvora_journal_lines WHERE journal_id IN ($3,$4)
    `, [cash, sales, original.journal_id, reversal.journal_id]);
    expect(totals.rows[0]).toEqual({ debit: "0", credit: "0" });
    const linked = await db.query("SELECT reversal_of FROM public.aqvora_journals WHERE id=$1", [reversal.journal_id]);
    expect(linked.rows[0].reversal_of).toBe(original.journal_id);
    await asUser(owner);
    await expect(db.query(
      "SELECT public.reverse_aqvora_journal($1,$2,$3,$4,$5)",
      [org, original.journal_id, key(), day, "Again"],
    )).rejects.toThrow();
    await asAdmin();
    await db.query("UPDATE public.aqvora_accounts SET is_active=true WHERE organization_id=$1 AND id=$2", [org, cash]);
  });

  it("administers accounts and periods through audited owner-only RPCs", async () => {
    await asUser(manager);
    await expect(db.query("SELECT public.create_aqvora_period($1,'2026-12-01','2026-12-31')", [org]))
      .rejects.toThrow("active owner");
    await asUser(owner, "aal1");
    await expect(db.query("SELECT public.create_aqvora_account($1,'3000','Equity','equity','credit',null,true)", [org]))
      .rejects.toThrow("MFA");
    await asUser(owner);
    await expect(db.query(
      "SELECT public.archive_aqvora_account($1,$2,1,'Remove control')", [org, receivable],
    )).rejects.toThrow("Control accounts are protected");
    const account = await db.query<{ id: string; revision: string }>(
      "SELECT id,revision FROM public.create_aqvora_account($1,'3000','Equity','equity','credit',null,true)", [org]);
    const accountId = account.rows[0].id;
    const renamed = await db.query<{ revision: string }>(
      "SELECT revision FROM public.edit_aqvora_account($1,$2,1,'3000','Owner equity',null)",
      [org, accountId]);
    expect(Number(renamed.rows[0].revision)).toBe(2);
    await expect(db.query("SELECT * FROM public.edit_aqvora_account($1,$2,1,'3000','Stale',null)",
      [org, accountId])).rejects.toThrow("stale");
    const period = await db.query<{ id: string }>(
      "SELECT id FROM public.create_aqvora_period($1,'2026-12-01','2026-12-31')", [org]);
    const periodId = period.rows[0].id;
    const closed = await db.query<{ state: string }>(
      "SELECT state FROM public.close_aqvora_period($1,$2,1,'Year end')", [org, periodId]);
    expect(closed.rows[0].state).toBe("closed");
    const reopened = await db.query<{ reopen_count: number }>(
      "SELECT reopen_count FROM public.reopen_aqvora_period($1,$2,2,'Adjustment')", [org, periodId]);
    expect(reopened.rows[0].reopen_count).toBe(1);
    const archived = await db.query<{ is_active: boolean }>(
      "SELECT is_active FROM public.archive_aqvora_account($1,$2,2,'No longer used')",
      [org, accountId]);
    expect(archived.rows[0].is_active).toBe(false);
    const audit = await db.query<{ action: string }>(
      "SELECT action FROM public.list_aqvora_admin_events($1)", [org]);
    expect(audit.rows.map((row) => row.action)).toContain("PERIOD_REOPEN");
    await asAdmin();
    const retiredHeading = await db.query<{ id: string }>(`
      INSERT INTO public.aqvora_accounts
        (organization_id,code,name,account_class,normal_side,is_posting,is_active)
      VALUES ($1,'3100','Retired heading','equity','credit',false,false) RETURNING id`, [org]);
    await asUser(owner);
    await expect(db.query(
      "SELECT public.create_aqvora_account($1,'3101','Invalid child','equity','credit',$2,true)",
      [org, retiredHeading.rows[0].id])).rejects.toThrow("parent must be active");
    await asAdmin();
  });
});
