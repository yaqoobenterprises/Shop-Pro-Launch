// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import baseline from "./fixtures/deployed_policy_baseline.json";

const tuning = readFileSync(new URL("../supabase/migrations/20261128073704_preserve_policy_access_and_tune_reads.sql", import.meta.url), "utf8");
const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", foreign = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const user = "11111111-1111-1111-1111-111111111111";
const tables = ["account_transfers", "categories", "customers", "expense_categories", "payment_accounts", "products", "service_components", "services", "stock_movements"];
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

describe("release policy equivalence against deployed definitions", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${user}'::uuid; $$;
      CREATE FUNCTION private.is_org_member(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT target='${org}'::uuid; $$;
      CREATE FUNCTION private.is_org_owner(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT target='${org}'::uuid AND current_setting('test.role')='OWNER'; $$;
      CREATE FUNCTION private.get_auth_user_org_ids() RETURNS TABLE(org_id uuid) LANGUAGE sql STABLE AS $$ SELECT '${org}'::uuid; $$;
      CREATE FUNCTION private.current_user_meets_mfa_requirement() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.mfa')::boolean; $$;
      CREATE FUNCTION private.current_user_profile_identity_unchanged(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true; $$;
      CREATE FUNCTION private.has_permission(target uuid, permission text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT target='${org}'::uuid AND (current_setting('test.role')='OWNER' OR (current_setting('test.role')='MANAGER' AND permission='MANAGE_INVENTORY')); $$;
      CREATE FUNCTION public.is_active_shop_member() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true; $$;
      CREATE FUNCTION public.get_auth_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${org}'::uuid; $$;
      GRANT USAGE ON SCHEMA public,private,auth TO authenticated;
    `);
    const names = new Set([...baseline.map(policy => policy.tablename), "daily_closings"]);
    for (const table of names) {
      await db.exec(`CREATE TABLE public.${quote(table)} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,role text,is_active boolean DEFAULT true,created_by uuid,category_id uuid,account_id uuid,transaction_id uuid,transfer_id uuid,suggested_category_id uuid,closing_date date,amount_paisa bigint DEFAULT 1); ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.${quote(table)} TO authenticated;`);
      await db.query(`INSERT INTO public.${quote(table)}(organization_id,user_id,created_by,role) VALUES ($1,$3,$3,'OWNER'),($2,$3,$3,'MANAGER'),(NULL,$3,$3,'CASHIER')`, [org, foreign, user]);
    }
    for (const policy of baseline) {
      await db.exec(`CREATE POLICY ${quote(policy.policyname)} ON public.${quote(policy.tablename)} AS ${policy.permissive} FOR ${policy.cmd} TO authenticated${policy.qual ? ` USING (${policy.qual})` : ""}${policy.with_check ? ` WITH CHECK (${policy.with_check})` : ""};`);
    }
    await db.exec("CREATE UNIQUE INDEX daily_closings_organization_id_closing_date_key ON daily_closings(organization_id,closing_date); CREATE UNIQUE INDEX ux_daily_closings_org_date ON daily_closings(organization_id,closing_date)");
  });
  afterAll(() => db.close());

  const observe = async () => {
    const result: unknown[] = [];
    await db.exec("BEGIN");
    try {
      for (const role of ["OWNER", "MANAGER", "CASHIER"]) for (const mfa of ["true", "false"]) {
        await db.query("SELECT set_config('test.role',$1,true),set_config('test.mfa',$2,true)", [role, mfa]);
        await db.exec("SET LOCAL ROLE authenticated");
        for (const table of tables) {
          const rows = await db.query(`SELECT organization_id FROM public.${quote(table)} ORDER BY organization_id NULLS LAST`);
          result.push({ role, mfa, table, select: rows.rows });
        }
        await db.exec("RESET ROLE");
        for (const table of ["categories", "payment_accounts"]) for (const target of [org, foreign]) {
          for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
            await db.exec("SAVEPOINT mutation; SET LOCAL ROLE authenticated");
            let allowed: boolean;
            try {
              const query = operation === "INSERT" ? `INSERT INTO public.${table}(organization_id,user_id,created_by) VALUES ($1,'${user}','${user}') RETURNING id` : operation === "UPDATE" ? `UPDATE public.${table} SET amount_paisa=2 WHERE organization_id=$1 RETURNING id` : `DELETE FROM public.${table} WHERE organization_id=$1 RETURNING id`;
              allowed = (await db.query(query, [target])).rows.length > 0;
            } catch { allowed = false; }
            await db.exec("ROLLBACK TO mutation; RESET ROLE");
            result.push({ role, mfa, table, target, operation, allowed });
          }
        }
      }
    } finally { await db.exec("ROLLBACK"); }
    return result;
  };

  it("preserves role, tenant and MFA outcomes while removing overlapping policies", async () => {
    const before = await observe();
    await db.exec(tuning);
    expect(await observe()).toEqual(before);
    const overlaps = await db.query(`SELECT polrelid,action,count(*) FROM pg_policy CROSS JOIN LATERAL unnest(CASE WHEN polcmd='*' THEN ARRAY['r','a','w','d'] ELSE ARRAY[polcmd::text] END) action WHERE polpermissive AND polrelid IN (${tables.map(table => `'public.${table}'::regclass`).join(",")}) GROUP BY polrelid,action HAVING count(*)>1`);
    expect(overlaps.rows).toHaveLength(0);
    const mfa = await db.query("SELECT count(*)::int AS total FROM pg_policy WHERE polname='require_aal2_for_enrolled_mfa' AND NOT polpermissive");
    expect(mfa.rows[0].total).toBe(baseline.filter(policy => policy.policyname === "require_aal2_for_enrolled_mfa").length);
  }, 30000);
});
