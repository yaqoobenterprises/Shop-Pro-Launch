// @vitest-environment node
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {currencyFixtureSql, currencySeedSql, readIds as i} from "./support/aqvoraCurrencyFixture";
import {receiptHarness} from "./support/aqvoraReceiptFixture";
import {receiptFixtureSql} from "./support/aqvoraReceiptFixture";
import {currencyMigrationSql} from "./support/aqvoraCurrencyFixture";
import {readFileSync} from "node:fs";

const readIntegritySql = readFileSync(new URL(
  "../supabase/migrations/20261121065636_aqvora_currency_source_read_integrity.sql", import.meta.url), "utf8");

describe("Currency evidence on unposted source reads", () => {
  const h = receiptHarness();
  beforeAll(async () => h.db.exec(currencyFixtureSql()), 60000);
  beforeEach(async () => { await h.db.exec("BEGIN"); await h.user(); });
  afterEach(async () => h.db.exec("ROLLBACK; RESET ROLE"));
  afterAll(async () => h.db.close());

  const source = async (kind: "invoice" | "cash" | "receipt", submitted = false) => {
    const customer = await h.customer();
    if (kind === "invoice") {
      const draft = await h.draft(customer);
      const doc = submitted ? await h.transition(draft, "submit") : draft;
      return {id: doc.id, table: "aqvora_sales_invoices", get: "get_aqvora_sales_invoice",
        list: "list_aqvora_sales_invoices"};
    }
    const invoice = await h.invoice(customer);
    const cash = await h.cash(customer, "60");
    if (kind === "cash") return {id: cash.id, table: "aqvora_cash_collections",
      get: "get_aqvora_cash_collection", list: "list_aqvora_cash_collections"};
    const draft = await h.draftReceipt(await h.confirm(cash), [{invoice_id: invoice.id, amount_minor: "60"}]);
    const doc = submitted ? await h.receiptTransition(draft, "submit") : draft;
    return {id: doc.id, table: "aqvora_customer_receipts", get: "get_aqvora_customer_receipt",
      list: "list_aqvora_customer_receipts"};
  };
  const corrupt = async (s: Awaited<ReturnType<typeof source>>, assignment: string) => {
    await h.db.exec("RESET ROLE");
    await h.db.exec(`ALTER TABLE public.${s.table} DISABLE TRIGGER USER`);
    await h.query(`UPDATE public.${s.table} SET ${assignment} WHERE organization_id=$1 AND id=$2`, [i.org, s.id]);
    await h.db.exec(`ALTER TABLE public.${s.table} ENABLE TRIGGER USER`);
    await h.user();
  };
  const expectDenied = async (s: Awaited<ReturnType<typeof source>>) => {
    await expect(h.query(`SELECT public.${s.get}($1,$2)`, [i.org, s.id])).rejects.toMatchObject({code: "23514"});
    await expect(h.query(`SELECT public.${s.list}($1)`, [i.org])).rejects.toMatchObject({code: "23514"});
  };

  it.each(["invoice", "cash", "receipt"] as const)("rejects a future revision on an older %s draft", async kind => {
    const s = await source(kind);
    await h.db.exec("RESET ROLE");
    await h.db.exec(currencySeedSql(i.org, i.owner, "PKR", 2, 2, "2026-12-01"));
    await corrupt(s, "currency_policy_revision=2");
    await expectDenied(s);
  });
  it.each(["invoice", "cash", "receipt"] as const)("rejects a removed binding on a configured %s draft", async kind => {
    const s = await source(kind);
    await corrupt(s, "currency_policy_revision=NULL");
    await expectDenied(s);
  });
  it.each(["invoice", "cash", "receipt"] as const)("rejects contradictory %s draft currency", async kind => {
    const s = await source(kind);
    await corrupt(s, "currency='USD'");
    await expectDenied(s);
  });
  it.each(["invoice", "receipt"] as const)("rejects incorrect %s submitted policy snapshots before posting", async kind => {
    const s = await source(kind, true);
    await corrupt(s, "policy_snapshot=jsonb_set(policy_snapshot,'{currency_policy,currency_exponent}','0')");
    await expectDenied(s);
  });
  it.each(["invoice", "receipt"] as const)("rejects missing %s submitted currency evidence", async kind => {
    const s = await source(kind, true);
    await corrupt(s, "policy_snapshot=policy_snapshot-'currency_policy'");
    await expectDenied(s);
  });
  it("keeps a valid historical draft and its audit unchanged after future reattestation", async () => {
    const s = await source("invoice", true);
    const get = () => h.query(`SELECT public.${s.get}($1,$2) r`, [i.org, s.id]);
    const audit = () => h.query("SELECT public.list_aqvora_sales_audit($1,$2) r", [i.org, s.id]);
    const before = (await get()).rows;
    const beforeAudit = (await audit()).rows;
    await h.db.exec("RESET ROLE");
    await h.db.exec(currencySeedSql(i.org, i.owner, "PKR", 2, 2, "2026-12-01"));
    await h.user();
    expect((await get()).rows).toEqual(before);
    expect((await audit()).rows).toEqual(beforeAudit);
  });
});

