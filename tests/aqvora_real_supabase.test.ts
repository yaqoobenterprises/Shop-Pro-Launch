// @vitest-environment node
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GeneralLedgerPage, TrialBalancePage } from "../src/accounting/readContracts";

const statusPath = process.env.AQVORA_LOCAL_SUPABASE_STATUS;
type Status = Record<string, string>;
type ApiResult = { status: number; data: unknown };
type Identity = { id: string; client: SupabaseClient; token: string };

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/, "")) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Invalid TOTP secret from Auth");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits -= 8)) & 255); value &= (1 << bits) - 1; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return (((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0"));
}

describe.skipIf(!statusPath)("AQVORA real local Supabase Auth and PostgREST", () => {
  let db: Client;
  let apiUrl: string; let anonKey: string;
  let owner: Identity; let manager: Identity; let outsider: Identity;
  let org: string; let cash: string; let sales: string; let periodId: string;
  const authOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  const jwt = (token: string) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as
    { aal?: string; session_id?: string; sub?: string };
  const call = async (identity: Identity | null, path: string, body?: object, method = "POST"): Promise<ApiResult> => {
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      method,
      headers: { apikey: anonKey, Authorization: `Bearer ${identity?.token ?? anonKey}`,
        "Content-Type": "application/json", Prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as unknown : null };
  };
  const rpc = (identity: Identity | null, name: string, body: object) => call(identity, `rpc/${name}`, body);
  const readRequest = () => ({ p_organization_id: org,p_from_date: "2026-11-01",
    p_to_date: "2026-11-30",p_currency: "PKR" });
  const readTb = (identity: Identity | null, extra: object = {}) =>
    rpc(identity,"read_aqvora_trial_balance",{ ...readRequest(),...extra });
  const readGl = (identity: Identity | null, extra: object = {}) =>
    rpc(identity,"read_aqvora_general_ledger",{ ...readRequest(),
      p_account_id: cash ?? "00000000-0000-4000-8000-000000000000",...extra });
  const success = (result: ApiResult) => {
    expect(result.status, JSON.stringify(result.data)).toBeGreaterThanOrEqual(200);
    expect(result.status, JSON.stringify(result.data)).toBeLessThan(300);
    return result.data as Record<string, unknown>;
  };
  const denied = (result: ApiResult) => {
    expect(result.status, JSON.stringify(result.data)).toBeGreaterThanOrEqual(400);
  };
  const createIdentity = async (admin: SupabaseClient, label: string): Promise<Identity> => {
    const email = `aqvora-${label}-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString("hex");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("Auth user creation failed");
    const client = createClient(apiUrl, anonKey, authOptions);
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw signed.error ?? new Error("Auth sign-in failed");
    const token = signed.data.session.access_token;
    expect(jwt(token)).toMatchObject({ sub: created.data.user.id, aal: "aal1" });
    return { id: created.data.user.id, client, token };
  };
  const promote = async (identity: Identity) => {
    const enrolled = await identity.client.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data?.totp?.secret) {
      throw enrolled.error ?? new Error("Auth did not provide a TOTP secret");
    }
    const verified = await identity.client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
    const session = await identity.client.auth.getSession();
    if (session.error || !session.data.session) throw session.error ?? new Error("AAL2 session missing");
    identity.token = session.data.session.access_token;
    expect(jwt(identity.token)).toMatchObject({ sub: identity.id, aal: "aal2" });
  };

  beforeAll(async () => {
    if (process.env.AQVORA_DISPOSABLE_STACK !== "1") throw new Error("Disposable stack marker is required");
    const status = JSON.parse(readFileSync(statusPath!, "utf8")) as Status;
    apiUrl = status.API_URL;
    anonKey = status.ANON_KEY;
    const serviceKey = status.SERVICE_ROLE_KEY;
    const dbUrl = status.DB_URL;
    if (!apiUrl || !anonKey || !serviceKey || !dbUrl ||
        !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname) ||
        !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) {
      throw new Error("Real Supabase tests require local CLI endpoints and keys");
    }
    db = new Client({ connectionString: dbUrl });
    await db.connect();
    const admin = createClient(apiUrl, serviceKey, authOptions);
    owner = await createIdentity(admin, "owner");
    manager = await createIdentity(admin, "manager");
    outsider = await createIdentity(admin, "outsider");
    const organization = await db.query<{ organization_id: string }>(
      "SELECT organization_id FROM public.profiles WHERE id=$1", [owner.id]);
    org = organization.rows[0]?.organization_id;
    if (!org) throw new Error("Synthetic owner has no organization");
    await db.query(`INSERT INTO public.organization_members
      (organization_id,user_id,role,is_active) VALUES ($1,$2,'MANAGER',true)
      ON CONFLICT (organization_id,user_id) DO UPDATE SET role='MANAGER',is_active=true`, [org, manager.id]);
    await db.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)", [org]);
  }, 120000);
  afterAll(async () => { if (db) await db.end(); });

  it("uses issued AAL1/AAL2 JWTs for tenant-scoped RPC and table permissions", async () => {
    denied(await readTb(null)); denied(await readGl(null)); denied(await readTb(owner));
    denied(await readGl(owner));
    denied(await rpc(null, "list_aqvora_accounts", { p_organization_id: org }));
    denied(await rpc(owner, "list_aqvora_accounts", { p_organization_id: org }));
    denied(await rpc(owner, "create_aqvora_period", {
      p_organization_id: org, p_starts_on: "2026-11-01", p_ends_on: "2026-11-30",
    }));
    await promote(owner); await promote(manager); await promote(outsider);
    const period = success(await rpc(owner, "create_aqvora_period", {
      p_organization_id: org, p_starts_on: "2026-11-01", p_ends_on: "2026-11-30",
    }));
    periodId = String(period.id);
    const createAccount = (code: string, name: string, accountClass: string, side: string) =>
      rpc(owner, "create_aqvora_account", { p_organization_id: org, p_code: code,
        p_name: name, p_account_class: accountClass, p_normal_side: side,
        p_parent_id: null, p_is_posting: true });
    cash = String(success(await createAccount("1000", "Cash", "asset", "debit")).id);
    sales = String(success(await createAccount("4000", "Sales", "revenue", "credit")).id);
    const empty = success(await readTb(manager)) as unknown as TrialBalancePage;
    expect(empty.source).toMatchObject({ source_complete: true,source_journal_count: "0",
      legacy_included: false,opening_migration_verified: false });
    expect(empty.totals.debit_minor).toBe("0");
    expect(success(await readGl(manager))).toMatchObject({ rows: [],matched_count: "0" });
    denied(await readTb(outsider)); denied(await readGl(outsider));
    expect(success(await rpc(manager, "list_aqvora_accounts", { p_organization_id: org }))).toHaveLength(2);
    const events = success(await rpc(manager, "list_aqvora_admin_events", {
      p_organization_id: org,
    })) as unknown as Array<{ id: number }>;
    expect(events).toHaveLength(3);
    denied(await rpc(manager, "create_aqvora_period", {
      p_organization_id: org, p_starts_on: "2026-12-01", p_ends_on: "2026-12-31",
    }));
    denied(await rpc(outsider, "list_aqvora_admin_events", { p_organization_id: org }));
    denied(await rpc(outsider, "create_aqvora_account", { p_organization_id: org,
      p_code: "9999", p_name: "Foreign", p_account_class: "asset", p_normal_side: "debit",
      p_parent_id: null, p_is_posting: true }));
    expect(success(await call(outsider, `aqvora_accounts?organization_id=eq.${org}`, undefined, "GET"))).toEqual([]);
    denied(await call(owner, "aqvora_accounts", { organization_id: org, code: "9000",
      name: "Bypass", account_class: "asset", normal_side: "debit", is_posting: true }));
    denied(await call(owner, "aqvora_admin_audit", { organization_id: org }));
    denied(await call(owner, `aqvora_admin_audit?id=eq.${events[0].id}`,
      { reason: "rewrite" }, "PATCH"));
    denied(await call(owner, `aqvora_admin_audit?id=eq.${events[0].id}`,
      undefined, "DELETE"));
    denied(await rpc(owner, "aqvora_admin_authorize", { p_org: org }));
  }, 120000);

  it("posts one journal for racing requests and recovers its receipt after close", async () => {
    const intent = `real-${randomUUID()}`;
    const posting = { organization_id: org, intent_key: intent, business_date: "2026-11-20",
      lines: [{ account_id: cash, debit_minor: "101", credit_minor: "0" },
        { account_id: sales, debit_minor: "0", credit_minor: "101" }] };
    const [first, retry] = await Promise.all([
      rpc(owner, "post_aqvora_journal", posting), rpc(owner, "post_aqvora_journal", posting),
    ]);
    const receipt = success(first);
    expect(success(retry).journal_id).toBe(receipt.journal_id);
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.aqvora_journals WHERE organization_id=$1 AND intent_key=$2",
      [org, intent]);
    expect(count.rows[0].n).toBe(1);
    expect(success(await rpc(owner, "lookup_aqvora_receipt", {
      organization_id: org, intent_key: intent,
    })).journal_id).toBe(receipt.journal_id);
    expect(success(await rpc(owner, "close_aqvora_period", {
      p_organization_id: org, p_period_id: periodId, p_expected_revision: 1,
      p_reason: "Synthetic close",
    })).state).toBe("closed");
    denied(await rpc(owner, "post_aqvora_journal", { ...posting, intent_key: `closed-${randomUUID()}` }));
    expect(success(await rpc(owner, "lookup_aqvora_receipt", {
      organization_id: org, intent_key: intent,
    })).journal_id).toBe(receipt.journal_id);
    expect(success(await rpc(owner, "reopen_aqvora_period", {
      p_organization_id: org, p_period_id: periodId, p_expected_revision: 2,
      p_reason: "Synthetic correction",
    })).reopen_count).toBe(1);
    expect(success(await rpc(owner, "archive_aqvora_account", {
      p_organization_id: org, p_account_id: cash, p_expected_revision: 1,
      p_reason: "Synthetic retirement",
    })).is_active).toBe(false);
    denied(await rpc(owner, "post_aqvora_journal", { ...posting, intent_key: `archived-${randomUUID()}` }));
  }, 120000);

  it("serves exact GL/TB pages through real PostgREST with source drift and reversal checks", async () => {
    const account = success(await rpc(owner,"create_aqvora_account",{ p_organization_id: org,
      p_code: "1010",p_name: "Read test cash",p_account_class: "asset",p_normal_side: "debit",
      p_parent_id: null,p_is_posting: true }));
    const accountId = String(account.id);
    const posting = { organization_id: org,intent_key: `read-${randomUUID()}`,business_date: "2026-11-20",
      lines: [{ account_id: accountId,debit_minor: "9223372036854775807",credit_minor: "0" },
        { account_id: sales,debit_minor: "0",credit_minor: "9223372036854775807" }] };
    const [one,retry] = await Promise.all([rpc(owner,"post_aqvora_journal",posting),rpc(owner,"post_aqvora_journal",posting)]);
    expect(success(one).journal_id).toBe(success(retry).journal_id);
    const first = success(await readGl(manager,{ p_account_id: accountId,p_limit: 1 })) as unknown as GeneralLedgerPage;
    success(await rpc(owner,"post_aqvora_journal",{ ...posting,intent_key: `read-${randomUUID()}` }));
    const drift = await readTb(manager,{ p_snapshot_token: first.source.snapshot_token });
    denied(drift); expect(drift.data).toMatchObject({ code: "40001" });
    const report = success(await readTb(manager,{ p_limit: 1 })) as unknown as TrialBalancePage;
    expect(report.totals.debit_minor).toBe("18446744073709551715");
    const ledger = success(await readGl(manager,{ p_account_id: accountId,p_limit: 1,
      p_snapshot_token: report.source.snapshot_token })) as unknown as GeneralLedgerPage;
    expect(ledger.closing_minor).toBe("18446744073709551614");
    const args = { p_account_id: accountId,p_limit: 1,p_cursor: ledger.next_cursor,
      p_snapshot_token: ledger.source.snapshot_token };
    const second = success(await readGl(manager,args)) as unknown as GeneralLedgerPage;
    expect(second.rows[0]).toMatchObject({ ordinal: "2",running_balance_minor: "18446744073709551614" });
    expect(second.has_more).toBe(false);
    expect((success(await readGl(manager,args)) as unknown as GeneralLedgerPage).rows).toEqual(second.rows);
    denied(await readGl(manager,{ ...args,p_account_id: sales }));
    const tbSecond = success(await readTb(manager,{ p_limit: 1,p_cursor: report.next_cursor,
      p_snapshot_token: report.source.snapshot_token })) as unknown as TrialBalancePage;
    expect(tbSecond.rows[0].ordinal).toBe("2");
    expect(tbSecond.totals).toEqual(report.totals);
    denied(await readTb(manager,{ p_currency: "USD" }));
    denied(await readTb(manager,{ p_to_date: "2026-02-30" }));
    denied(await readTb(manager,{ p_limit: 201 }));
    const original = (success(await readGl(manager)) as unknown as GeneralLedgerPage).rows[0];
    success(await rpc(owner,"reverse_aqvora_journal",{ organization_id: org,original_journal_id: original.journal_id,
      intent_key: `reverse-read-${randomUUID()}`,business_date: "2026-11-21",reason: "Synthetic correction" }));
    const reversed = success(await readGl(manager)) as unknown as GeneralLedgerPage;
    expect(reversed).toMatchObject({ closing_minor: "0",debit_minor: "101",credit_minor: "101" });
    expect(reversed.rows[1].reversal_of).toBe(original.journal_id);
    expect(reversed.account.is_active).toBe(false);
    denied(await call(owner,`aqvora_journals?id=eq.${original.journal_id}`,{ total_minor: "1" },"PATCH"));
    denied(await call(owner,"aqvora_journal_lines",{ organization_id: org,journal_id: original.journal_id }));
    denied(await rpc(owner,"aqvora_certify_read",{ p_org: org }));
  },120000);

  it("rejects revoked sessions and inactive memberships and preserves audit rows", async () => {
    const audit = await db.query<{ id: number }>(
      "SELECT id FROM public.aqvora_admin_audit WHERE organization_id=$1 ORDER BY id LIMIT 1", [org]);
    await expect(db.query("UPDATE public.aqvora_admin_audit SET reason='rewrite' WHERE id=$1",
      [audit.rows[0].id])).rejects.toThrow("immutable");
    await db.query("UPDATE public.organization_members SET role='CASHIER' WHERE organization_id=$1 AND user_id=$2",
      [org, manager.id]);
    denied(await rpc(manager, "list_aqvora_admin_events", { p_organization_id: org }));
    denied(await readTb(manager)); denied(await readGl(manager));
    await db.query("UPDATE public.organization_members SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2",
      [org, manager.id]);
    await db.query("DELETE FROM auth.sessions WHERE id=$1", [jwt(manager.token).session_id]);
    denied(await rpc(manager, "list_aqvora_admin_events", { p_organization_id: org }));
    denied(await readTb(manager)); denied(await readGl(manager));
    await db.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2",
      [org, owner.id]);
    denied(await rpc(owner, "list_aqvora_admin_events", { p_organization_id: org }));
    denied(await readTb(owner)); denied(await readGl(owner));
    denied(await rpc(owner, "create_aqvora_period", {
      p_organization_id: org, p_starts_on: "2026-12-01", p_ends_on: "2026-12-31",
    }));
  }, 120000);
});
