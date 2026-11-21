// @vitest-environment node
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDisposablePostgres } from "./support/assertDisposablePostgres";
import { readFixtureSql, readIds as i } from "./support/aqvoraReadFixture";
import type { GeneralLedgerPage, TrialBalancePage } from "../src/accounting/readContracts";

const databaseUrl = process.env.AQVORA_TEST_DATABASE_URL;
const { org,cash,sales,manager,owner } = i;
const lines = [{ account_id: cash,debit_minor: "100",credit_minor: "0" },
  { account_id: sales,debit_minor: "0",credit_minor: "100" }];
describe.skipIf(!databaseUrl)("AQVORA certified readers on independent PostgreSQL sessions", () => {
  const clients = new Set<Client>();
  let controller: Client; let admin: Client; let created = false; let serial = 0;
  const key = () => `read-race-${++serial}`;
  const open = async () => {
    const url = new URL(databaseUrl!); url.pathname = "/aqvora_read_fixture";
    const client = new Client({ connectionString: url.toString() });
    await client.connect(); clients.add(client); return client;
  };
  const close = async (client: Client) => {
    await client.query("ROLLBACK"); await client.end(); clients.delete(client);
  };
  const asUser = async (actor = owner) => {
    const client = await open(); await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
      set_config('request.jwt.claim.aal','aal2',true),
      set_config('request.jwt.claim.session_id',$1,true)`, [actor]);
    return client;
  };
  const post = async (client: Client,intent: string) => (await client.query<{ receipt: { journal_id: string } }>(
    "SELECT public.post_aqvora_journal($1,$2,'2026-11-20',$3::jsonb) AS receipt",
    [org,intent,JSON.stringify(lines)])).rows[0].receipt;
  beforeAll(async () => {
    assertDisposablePostgres(databaseUrl);
    controller = new Client({ connectionString: databaseUrl }); await controller.connect();
    // CREATE fails if the fixed disposable fixture already exists; never reuse it.
    await controller.query("CREATE DATABASE aqvora_read_fixture"); created = true;
    admin = await open();
    await admin.query(readFixtureSql().replace("CREATE ROLE anon; CREATE ROLE authenticated;", () => `
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));
    const poster = await asUser();
    for (let n = 0; n < 3; n++) await post(poster,key());
    await poster.query("COMMIT"); await close(poster);
  });
  afterAll(async () => {
    await Promise.all([...clients].map(close));
    if (created) await controller.query("DROP DATABASE aqvora_read_fixture");
    if (controller) await controller.end();
  });

  it("keeps GL and TB in one statement snapshot across a concurrent commit without blocking posting", async () => {
    const poster = await asUser();
    const receipt = await post(poster,key());
    const reader = await asUser(manager);
    await reader.query("SET LOCAL statement_timeout='2000ms'");
    const reading = reader.query<{ first: TrialBalancePage; second: GeneralLedgerPage }>(`
      SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') AS first,
        pg_sleep(0.5),
        public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR') AS second`, [org,cash]);
    let sleeping = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await admin.query("SELECT wait_event FROM pg_stat_activity WHERE pid=$1", [reader.processID]);
      if (state.rows[0].wait_event === "PgSleep") { sleeping = true; break; }
      await new Promise((resolve) => setTimeout(resolve,10));
    }
    expect(sleeping).toBe(true);
    await poster.query("COMMIT"); await close(poster);
    const reports = (await reading).rows[0];
    expect(reports.first.source.snapshot_token).toBe(reports.second.source.snapshot_token);
    expect(reports.second.rows.some((line) => line.journal_id === receipt.journal_id)).toBe(false);
    expect(reports.first.totals.debit_minor).toBe(reports.first.totals.credit_minor);
    const next = await reader.query<{ report: TrialBalancePage }>(
      "SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') AS report", [org]);
    expect(BigInt(next.rows[0].report.source.source_journal_count)).toBe(
      BigInt(reports.first.source.source_journal_count)+1n);
    await expect(reader.query("SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR',100,null,$3)",
      [org,cash,reports.first.source.snapshot_token])).rejects.toMatchObject({ code: "40001" });
    await close(reader);
  }, 30000);

  it("replays read cursors and rejects continuation after a different session posts", async () => {
    const reader = await asUser();
    const query = "SELECT public.read_aqvora_general_ledger($1,$2,'2026-11-01','2026-11-30','PKR',1,$3::jsonb,$4) AS report";
    const first = (await reader.query<{ report: GeneralLedgerPage }>(query,[org,cash,null,null])).rows[0].report;
    expect(first.has_more).toBe(true);
    const params = [org,cash,JSON.stringify(first.next_cursor),first.source.snapshot_token];
    const a = (await reader.query<{ report: GeneralLedgerPage }>(query,params)).rows[0].report;
    const b = (await reader.query<{ report: GeneralLedgerPage }>(query,params)).rows[0].report;
    expect(a.rows).toEqual(b.rows);
    const poster = await asUser(); await post(poster,key());
    await poster.query("COMMIT"); await close(poster);
    await expect(reader.query(query,params)).rejects.toMatchObject({ code: "40001" });
    await close(reader);
  });

  it("uses company-leading indexes with a larger synthetic journal and records the query plan", async () => {
    const poster = await asUser();
    await poster.query(`SELECT public.post_aqvora_journal($1,'scale-' || n,'2026-11-20',$2::jsonb)
      FROM generate_series(1,1000) n`, [org,JSON.stringify(lines)]);
    await poster.query("COMMIT"); await close(poster);
    await admin.query("ANALYZE public.aqvora_journals; ANALYZE public.aqvora_journal_lines");
    const plan = await admin.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
      SELECT j.id,l.line_no,l.debit_minor,l.credit_minor
      FROM public.aqvora_journals j JOIN public.aqvora_journal_lines l
        ON l.organization_id=$1 AND l.journal_id=j.id
      WHERE j.organization_id=$1 AND j.business_date BETWEEN '2026-11-01' AND '2026-11-30'
        AND l.account_id=$2 ORDER BY j.business_date,j.id,l.line_no LIMIT 101`, [org,cash]);
    const serialized = JSON.stringify(plan.rows[0]);
    expect(serialized).toContain("organization_id");
    expect(serialized).toMatch(/aqvora_lines_account_history|aqvora_journal_lines_pkey/);
    console.info("AQVORA company-scoped GL plan:",serialized);
    const reader = await asUser(manager);
    const report = (await reader.query<{ report: TrialBalancePage }>(
      "SELECT public.read_aqvora_trial_balance($1,'2026-11-01','2026-11-30','PKR') AS report",[org])).rows[0].report;
    expect(BigInt(report.source.source_journal_count)).toBeGreaterThanOrEqual(1000n);
    expect(report.totals.debit_minor).toBe(report.totals.credit_minor);
    await close(reader);
  }, 60000);

});
