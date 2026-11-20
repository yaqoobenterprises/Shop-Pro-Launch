// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposablePostgres } from "./support/assertDisposablePostgres";

const databaseUrl = process.env.AQVORA_TEST_DATABASE_URL;
const migrationRoot = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(migrationRoot).filter((name) => name.endsWith(".sql")).sort();
const deployedOrder = [
  "20261016094952_shop_pro_launch_baseline.sql",
  "20261016122204_enforce_mfa_for_enrolled_users.sql",
  "20261020055612_fix_mfa_factor_access_policy.sql",
  "20261020060229_fix_profiles_rls_recursion.sql",
  "20261116195744_ai_accountant_chat_sync.sql",
  "20261116195839_ai_accountant_chat_sync_indexes.sql",
  "20261017062800_launch_authorization_hardening.sql",
  "20261117054753_ledgermate_multi_conversation_history.sql",
  "20261120010000_aqvora_journal_schema.sql",
  "20261120010100_aqvora_posting_rpc.sql",
  "20261120010200_aqvora_reversal_rpc.sql",
  "20261120054717_close_financial_authorization_gaps.sql",
  "20261120103750_aqvora_admin_schema.sql",
  "20261120103757_aqvora_admin_account_api.sql",
  "20261120103805_aqvora_admin_period_api.sql",
];
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = "11111111-1111-4111-8111-111111111111";
const cash = "22222222-2222-4222-8222-222222222222";
const sales = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!databaseUrl)("AQVORA full migration order on disposable PostgreSQL", () => {
  let controller: Client;
  const databases = ["aqvora_fresh_fixture", "aqvora_deployed_fixture"];
  const urlFor = (name: string) => {
    const parsed = new URL(databaseUrl!);
    parsed.pathname = `/${name}`;
    return parsed.toString();
  };
  const open = async (name: string) => {
    const client = new Client({ connectionString: urlFor(name) });
    await client.connect();
    return client;
  };
  const seedAuth = async (client: Client) => client.query(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE TABLE auth.mfa_factors (id uuid, user_id uuid, status text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),
           'session_id',current_setting('request.jwt.claim.session_id',true)) $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    INSERT INTO auth.users(id,email) VALUES ('${actor}','owner@example.test');
    INSERT INTO auth.sessions VALUES ('${actor}','${actor}');
  `);
  const applyMigration = async (client: Client, name: string) => {
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(new URL(name, migrationRoot), "utf8"));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${name} failed`, { cause: error });
    }
  };

  beforeAll(async () => {
    assertDisposablePostgres(databaseUrl);
    expect([...deployedOrder].sort()).toEqual(files);
    controller = new Client({ connectionString: databaseUrl });
    await controller.connect();
    await controller.query(`DO $$ BEGIN CREATE ROLE anon;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    for (const name of databases) await controller.query(`CREATE DATABASE ${name}`);
  }, 30000);
  afterAll(async () => {
    if (!controller) return;
    for (const name of databases) await controller.query(`DROP DATABASE IF EXISTS ${name}`);
    await controller.end();
  });

  for (const [database, order] of [
    [databases[0], files], [databases[1], deployedOrder],
  ] as const) {
    it(`applies and authorizes the ${database} order`, async () => {
      const client = await open(database);
      try {
        await seedAuth(client);
        for (const name of order) await applyMigration(client, name);
        await client.query("BEGIN");
        await expect(client.query(`CREATE TABLE public.aqvora_rollback_probe(id integer);
          SELECT 1 / 0`)).rejects.toThrow();
        await client.query("ROLLBACK");
        const probe = await client.query<{ relation: string | null }>(
          "SELECT to_regclass('public.aqvora_rollback_probe')::text AS relation",
        );
        expect(probe.rows[0].relation).toBeNull();
        const grants = await client.query<{
          balance_update: boolean; name_update: boolean;
          anon_post: boolean; internal_post: boolean;
        }>(`SELECT
          has_column_privilege('authenticated','public.payment_accounts','balance_paisa','UPDATE') AS balance_update,
          has_column_privilege('authenticated','public.payment_accounts','name','UPDATE') AS name_update,
          has_function_privilege('anon','public.post_aqvora_journal(uuid,text,date,jsonb)','EXECUTE') AS anon_post,
          has_function_privilege('authenticated',
            'private.aqvora_post_internal(uuid,text,date,jsonb,uuid,text)','EXECUTE') AS internal_post`);
        expect(grants.rows[0]).toEqual({
          balance_update: false, name_update: true,
          anon_post: false, internal_post: false,
        });
        const enrollment = await client.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM public.aqvora_enabled_companies",
        );
        expect(enrollment.rows[0].n).toBe(0);
        const roleFunction = await client.query<{ definition: string }>(
          "SELECT pg_get_functiondef('private.get_org_role(uuid)'::regprocedure) AS definition",
        );
        expect(roleFunction.rows[0].definition).toContain("organization_members");
        expect(roleFunction.rows[0].definition).not.toContain("public.profiles");
        await client.query(`
          INSERT INTO public.organizations(id,name,owner_name,currency)
            VALUES ('${org}','Fixture','Owner','PKR');
          INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
            VALUES ('${org}','${actor}','OWNER',true);
          INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES ('${org}');
          INSERT INTO public.aqvora_periods(organization_id,starts_on,ends_on,state)
            VALUES ('${org}','2026-11-01','2026-11-30','open');
          INSERT INTO public.aqvora_accounts
            (organization_id,id,code,name,account_class,normal_side,is_posting)
            VALUES ('${org}','${cash}','1000','Cash','asset','debit',true),
                   ('${org}','${sales}','4000','Sales','revenue','credit',true);
        `);
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE authenticated");
        await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
          set_config('request.jwt.claim.aal','aal2',true),
          set_config('request.jwt.claim.session_id',$1,true)`, [actor]);
        const receipt = await client.query<{ journal_id: string }>(`
          SELECT (public.post_aqvora_journal($1,'migration-smoke','2026-11-20',$2::jsonb)->>'journal_id') AS journal_id
        `, [org, JSON.stringify([
          { account_id: cash, debit_minor: "1", credit_minor: "0" },
          { account_id: sales, debit_minor: "0", credit_minor: "1" },
        ])]);
        expect(receipt.rows[0].journal_id).toBeTruthy();
        await client.query("COMMIT");
      } finally {
        await client.end();
      }
    }, 90000);
  }
});
