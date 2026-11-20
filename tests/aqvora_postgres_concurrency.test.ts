// @vitest-environment node
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposablePostgres } from "./support/assertDisposablePostgres";

const databaseUrl = process.env.AQVORA_TEST_DATABASE_URL;
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOrg = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const cash = "33333333-3333-4333-8333-333333333333";
const sales = "44444444-4444-4444-8444-444444444444";
const lines = [
  { account_id: cash, debit_minor: "100", credit_minor: "0" },
  { account_id: sales, debit_minor: "0", credit_minor: "100" },
];

type Receipt = { journal_id: string; intent_key: string; total_minor: string };
const clients = new Set<Client>();
const open = async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  clients.add(client);
  return client;
};
const close = async (client: Client) => {
  try { await client.query("ROLLBACK"); } catch { /* Already outside a transaction. */ }
  await client.end();
  clients.delete(client);
};

describe.skipIf(!databaseUrl)("AQVORA independent PostgreSQL sessions", () => {
  let admin: Client;
  let serial = 0;
  const key = () => `pg-race-${++serial}`;
  const asUser = async (user = owner, aal = "aal2") => {
    const client = await open();
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
      set_config('request.jwt.claim.aal',$2,true),
      set_config('request.jwt.claim.session_id',$1,true)`, [user, aal]);
    return client;
  };
  const post = async (client: Client, intent: string, payload: unknown = lines, company = org) => {
    const result = await client.query<{ receipt: Receipt }>(
      "SELECT public.post_aqvora_journal($1,$2,'2026-11-20',$3::jsonb) AS receipt",
      [company, intent, JSON.stringify(payload)],
    );
    return result.rows[0].receipt;
  };
  const reverse = async (client: Client, originalId: string, intent: string) => {
    const result = await client.query<{ receipt: Receipt }>(
      "SELECT public.reverse_aqvora_journal($1,$2,$3,'2026-11-20','Correction') AS receipt",
      [org, originalId, intent],
    );
    return result.rows[0].receipt;
  };
  const waitUntilBlocked = async (client: Client) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await admin.query<{ blocked: boolean }>(
        "SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [client.processID],
      );
      if (result.rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Expected a different PostgreSQL backend to wait on a row or unique key");
  };

  beforeAll(async () => {
    assertDisposablePostgres(databaseUrl);
    admin = await open();
    await admin.query(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT jsonb_build_object('aal',current_setting('request.jwt.claim.aal',true),
             'session_id',current_setting('request.jwt.claim.session_id',true)) $$;
      GRANT USAGE ON SCHEMA auth, private TO authenticated;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY, currency text);
      CREATE TABLE public.organization_members (
        organization_id uuid NOT NULL, user_id uuid NOT NULL,
        role text NOT NULL, is_active boolean NOT NULL,
        PRIMARY KEY (organization_id,user_id));
      INSERT INTO auth.users VALUES ('${owner}'),('${otherOwner}');
      INSERT INTO auth.sessions VALUES ('${owner}','${owner}'),('${otherOwner}','${otherOwner}');
      INSERT INTO public.organizations VALUES ('${org}','PKR'),('${otherOrg}','PKR');
      INSERT INTO public.organization_members VALUES
        ('${org}','${owner}','OWNER',true),('${otherOrg}','${otherOwner}','OWNER',true);
    `);
    for (const file of [
      "20261120010000_aqvora_journal_schema.sql",
      "20261120010100_aqvora_posting_rpc.sql",
      "20261120010200_aqvora_reversal_rpc.sql",
      "20261120103750_aqvora_admin_schema.sql",
      "20261120103757_aqvora_admin_account_api.sql",
      "20261120103805_aqvora_admin_period_api.sql",
    ]) {
      await admin.query(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await admin.query(`
      INSERT INTO public.aqvora_enabled_companies VALUES ('${org}'),('${otherOrg}');
      INSERT INTO public.aqvora_periods (organization_id,starts_on,ends_on,state)
        VALUES ('${org}','2026-11-01','2026-11-30','open'),
               ('${otherOrg}','2026-11-01','2026-11-30','open');
      INSERT INTO public.aqvora_accounts
        (organization_id,id,code,name,account_class,normal_side,is_posting)
        VALUES ('${org}','${cash}','1000','Cash','asset','debit',true),
               ('${org}','${sales}','4000','Sales','revenue','credit',true),
               ('${otherOrg}','55555555-5555-4555-8555-555555555555','1000',
                'Other cash','asset','debit',true);
    `);
  });
  afterAll(async () => { await Promise.all([...clients].map(close)); });

  it("serializes disablement with an in-flight posting in both orders", async () => {
    const poster = await asUser();
    const receipt = await post(poster, key());
    const disabler = await open();
    await disabler.query("BEGIN");
    const deletion = disabler.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1", [org]);
    await waitUntilBlocked(disabler);
    await poster.query("COMMIT");
    await deletion;
    await disabler.query("COMMIT");
    expect(receipt.journal_id).toBeTruthy();
    await close(poster); await close(disabler);

    const denied = await asUser();
    await expect(post(denied, key())).rejects.toThrow("not enabled");
    await close(denied);
    await admin.query("INSERT INTO public.aqvora_enabled_companies VALUES ($1)", [org]);

    const first = await open();
    await first.query("BEGIN");
    await first.query("DELETE FROM public.aqvora_enabled_companies WHERE organization_id=$1", [org]);
    const waiting = await asUser();
    const pending = post(waiting, key());
    await waitUntilBlocked(waiting);
    await first.query("COMMIT");
    await expect(pending).rejects.toThrow("not enabled");
    await close(first); await close(waiting);
    await admin.query("INSERT INTO public.aqvora_enabled_companies VALUES ($1)", [org]);
  }, 30000);

  it("serializes role demotion, account deactivation, and period closure", async () => {
    for (const change of [
      { sql: "UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1", undo: "UPDATE public.organization_members SET role='OWNER' WHERE organization_id=$1", error: "not authorized" },
      { sql: "UPDATE public.aqvora_accounts SET is_active=false WHERE organization_id=$1 AND id='33333333-3333-4333-8333-333333333333'", undo: "UPDATE public.aqvora_accounts SET is_active=true WHERE organization_id=$1 AND id='33333333-3333-4333-8333-333333333333'", error: "archived" },
      { sql: "UPDATE public.aqvora_periods SET state='closed' WHERE organization_id=$1", undo: "UPDATE public.aqvora_periods SET state='open' WHERE organization_id=$1", error: "closed" },
    ]) {
      const poster = await asUser();
      await post(poster, key());
      const changer = await open();
      await changer.query("BEGIN");
      const pending = changer.query(change.sql, [org]);
      await waitUntilBlocked(changer);
      await poster.query("COMMIT");
      await pending;
      await changer.query("COMMIT");
      await close(poster); await close(changer);
      const denied = await asUser();
      await expect(post(denied, key())).rejects.toThrow(change.error);
      await close(denied);
      await admin.query(change.undo, [org]);
    }
  }, 30000);

  it("returns one durable receipt for racing retries and lost replies", async () => {
    const intent = key();
    const first = await asUser();
    const receipt = await post(first, intent);
    const second = await asUser();
    const pending = post(second, intent);
    await waitUntilBlocked(second);
    await first.query("COMMIT");
    expect(await pending).toEqual(receipt);
    await second.query("COMMIT");
    await close(first); await close(second);
    const recovery = await asUser();
    const found = await recovery.query<{ receipt: Receipt }>(
      "SELECT public.lookup_aqvora_receipt($1,$2) AS receipt", [org, intent],
    );
    expect(found.rows[0].receipt).toEqual(receipt);
    await close(recovery);
    const count = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1 AND intent_key=$2",
      [org, intent],
    );
    expect(count.rows[0].n).toBe(1);

    const changedIntent = key();
    const original = await asUser();
    await post(original, changedIntent);
    const changed = await asUser();
    const competing = post(changed, changedIntent, [
      { ...lines[0], debit_minor: "1" }, { ...lines[1], credit_minor: "1" },
    ]);
    await waitUntilBlocked(changed);
    await original.query("COMMIT");
    await expect(competing).rejects.toThrow("Idempotency key payload mismatch");
    await close(original); await close(changed);
  }, 30000);

  it("serializes session revocation and denies stale session claims", async () => {
    const poster = await asUser();
    await post(poster, key());
    const revoker = await open();
    await revoker.query("BEGIN");
    const deletion = revoker.query("DELETE FROM auth.sessions WHERE id=$1", [owner]);
    await waitUntilBlocked(revoker);
    await poster.query("COMMIT");
    await deletion;
    await revoker.query("COMMIT");
    await close(poster); await close(revoker);
    const denied = await asUser();
    await expect(post(denied, key())).rejects.toThrow("revoked or missing");
    await close(denied);
    await admin.query("INSERT INTO auth.sessions (id,user_id) VALUES ($1,$1)", [owner]);
  }, 30000);

  it("permits one reversal under racing requests and denies foreign access", async () => {
    const poster = await asUser();
    const original = await post(poster, key());
    await poster.query("COMMIT");
    await close(poster);
    const first = await asUser();
    const reversal = await reverse(first, original.journal_id, key());
    const second = await asUser();
    const pending = reverse(second, original.journal_id, key());
    await waitUntilBlocked(second);
    await first.query("COMMIT");
    await expect(pending).rejects.toThrow();
    await close(first); await close(second);
    const foreign = await asUser(otherOwner);
    await expect(post(foreign, key(), lines, org)).rejects.toThrow("not authorized");
    await close(foreign);
    const foreignReader = await asUser(otherOwner);
    for (const table of ["aqvora_accounts", "aqvora_periods", "aqvora_journals",
      "aqvora_journal_lines", "aqvora_posting_receipts", "aqvora_journal_audit"]) {
      const rows = await foreignReader.query(`SELECT * FROM public.${table} WHERE organization_id=$1`, [org]);
      expect(rows.rows).toEqual([]);
    }
    await close(foreignReader);
    const count = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1 AND reversal_of=$2",
      [org, original.journal_id],
    );
    expect(count.rows[0].n).toBe(1);
    expect(reversal.journal_id).toBeTruthy();
  }, 30000);

  it("validates chart hierarchy, owner authority, MFA, tenant readers and audit", async () => {
    const ownerSession = await asUser();
    const heading = await ownerSession.query<{ id: string }>(
      "SELECT id FROM public.create_aqvora_account($1,'1100','Bank heading','asset','debit',null,false)", [org]);
    const headingId = heading.rows[0].id;
    const leaf = await ownerSession.query<{ id: string }>(
      "SELECT id FROM public.create_aqvora_account($1,'1101','Bank','asset','debit',$2,true)",
      [org, headingId]);
    const leafId = leaf.rows[0].id;
    for (const [sql, args, message] of [
      ["SELECT public.create_aqvora_account($1,'1101','Duplicate','asset','debit',null,true)", [org], "duplicate key"],
      ["SELECT public.create_aqvora_account($1,'1102','Bad parent','expense','debit',$2,true)", [org, headingId], "Invalid chart parent"],
      ["SELECT public.create_aqvora_account($1,'1103','Foreign parent','asset','debit',$2,true)",
        [org, "55555555-5555-4555-8555-555555555555"], "Chart parent must be active"],
      ["SELECT public.edit_aqvora_account($1,$2,1,'1100','Cycle',$3)", [org, headingId, leafId], "Invalid chart parent"],
      ["SELECT public.create_aqvora_period($1,'2026-11-15','2026-12-15')", [org], "Fiscal periods cannot overlap"],
    ] as const) {
      await ownerSession.query("SAVEPOINT invalid_admin_request");
      await expect(ownerSession.query(sql, [...args])).rejects.toThrow(message);
      await ownerSession.query("ROLLBACK TO SAVEPOINT invalid_admin_request");
    }
    await post(ownerSession, key(), [
      { account_id: leafId, debit_minor: "1", credit_minor: "0" },
      { account_id: sales, debit_minor: "0", credit_minor: "1" },
    ]);
    await ownerSession.query("SAVEPOINT posted_heading_edit");
    await expect(ownerSession.query(
      "SELECT public.edit_aqvora_account($1,$2,1,'1199','Changed heading',null)",
      [org, headingId])).rejects.toThrow("immutable");
    await ownerSession.query("ROLLBACK TO SAVEPOINT posted_heading_edit");
    const rows = await ownerSession.query("SELECT * FROM public.list_aqvora_accounts($1)", [org]);
    expect(rows.rows.some((row) => row.id === leafId)).toBe(true);
    const audit = await ownerSession.query("SELECT * FROM public.list_aqvora_admin_events($1)", [org]);
    expect(audit.rows.filter((row) => row.action === "ACCOUNT_CREATE").length).toBe(2);
    await ownerSession.query("COMMIT"); await close(ownerSession);

    const foreign = await asUser(otherOwner);
    await expect(foreign.query("SELECT * FROM public.list_aqvora_accounts($1)", [org]))
      .rejects.toThrow("not authorized");
    await close(foreign);
    const foreignOwn = await asUser(otherOwner);
    const hidden = await foreignOwn.query("SELECT * FROM public.get_aqvora_account($1,$2)",
      [otherOrg, leafId]);
    expect(hidden.rows[0]?.id ?? null).toBeNull();
    expect((await foreignOwn.query("SELECT * FROM public.aqvora_admin_audit WHERE organization_id=$1", [org])).rows).toEqual([]);
    await close(foreignOwn);

    const weak = await asUser(owner, "aal1");
    await expect(weak.query("SELECT * FROM public.list_aqvora_periods($1)", [org]))
      .rejects.toThrow("MFA");
    await close(weak);
    await admin.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1", [org]);
    const demoted = await asUser();
    await expect(demoted.query("SELECT public.create_aqvora_period($1,'2026-12-01','2026-12-31')", [org]))
      .rejects.toThrow("active owner");
    await close(demoted);
    await admin.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1", [org]);
    const inactive = await asUser();
    await expect(inactive.query("SELECT * FROM public.list_aqvora_accounts($1)", [org]))
      .rejects.toThrow("not authorized");
    await close(inactive);
    await admin.query("UPDATE public.organization_members SET role='OWNER',is_active=true WHERE organization_id=$1", [org]);
    const grants = await admin.query<{ direct_write: boolean; anon_rpc: boolean }>(`
      SELECT has_table_privilege('authenticated','public.aqvora_admin_audit','INSERT') AS direct_write,
      has_function_privilege('anon','public.archive_aqvora_account(uuid,uuid,bigint,text)','EXECUTE') AS anon_rpc`);
    expect(grants.rows[0]).toEqual({ direct_write: false, anon_rpc: false });
  }, 30000);

  it("serializes close and archive against posting and preserves posted history", async () => {
    const period = await admin.query<{ id: string }>(
      "SELECT id FROM public.aqvora_periods WHERE organization_id=$1", [org]);
    const periodId = period.rows[0].id;
    const poster = await asUser();
    const receipt = await post(poster, key());
    const closer = await asUser();
    const closing = closer.query("SELECT * FROM public.close_aqvora_period($1,$2,1,'Month close')",
      [org, periodId]);
    await waitUntilBlocked(closer);
    await poster.query("COMMIT");
    expect((await closing).rows[0].state).toBe("closed");
    await closer.query("COMMIT"); await close(poster); await close(closer);
    const denied = await asUser();
    await expect(post(denied, key())).rejects.toThrow("closed");
    await close(denied);
    const reopened = await asUser();
    const openPeriod = await reopened.query<{ reopen_count: number }>(
      "SELECT * FROM public.reopen_aqvora_period($1,$2,2,'Approved correction')", [org, periodId]);
    expect(openPeriod.rows[0].reopen_count).toBe(1);
    await reopened.query("COMMIT"); await close(reopened);

    const secondPoster = await asUser();
    await post(secondPoster, key());
    const archiver = await asUser();
    const archiving = archiver.query(
      "SELECT * FROM public.archive_aqvora_account($1,$2,1,'Cash account retired')", [org, cash]);
    await waitUntilBlocked(archiver);
    await secondPoster.query("COMMIT");
    expect((await archiving).rows[0].is_active).toBe(false);
    await archiver.query("COMMIT"); await close(secondPoster); await close(archiver);
    const archived = await asUser();
    await expect(post(archived, key())).rejects.toThrow("archived");
    await close(archived);
    await expect(admin.query("UPDATE public.aqvora_accounts SET code='9999' WHERE organization_id=$1 AND id=$2",
      [org, cash])).rejects.toThrow("immutable");
    const history = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1 AND id=$2",
      [org, receipt.journal_id]);
    expect(history.rows[0].n).toBe(1);
  }, 30000);
});
