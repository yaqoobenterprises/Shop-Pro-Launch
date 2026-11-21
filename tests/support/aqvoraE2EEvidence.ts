import {createHash} from "node:crypto";
import {readdirSync, readFileSync} from "node:fs";
import type {Client} from "pg";
import {expect} from "vitest";
import {readVerifiedGeneralLedger} from "../../src/accounting/verifiedGeneralLedger";
import {readVerifiedTrialBalance} from "../../src/accounting/verifiedTrialBalance";
import {verifyReceivablesReconciliation, verifyInvoiceOpenBalance} from "../../src/accounting/verifiedReceiptReads";
import {validateReportCurrencyEvidence, formatCertifiedReportMoney} from "../../src/accounting/currencyReportEvidence";
import {ar, receiptCash, e2eDate, type E2ECompany, type E2EHarness} from "./aqvoraE2EHarness";

export const evidenceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function migrationManifest() {
  const root = new URL("../../supabase/migrations/", import.meta.url);
  return readdirSync(root).filter(x => x.endsWith(".sql")).sort().map(name => ({name,
    sha256: createHash("sha256").update(readFileSync(new URL(name, root))).digest("hex")}));
}
export async function readE2EBooks(h: E2EHarness, c: E2ECompany, root?: string) {
  const request = {p_organization_id: c.org, p_from_date: "0001-01-01", p_to_date: e2eDate, p_currency: "PKR"};
  const options = {pageSize: 1, maxPages: 10, maxRows: 20};
  const tb = await readVerifiedTrialBalance(args => h.rpc(h.ownerA, "read_aqvora_trial_balance", args, root), request, options);
  const gl = async (id: string) => readVerifiedGeneralLedger(args => h.rpc(h.ownerA, "read_aqvora_general_ledger", args, root),
    {...request, p_account_id: id}, options);
  const receivable = await gl(ar), cash = await gl(receiptCash), revenue = await gl(c.revenue);
  const context = {organizationId: c.org, currency: "PKR", asOfDate: e2eDate};
  const recon = verifyReceivablesReconciliation(await h.rpc(h.ownerA, "read_aqvora_receivables", {
    p_organization_id: c.org, p_currency: "PKR", p_as_of_date: e2eDate}, root), context);
  for (const source of [tb.source, receivable.source, cash.source, revenue.source, recon.source]) {
    expect(source.snapshot_token).toBe(tb.source.snapshot_token);
    expect(source).toMatchObject({authorized_user_id: h.ownerA.id, authorized_role: "OWNER",
      legacy_included: false, opening_migration_verified: false, source_complete: true, display_complete: true});
    expect(source.currency_policy).toEqual(tb.source.currency_policy);
  }
  expect(tb.rows).toHaveLength(3);
  expect(tb.pageCount).toBe(3);
  const currency = validateReportCurrencyEvidence(tb.source, context);
  expect(currency?.display_complete).toBe(true);
  expect(formatCertifiedReportMoney("150", "PKR", currency)).toBe("PKR 1.50");
  return {tb, receivable, cash, revenue, recon};
}
export async function readE2EOpen(h: E2EHarness, c: E2ECompany, invoice: string, root?: string) {
  return verifyInvoiceOpenBalance(await h.rpc(h.ownerA, "get_aqvora_invoice_open_balance", {
    p_organization_id: c.org, p_invoice_id: invoice, p_as_of_date: e2eDate}, root),
  {organizationId: c.org, customerId: c.customer, currency: "PKR", asOfDate: e2eDate, invoiceId: invoice});
}
/** Independent table arithmetic, not a restatement of RPC-derived totals. */
export async function sqlE2ESnapshot(db: Client, c: E2ECompany) {
  const journals = (await db.query(`SELECT id::text,intent_key,source_kind,source_id::text,
    total_minor::text,payload,posted_by::text FROM public.aqvora_journals WHERE organization_id=$1 ORDER BY id`, [c.org])).rows;
  const lines = (await db.query(`SELECT journal_id::text,line_no,account_id::text,debit_minor::text,credit_minor::text,
    party_id,open_item_id FROM public.aqvora_journal_lines WHERE organization_id=$1 ORDER BY journal_id,line_no`, [c.org])).rows;
  const totals = (await db.query(`SELECT coalesce(sum(debit_minor),0)::text debit,
    coalesce(sum(credit_minor),0)::text credit FROM public.aqvora_journal_lines WHERE organization_id=$1`, [c.org])).rows[0];
  const invoices = (await db.query(`SELECT id::text,face_minor::text,state,revision::text,fingerprint,
    currency_policy_revision::text FROM public.aqvora_sales_invoices WHERE organization_id=$1 ORDER BY id`, [c.org])).rows;
  const allocations = (await db.query(`SELECT id::text,receipt_id::text,invoice_id::text,amount_minor::text,journal_id::text,line_no
    FROM public.aqvora_receipt_allocations WHERE organization_id=$1 ORDER BY id`, [c.org])).rows;
  const issues = (await db.query("SELECT response FROM public.aqvora_receipt_issues WHERE organization_id=$1 ORDER BY intent_key", [c.org])).rows;
  const salesIssues = (await db.query("SELECT response FROM public.aqvora_sales_issue_receipts WHERE organization_id=$1 ORDER BY intent_key", [c.org])).rows;
  const policies = (await db.query("SELECT to_jsonb(p) p FROM private.aqvora_currency_policies p WHERE organization_id=$1 ORDER BY revision", [c.org])).rows;
  const audit = (await db.query(`SELECT to_jsonb(a) a FROM public.aqvora_journal_audit a WHERE organization_id=$1 ORDER BY id`, [c.org])).rows;
  return {journals, lines, totals, invoices, allocations, issues, salesIssues, policies, audit};
}
export async function seedLegacySentinel(h: E2EHarness) {
  const org = (await h.db.query("SELECT organization_id FROM public.profiles WHERE id=$1", [h.ownerA.id])).rows[0].organization_id as string;
  const created = await h.request(h.ownerA, "payment_accounts", {organization_id: org, name: "TEST ONLY legacy sentinel", type: "CASH"});
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const account = (created.data as Array<{id: string}>)[0].id;
  const posted = await h.request(h.ownerA, "transactions", {organization_id: org, type: "income", amount_paisa: "777",
    account_id: account, business_date: e2eDate, raw_text: "TEST ONLY legacy sentinel", idempotency_key: `e2e-legacy-${account}`,
    created_by: h.ownerA.id, created_by_name: "Synthetic OWNER"});
  expect(posted.status, JSON.stringify(posted.data)).toBe(201);
  expect((await h.db.query("SELECT balance_paisa::text n FROM public.payment_accounts WHERE id=$1", [account])).rows[0].n).toBe("777");
  const snapshot = async (db = h.db) => (await db.query(`SELECT jsonb_build_object(
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.payment_accounts a WHERE organization_id=$1),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.transactions t WHERE organization_id=$1),
    'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.account_ledger_entries l WHERE organization_id=$1),
    'drafts',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM public.transaction_drafts d WHERE organization_id=$1)) r`, [org])).rows[0].r;
  expect((await h.db.query("SELECT * FROM public.aqvora_enabled_companies WHERE organization_id=$1", [org])).rows).toEqual([]);
  return {org, snapshot, before: await snapshot()};
}
