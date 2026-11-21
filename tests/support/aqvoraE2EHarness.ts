import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Client} from "pg";
import {createClient} from "@supabase/supabase-js";
import {expect} from "vitest";
import {localIdentity, localAuthOptions, type LocalIdentity} from "./aqvoraLocalIdentity";
import {currencySeedSql} from "./aqvoraCurrencyFixture";
import {salesSeedSql, ar} from "./aqvoraSalesFixture";
import {receiptSeedSql, receiptCash} from "./aqvoraReceiptFixture";
import type {SalesInvoice, SalesIssueRequest} from "../../src/accounting/salesContracts";
import type {CashCollection, CustomerReceipt, PostCustomerReceiptRequest} from "../../src/accounting/receiptContracts";

export {ar, receiptCash};
export const e2eDate = "2026-11-20";
export const e2eLines = [{description: "TEST ONLY service", quantity_millionths: "1500000",
  unit_price_minor: "101", discount_minor: "2"}];
export type E2ECompany = {org: string; period: string; revenue: string; customer: string};
export type HttpResult = {status: number; data: unknown};
export type E2ERpc = <T>(actor: LocalIdentity | null, name: string, body: object, root?: string) => Promise<T>;
export const denied = (r: HttpResult, code?: string) => {
  expect(r.status, JSON.stringify(r.data)).toBeGreaterThanOrEqual(400);
  if (code) expect(r.data).toMatchObject({code});
};
export const sessionId = (who: LocalIdentity): string =>
  (JSON.parse(Buffer.from(who.token.split(".")[1], "base64url").toString()) as {session_id: string}).session_id;

