// @vitest-environment node
import {currencyMigrations,currencySeedSql} from "./support/aqvoraCurrencyFixture";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposablePostgres } from "./support/assertDisposablePostgres";
import { readMigrations } from "./support/aqvoraReadFixture";
import { salesMigrations } from "./support/aqvoraSalesFixture";
import { seedRecoverySales,verifyRestoredSales } from "./support/aqvoraSalesRecovery";
import { receiptMigrations } from "./support/aqvoraReceiptFixture";
import { seedRecoveryReceipt,verifyRestoredReceipt } from "./support/aqvoraReceiptRecovery";
import type { TrialBalancePage } from "../src/accounting/readContracts";

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
  ...readMigrations,
  ...salesMigrations,
  ...receiptMigrations,
  ...currencyMigrations,
  // New independent provenance/dual-approval backend, never a data backfill.
  "20261121130000_aqvora_fresh_company_enrollment_schema.sql",
  "20261121130100_aqvora_fresh_company_creation_rpc.sql",
  "20261121130200_aqvora_fresh_activation_evidence.sql",
  "20261121130300_aqvora_fresh_dual_owner_activation_rpc.sql",
];
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = "11111111-1111-4111-8111-111111111111";
const cash = "22222222-2222-4222-8222-222222222222";
const sales = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!databaseUrl)("AQVORA full migration order on disposable PostgreSQL", () => {
  let controller: Client;
  const databases = ["aqvora_fresh_fixture", "aqvora_deployed_fixture", "aqvora_restored_fixture"];
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
    for (const name of databases.slice(0, 2)) await controller.query(`CREATE DATABASE ${name}`);
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
        expect((await client.query("SELECT * FROM private.aqvora_currency_policies")).rows).toEqual([]);
        expect((await client.query("SELECT * FROM private.aqvora_sales_policies")).rows).toEqual([]);
        expect((await client.query("SELECT * FROM private.aqvora_receipt_policies")).rows).toEqual([]);
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
        await client.query(currencySeedSql(org,actor));
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
        const report = await client.query<{ report: TrialBalancePage }>(
          "SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') AS report",[org]);
        expect(report.rows[0].report.totals.debit_minor).toBe("1");
        await client.query("COMMIT");
        expect((await seedRecoverySales(client)).face_minor).toBe("101");
        expect((await seedRecoveryReceipt(client)).amount_minor).toBe("40");
        await client.query(currencySeedSql(org,actor,"PKR",2,2,"2026-12-01"));
      } finally {
        await client.end();
      }
    }, 90000);
  }

  it.skipIf(!process.env.AQVORA_TEST_PG_DOCKER_CONTAINER)(
    "restores full migration history, journal receipts and closed-period authorization", async () => {
      const source = await open(databases[0]);
      const restoredName = databases[2];
      const container = process.env.AQVORA_TEST_PG_DOCKER_CONTAINER!;
      const snapshot = async (client: Client) => (await client.query<{
        journals: number; lines: number; receipts: number; audit: number;
        debit: string; credit: string; members: number;
      }>(`SELECT
        (SELECT count(*)::int FROM public.aqvora_journals) AS journals,
        (SELECT count(*)::int FROM public.aqvora_journal_lines) AS lines,
        (SELECT count(*)::int FROM public.aqvora_posting_receipts) AS receipts,
        (SELECT count(*)::int FROM public.aqvora_journal_audit) AS audit,
        (SELECT sum(debit_minor)::text FROM public.aqvora_journal_lines) AS debit,
        (SELECT sum(credit_minor)::text FROM public.aqvora_journal_lines) AS credit,
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY organization_id,revision) FROM private.aqvora_currency_policies p) AS currency_policies,
        (SELECT count(*)::int FROM public.organization_members) AS members`)).rows[0];
      try {
        await source.query("BEGIN");
        await source.query("SET LOCAL ROLE authenticated");
        await source.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
          set_config('request.jwt.claim.aal','aal2',true),
          set_config('request.jwt.claim.session_id',$1,true)`, [actor]);
        const period = await source.query<{ id: string }>(
          "SELECT id FROM public.aqvora_periods WHERE organization_id=$1", [org]);
        await source.query("SELECT public.close_aqvora_period($1,$2,1,'Recovery drill')",
          [org, period.rows[0].id]);
        await source.query("COMMIT");
        const before = await snapshot(source);
        expect(before).toMatchObject({ journals: 3, lines: 6, receipts: 3, audit: 3,
          debit: "142", credit: "142" });
        const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres",
          "-Fc", databases[0]], { maxBuffer: 64 * 1024 * 1024 });
        expect(dump.length).toBeGreaterThan(1000);
        await source.query("BEGIN");
        await expect(source.query("CREATE TABLE public.aqvora_failed_upgrade(id integer); SELECT 1/0"))
          .rejects.toThrow();
        await source.query("ROLLBACK");
        expect((await source.query("SELECT to_regclass('public.aqvora_failed_upgrade') AS relation"))
          .rows[0].relation).toBeNull();
        expect(await snapshot(source)).toEqual(before);
        await controller.query(`CREATE DATABASE ${restoredName}`);
        execFileSync("docker", ["exec", "-i", container, "pg_restore", "-U", "postgres",
          "--exit-on-error", "-d", restoredName],
        { input: dump, maxBuffer: 64 * 1024 * 1024 });
        const target = await open(restoredName);
        try {
          expect(await snapshot(target)).toEqual(before);
          await target.query("BEGIN");
          await target.query("SET LOCAL ROLE authenticated");
          await target.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
            set_config('request.jwt.claim.aal','aal2',true),
            set_config('request.jwt.claim.session_id',$1,true)`, [actor]);
          const recovered = await target.query<{ receipt: { journal_id: string } }>(
            "SELECT public.lookup_aqvora_receipt($1,'migration-smoke') AS receipt", [org]);
          const retry = await target.query<{ receipt: { journal_id: string } }>(
            "SELECT public.post_aqvora_journal($1,'migration-smoke','2026-11-20',$2::jsonb) AS receipt",
            [org, JSON.stringify([{ account_id: cash, debit_minor: "1", credit_minor: "0" },
              { account_id: sales, debit_minor: "0", credit_minor: "1" }])]);
          expect((retry.rows[0].receipt as unknown as {currency_policy:{currency_exponent:number}}).currency_policy.currency_exponent).toBe(2);
          expect(retry.rows[0].receipt.journal_id).toBe(recovered.rows[0].receipt.journal_id);
          const report = await target.query<{ report: TrialBalancePage }>(
            "SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') AS report",[org]);
          expect(report.rows[0].report.totals).toMatchObject({ debit_minor: "142",credit_minor: "142" });
          await expect(target.query("SELECT public.post_aqvora_journal($1,'new-after-close','2026-11-20',$2::jsonb)",
            [org, JSON.stringify([{ account_id: cash, debit_minor: "1", credit_minor: "0" },
              { account_id: sales, debit_minor: "0", credit_minor: "1" }])])).rejects.toThrow("closed");
          await target.query("ROLLBACK");
          expect((await target.query("SELECT revision::text,exponent FROM private.aqvora_currency_policies WHERE organization_id=$1 ORDER BY revision",[org])).rows).toEqual([{revision:"1",exponent:2},{revision:"2",exponent:2}]);
          const restoredSales = await verifyRestoredSales(target);
          expect(restoredSales.receipt).toEqual(restoredSales.replay);
          expect(restoredSales.source.reconciliation).toMatchObject({face_minor:"101",ar_debit_minor:"101",revenue_credit_minor:"101"});
          const settlement=await verifyRestoredReceipt(target);
          expect(settlement.receipt).toEqual(settlement.replay);
          expect(settlement.balance).toMatchObject({face_minor:"101",allocated_minor:"40",outstanding_minor:"61"});
          expect(settlement.balance.allocations[0].allocation_id).toBe(settlement.receipt.allocations[0].allocation_id);
          expect(settlement.recon).toMatchObject({allocated_minor:"40",outstanding_minor:"61",ar_control_minor:"61"});
          expect((await target.query("SELECT kind,last_number::text n FROM private.aqvora_receipt_numbers WHERE organization_id=$1 ORDER BY kind",[org])).rows)
            .toEqual([{kind:"collection",n:"1"},{kind:"receipt",n:"1"}]);
          expect((await target.query(`SELECT has_table_privilege('authenticated','public.aqvora_receipt_allocations','INSERT') can_write,
            (SELECT count(*)::int FROM public.aqvora_receipt_audit) events,
            (SELECT count(*)::int FROM public.aqvora_receipt_allocations) allocations`)).rows[0]).toEqual({can_write:false,events:6,allocations:1});
          expect((await target.query("SELECT last_number::text n FROM private.aqvora_sales_numbers WHERE organization_id=$1",[org])).rows[0].n).toBe("1");
          expect(await snapshot(target)).toEqual(before);
          const grants = await target.query<{ direct_write: boolean }>(
            "SELECT has_table_privilege('authenticated','public.aqvora_journals','INSERT') AS direct_write");
          expect(grants.rows[0].direct_write).toBe(false);
        } finally { await target.end(); }
      } finally { await source.end(); }
    }, 90000);
});
