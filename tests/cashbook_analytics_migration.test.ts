// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const sql = readFileSync(new URL("../supabase/migrations/20261128045430_cashbook_analytics_read_api.sql", import.meta.url), "utf8");
const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", foreign = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", user = "11111111-1111-1111-1111-111111111111";
describe("cashbook analytics aggregate boundary", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      CREATE FUNCTION private.is_org_member(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='${user}'::uuid AND target='${org}'::uuid; $$;
      CREATE TABLE categories(id uuid PRIMARY KEY,organization_id uuid,name text);
      CREATE TABLE transactions(id uuid PRIMARY KEY,organization_id uuid,business_date date,device_entry_time timestamptz,type text,amount_paisa bigint,category_id uuid,adjustment_dir text,status text);
      CREATE TABLE account_ledger_entries(transaction_id uuid,transfer_id uuid);
      CREATE TABLE transaction_drafts(category_id uuid,organization_id uuid,created_by uuid);
      ALTER TABLE transactions ADD COLUMN account_id uuid;
      ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY scoped_read ON transactions FOR SELECT TO authenticated USING(private.is_org_member(organization_id));
      GRANT USAGE ON SCHEMA public,private,auth TO authenticated;
      GRANT SELECT ON transactions,categories TO authenticated;
      INSERT INTO transactions(id,organization_id,business_date,device_entry_time,type,amount_paisa,status) VALUES
        ('00000000-0000-0000-0000-000000000001','${org}','2026-11-01',now(),'income',30001,'active'),
        ('00000000-0000-0000-0000-000000000002','${org}','2026-11-01',now(),'expense',10000,'active'),
        ('00000000-0000-0000-0000-000000000003','${org}','2026-11-02',now(),'capital_in',900000,'active'),
        ('00000000-0000-0000-0000-000000000004','${org}','2026-11-03',now(),'income',800000,'voided'),
        ('00000000-0000-0000-0000-000000000005','${foreign}','2026-11-01',now(),'income',99000000,'active');
    `);
    await db.exec(sql);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`);
  });
  afterAll(() => db.close());
  const read = async (target = org, from = "2026-11-01", to = "2026-11-30", type = "all") => {
    const { rows } = await db.query<{ result: { totals: Record<string, number>; categories: unknown[]; trend: unknown[] } }>("SELECT cashbook_period_analytics($1,$2,$3,$4,NULL) AS result", [target, from, to, type]);
    return rows[0].result;
  };
  it("preserves integer-paisa totals, excludes voided/foreign records and separates capital", async () => {
    expect((await read()).totals).toMatchObject({ income_paisa: 30001, expense_paisa: 10000, net_profit_paisa: 20001, capital_in_paisa: 900000, transaction_count: 3 });
  });
  it("applies filters and returns real zero totals for an empty date range", async () => {
    expect((await read(org, "2026-11-01", "2026-11-30", "expense")).totals).toMatchObject({ income_paisa: 0, expense_paisa: 10000, net_profit_paisa: -10000, transaction_count: 1 });
    expect((await read(org, "2026-12-01", "2026-12-31")).totals.transaction_count).toBe(0);
  });
  it("rejects another shop and invalid ranges", async () => {
    await expect(read(foreign)).rejects.toThrow(/membership/);
    await expect(read(org, "2026-11-30", "2026-11-01")).rejects.toThrow(/valid date/);
  });
  it("uses invoker rights and denies anonymous invocation", async () => {
    const result = await db.query<{ prosecdef: boolean; allowed: boolean }>("SELECT prosecdef,has_function_privilege('anon',oid,'execute') AS allowed FROM pg_proc WHERE proname='cashbook_period_analytics'");
    expect(result.rows[0]).toEqual({ prosecdef: false, allowed: false });
  });
});