/** Only disposable loopback endpoints and newly generated synthetic companies. */
export async function createE2EHarness(path: string) {
  if (process.env.AQVORA_DISPOSABLE_STACK !== "1") throw Error("Disposable Supabase marker required");
  const status = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  for (const value of [status.API_URL, status.DB_URL]) {
    if (!["127.0.0.1", "localhost"].includes(new URL(value).hostname)) throw Error("Loopback test services required");
  }
  const db = new Client({connectionString: status.DB_URL, application_name: "aqvora_e2e_observer"});
  await db.connect();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, localAuthOptions);
  const identities: LocalIdentity[] = [];
  try {
    for (let n = 0; n < 3; n++) identities.push(await localIdentity(status.API_URL, status.ANON_KEY, admin));
  } catch (error) { await db.end(); throw error; }
  const [ownerA, ownerB, foreign] = identities;
  expect(new Set(identities.map(x => x.id)).size).toBe(3);
  const request = async (actor: LocalIdentity | null, path: string, body?: object, method = "POST",
    root = `${status.API_URL}/rest/v1`): Promise<HttpResult> => {
    if (!["127.0.0.1", "localhost"].includes(new URL(root).hostname)) throw Error("Local PostgREST only");
    const response = await fetch(`${root}/${path}`, {method, signal: AbortSignal.timeout(15000),
      headers: {apikey: status.ANON_KEY, Authorization: `Bearer ${actor?.token ?? status.ANON_KEY}`,
        "Content-Type": "application/json", Prefer: "return=representation"},
      body: body === undefined ? undefined : JSON.stringify(body)});
    const text = await response.text();
    return {status: response.status, data: text ? JSON.parse(text) as unknown : null};
  };
  const rpc: E2ERpc = async <T>(actor: LocalIdentity | null, name: string, body: object, root?: string) => {
    const r = await request(actor, `rpc/${name}`, body, "POST", root);
    expect(r.status, `${name}: ${JSON.stringify(r.data)}`).toBe(200);
    return r.data as T;
  };
  const tryRpc = (actor: LocalIdentity | null, name: string, body: object) => request(actor, `rpc/${name}`, body);
  const company = async (): Promise<E2ECompany> => {
    const org = randomUUID();
    await db.query("INSERT INTO public.organizations(id,name,owner_name,currency,timezone) VALUES($1,'TEST ONLY E2E','Synthetic owners','PKR','UTC')", [org]);
    await db.query("INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES($1,$2,'OWNER',true),($1,$3,'OWNER',true)",
      [org, ownerA.id, ownerB.id]);
    expect((await db.query("SELECT * FROM public.aqvora_enabled_companies WHERE organization_id=$1", [org])).rows).toEqual([]);
    const period = await rpc<{id: string}>(ownerA, "create_aqvora_period", {p_organization_id: org,
      p_starts_on: "2026-01-01", p_ends_on: "2026-12-31"});
    const revenue = await rpc<{id: string}>(ownerA, "create_aqvora_account", {p_organization_id: org,
      p_code: "4000", p_name: "TEST ONLY service revenue", p_account_class: "revenue", p_normal_side: "credit",
      p_parent_id: null, p_is_posting: true});
    // Privileged provisioning is confined to this newly inserted synthetic company.
    // None of these reference fixtures represents a production/accountant approval.
    await db.query(currencySeedSql(org, ownerA.id));
    await db.query(salesSeedSql(org, ownerA.id, revenue.id));
    await db.query(receiptSeedSql(org, ownerA.id));
    const customer = await rpc<{id: string}>(ownerA, "create_aqvora_customer", {p_organization_id: org,
      p_code: "E2E-CUSTOMER", p_name: "TEST ONLY customer"});
    return {org, period: period.id, revenue: revenue.id, customer: customer.id};
  };
  const enroll = async (c: E2ECompany) => {
    expect((await db.query("SELECT count(*)::int n FROM public.aqvora_journals WHERE organization_id=$1", [c.org])).rows[0].n).toBe(0);
    await db.query("INSERT INTO public.aqvora_enabled_companies(organization_id) VALUES($1)", [c.org]);
  };
  const draft = (c: E2ECompany) => rpc<SalesInvoice>(ownerA, "create_aqvora_sales_draft", {
    p_organization_id: c.org, p_intent_key: randomUUID(), p_customer_id: c.customer,
    p_business_date: e2eDate, p_due_date: "2026-12-20", p_currency: "PKR", p_lines: e2eLines});
  const transition = (c: E2ECompany, d: SalesInvoice, action: string, who = ownerA) => rpc<SalesInvoice>(who,
    "transition_aqvora_sales_invoice", {p_organization_id: c.org, p_invoice_id: d.id,
      p_expected_revision: d.revision, p_action: action});
  const approved = async (c: E2ECompany) => transition(c, await transition(c, await draft(c), "submit"), "approve", ownerB);
  const issueArgs = (c: E2ECompany, d: SalesInvoice): SalesIssueRequest => ({p_organization_id: c.org,
    p_invoice_id: d.id, p_expected_revision: d.revision, p_fingerprint: d.fingerprint!, p_intent_key: randomUUID()});
  const cash = (c: E2ECompany, amount: string) => rpc<CashCollection>(ownerA, "create_aqvora_cash_collection", {
    p_organization_id: c.org, p_intent_key: randomUUID(), p_customer_id: c.customer, p_business_date: e2eDate,
    p_currency: "PKR", p_amount_minor: amount, p_source_kind: "controlled_cash"});
  const confirm = (c: E2ECompany, collection: CashCollection, who = ownerB) => rpc<CashCollection>(who,
    "confirm_aqvora_cash_collection", {p_organization_id: c.org, p_collection_id: collection.id,
      p_expected_revision: collection.revision, p_counted_minor: collection.amount_minor, p_attestation: "cash_counted_in_person"});
  const receiptDraft = (c: E2ECompany, collection: CashCollection, invoice: SalesInvoice, amount = collection.amount_minor) =>
    rpc<CustomerReceipt>(ownerA, "create_aqvora_customer_receipt_draft", {p_organization_id: c.org,
      p_intent_key: randomUUID(), p_collection_id: collection.id, p_allocations: [{invoice_id: invoice.id, amount_minor: amount}]});
  const receiptTransition = (c: E2ECompany, d: CustomerReceipt, action: string, who = ownerA) => rpc<CustomerReceipt>(who,
    "transition_aqvora_customer_receipt", {p_organization_id: c.org, p_receipt_id: d.id,
      p_expected_revision: d.revision, p_action: action});
  const prepareReceipt = async (c: E2ECompany, invoice: SalesInvoice, amount: string) => {
    const collection = await confirm(c, await cash(c, amount));
    const d = await receiptDraft(c, collection, invoice);
    return {collection, receipt: await receiptTransition(c, await receiptTransition(c, d, "submit"), "approve", ownerB)};
  };
  const receiptArgs = (c: E2ECompany, d: CustomerReceipt): PostCustomerReceiptRequest => ({p_organization_id: c.org,
    p_receipt_id: d.id, p_expected_revision: d.revision, p_fingerprint: d.fingerprint!, p_intent_key: randomUUID()});
  const close = async () => {
    for (const who of identities) await who.client.auth.signOut();
    await db.end();
  };
  return {status, db, ownerA, ownerB, foreign, request, rpc, tryRpc, company, enroll, draft, transition, approved,
    issueArgs, cash, confirm, receiptDraft, receiptTransition, prepareReceipt, receiptArgs, close};
}
export type E2EHarness = Awaited<ReturnType<typeof createE2EHarness>>;
