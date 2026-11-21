import {execFileSync} from "node:child_process";
import {randomBytes, randomUUID} from "node:crypto";
import {Client} from "pg";
import {expect} from "vitest";
import {evidenceHash, readE2EBooks, readE2EOpen, sqlE2ESnapshot} from "./aqvoraE2EEvidence";
import {denied, ar, receiptCash, e2eDate, type E2ECompany, type E2EHarness} from "./aqvoraE2EHarness";
import type {SalesInvoice, SalesIssueReceipt, SalesIssueRequest} from "../../src/accounting/salesContracts";
import type {CustomerReceiptIssue, PostCustomerReceiptRequest} from "../../src/accounting/receiptContracts";

const docker = (args: string[], input?: Buffer, env?: NodeJS.ProcessEnv) => execFileSync("docker", args,
  {input, env: env ?? process.env, maxBuffer: 64 * 1024 * 1024, timeout: 60000, stdio: ["pipe", "pipe", "pipe"]});
type Container = {Name: string; Config: {Image: string; Env: string[]}; NetworkSettings: {Networks: Record<string, unknown>}};
/** Full logical DB restore, including actual Auth rows; fresh PostgREST verifies
 * the original issued JWT against the restored live session and company data.
 * This is not a physical/PITR or reconfigured GoTrue service certification. */