it("upgrades populated #78 sources without changing valid JSON, audit, replay or report tokens", async () => {
  const h = receiptHarness();
  try {
    await h.db.exec(currencyFixtureSql().replace(readIntegritySql, "") + "BEGIN");
    await h.user();
    const customer = await h.customer();
    const invoice = await h.invoice(customer, "150");
    const cash = await h.confirm(await h.cash(customer, "60"));
    const receipt = await h.approveReceipt(await h.draftReceipt(cash, [{invoice_id: invoice.id, amount_minor: "60"}]));
    const intent = h.key();
    const posted = await h.postReceipt(receipt, intent);
    const snapshot = async () => ({
      invoice: await h.get(invoice.id),
      receipt: (await h.query("SELECT public.get_aqvora_customer_receipt($1,$2) r", [i.org, receipt.id])).rows,
      cash: (await h.query("SELECT public.get_aqvora_cash_collection($1,$2) r", [i.org, cash.id])).rows,
      audit: (await h.query("SELECT public.list_aqvora_receipt_audit($1,'receipt',$2) r", [i.org, receipt.id])).rows,
      open: await h.openBalance(invoice.id),
      token: (await h.query<{r: string}>(`SELECT public.read_aqvora_trial_balance($1,
        '2026-01-01','2026-12-31','PKR')->'source'->>'snapshot_token' r`, [i.org])).rows[0].r,
    });
    const before = await snapshot();
    await h.db.exec("RESET ROLE");
    await h.db.exec(readIntegritySql);
    await h.user();
    expect(await snapshot()).toEqual(before);
    expect(await h.postReceipt(receipt, intent)).toEqual(posted);
  } finally { await h.db.close(); }
}, 60000);

it("preserves unconfigured legacy drafts and their cancellation after the currency upgrade", async () => {
  const h = receiptHarness();
  try {
    await h.db.exec(receiptFixtureSql() + "BEGIN");
    await h.user();
    const customer = await h.customer();
    const invoice = await h.draft(customer);
    const cash = await h.cash(customer);
    const getCash = () => h.query("SELECT public.get_aqvora_cash_collection($1,$2) r", [i.org, cash.id]);
    const before = await h.get(invoice.id);
    const beforeCash = (await getCash()).rows;
    await h.db.exec("RESET ROLE");
    await h.db.exec(currencyMigrationSql());
    await h.user();
    expect(await h.get(invoice.id)).toEqual(before);
    expect((await getCash()).rows).toEqual(beforeCash);
    expect(await h.transition(invoice, "cancel", "Unconfigured legacy draft")).toMatchObject({state: "cancelled"});
    expect((await h.query<{r: {state: string}}>("SELECT public.cancel_aqvora_cash_collection($1,$2,$3,'Legacy claim') r",
      [i.org, cash.id, cash.revision])).rows[0].r.state).toBe("cancelled");
  } finally { await h.db.close(); }
}, 60000);