export async function restoreE2E(h: E2EHarness, c: E2ECompany, invoice: SalesInvoice, issue: SalesIssueRequest,
  originalIssue: SalesIssueReceipt, settlements: Array<{args: PostCustomerReceiptRequest; response: CustomerReceiptIssue}>,
  legacy: {snapshot: (db?: Client) => Promise<unknown>; before: unknown}) {
  const container = process.env.AQVORA_E2E_RESTORE_CONTAINER;
  if (!container || !/^[0-9a-f]{12,64}$/.test(container)) throw Error("Explicit disposable DB container required for restore");
  const info = JSON.parse(docker(["inspect", container]).toString())[0] as Container;
  if (!info.Name.startsWith("/supabase_db_")) throw Error("Expected disposable Supabase DB container");
  const restIds = docker(["ps", "--filter", "name=^/supabase_rest_", "--format", "{{.ID}}"]).toString().trim().split(/\s+/);
  if (restIds.length !== 1 || !/^[0-9a-f]+$/.test(restIds[0])) throw Error("Exactly one disposable PostgREST service required");
  const rest = JSON.parse(docker(["inspect", restIds[0]]).toString())[0] as Container;
  const networks = Object.keys(info.NetworkSettings.Networks).filter(n => n in rest.NetworkSettings.Networks);
  if (networks.length !== 1) throw Error("Disposable services must share exactly one network");
  // Prove Docker's source database is the one used by the HTTP workflow.
  const marker = docker(["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c",
    `SELECT id FROM public.organizations WHERE id='${c.org}'`]).toString().trim();
  expect(marker).toBe(c.org);
  // Managed Auth schemas belong to supabase_admin. Use its existing local
  // maintenance role for full restore; do not drop owners/ACLs or elevate callers.
  expect(docker(["exec", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-c",
    "SELECT rolsuper FROM pg_roles WHERE rolname=current_user"]).toString().trim()).toBe("t");
  const authDigest = async (db: Client) => (await db.query(`SELECT encode(sha256(convert_to(jsonb_build_object(
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u WHERE id=ANY($1::uuid[])),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth.sessions s WHERE user_id=ANY($1::uuid[])),
    'factors',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM auth.mfa_factors f WHERE user_id=ANY($1::uuid[])))::text,'UTF8')),'hex') digest`,
  [[h.ownerA.id, h.ownerB.id]])).rows[0].digest as string;
  const originalAuthDigest = await authDigest(h.db);
  const before = await sqlE2ESnapshot(h.db, c);
  const dump = docker(["exec", container, "pg_dump", "-U", "supabase_admin", "-Fc", "postgres"]);
  expect(dump.length).toBeGreaterThan(1000);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 20);
  const database = `aqvora_e2e_restore_${suffix}`, role = `aqvora_e2e_auth_${suffix}`, server = `aqvora-e2e-rest-${suffix}`;
  const password = randomBytes(24).toString("hex");
  let created = false, roleCreated = false, started = false, target: Client | undefined;
  try {
    await h.db.query(`CREATE DATABASE ${database} TEMPLATE template0`); created = true;
    docker(["exec", "-i", container, "pg_restore", "-U", "supabase_admin", "--exit-on-error", "-d", database], dump);
    const url = new URL(h.status.DB_URL); url.pathname = `/${database}`;
    target = new Client({connectionString: url.toString()}); await target.connect();
    expect(await sqlE2ESnapshot(target, c)).toEqual(before);
    expect(await authDigest(target)).toBe(originalAuthDigest);
    expect(await legacy.snapshot(target)).toEqual(legacy.before);
    expect((await target.query("SELECT has_table_privilege('authenticated','public.aqvora_journals','INSERT') allowed")).rows[0].allowed).toBe(false);
    await h.db.query(`CREATE ROLE ${role} LOGIN NOINHERIT PASSWORD '${password}'`); roleCreated = true;
    await h.db.query(`GRANT authenticated,anon TO ${role}`);
    const uri = new URL(h.status.DB_URL); uri.username = role; uri.password = password;
    uri.hostname = info.Name.slice(1); uri.port = "5432"; uri.pathname = `/${database}`;
    const env: NodeJS.ProcessEnv = {...process.env, PGRST_DB_URI: uri.toString()};
    const jwtKeys: string[] = [];
    for (const entry of rest.Config.Env.filter(x => x.startsWith("PGRST_JWT_"))) {
      const equal = entry.indexOf("="); const key = entry.slice(0, equal);
      env[key] = entry.slice(equal + 1); jwtKeys.push(key);
    }
    if (!env.PGRST_JWT_SECRET) throw Error("Disposable PostgREST JWT verification configuration missing");
    docker(["run", "-d", "--name", server, "--network", networks[0], "--publish", "127.0.0.1::3000",
      "-e", "PGRST_DB_URI", ...jwtKeys.flatMap(key => ["-e", key]),
      "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", rest.Config.Image], undefined, env);
    started = true;
    const address = docker(["port", server, "3000/tcp"]).toString().trim();
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw Error("Restored PostgREST must bind loopback only");
    const root = `http://${address}`;
    const deadline = Date.now() + 15000;
    let healthy = false;
    while (Date.now() < deadline) {
      try { healthy = (await fetch(`${root}/`, {signal: AbortSignal.timeout(1000)})).ok; } catch { /* startup only */ }
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!healthy) throw Error("Restored PostgREST did not become healthy");
    for (const who of [h.foreign, {...h.ownerA, token: h.ownerA.lowToken}])
      denied(await h.request(who, "rpc/get_aqvora_sales_invoice", {p_organization_id: c.org, p_invoice_id: invoice.id}, "POST", root), "42501");
    expect(await h.rpc(h.ownerB, "read_aqvora_currency_policy", {
      p_organization_id: c.org, p_currency: "PKR", p_as_of_date: e2eDate}, root)).toMatchObject({display_complete: true});
    const closed = await h.request(h.ownerA, "rpc/post_aqvora_journal", {organization_id: c.org,
      intent_key: randomUUID(), business_date: e2eDate, lines: [
        {account_id: receiptCash, debit_minor: "1", credit_minor: "0"},
        {account_id: c.revenue, debit_minor: "0", credit_minor: "1"}]}, "POST", root);
    denied(closed); expect(closed.data).toMatchObject({message: expect.stringMatching(/closed/i)});
    denied(await h.request(h.ownerA, "aqvora_journal_lines", {organization_id: c.org, account_id: ar}, "POST", root));
    const recovered = await h.rpc<SalesIssueReceipt>(h.ownerA, "lookup_aqvora_sales_issue", {
      p_organization_id: c.org, p_intent_key: issue.p_intent_key}, root);
    expect(recovered).toEqual(originalIssue);
    expect(await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", issue, root)).toEqual(originalIssue);
    for (const settlement of settlements) {
      expect(await h.rpc(h.ownerA, "lookup_aqvora_customer_receipt_issue", {
        p_organization_id: c.org, p_intent_key: settlement.args.p_intent_key}, root)).toEqual(settlement.response);
      expect(await h.rpc(h.ownerA, "post_aqvora_customer_receipt", settlement.args, root)).toEqual(settlement.response);
    }
    expect(await readE2EOpen(h, c, invoice.id, root)).toMatchObject({outstanding_minor: "0", allocated_minor: "150"});
    const books = await readE2EBooks(h, c, root);
    expect(books.tb.totals).toMatchObject({debit_minor: "300", credit_minor: "300"});
    expect(books.receivable.closingMinor).toBe("0");
    expect(await sqlE2ESnapshot(target, c)).toEqual(before);
    return {kind: "full_database_logical_restore", dump_bytes: dump.length, source_digest: evidenceHash(before),
      restored_digest: evidenceHash(await sqlE2ESnapshot(target, c)), issued_jwt_postgrest_verified: true,
      restored_auth_digest: await authDigest(target),
      restored_outstanding_minor: books.recon.outstanding_minor};
  } finally {
    if (started) docker(["rm", "-f", server]);
    if (target) await target.end();
    if (created) await h.db.query(`DROP DATABASE ${database} WITH (FORCE)`);
    if (roleCreated) await h.db.query(`DROP ROLE ${role}`);
  }
}
