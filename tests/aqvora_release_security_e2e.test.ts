// @vitest-environment node
import {randomUUID} from "node:crypto";
import {Client} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createE2EHarness, denied, sessionId, e2eDate, ar, type E2EHarness} from "./support/aqvoraE2EHarness";
import {currencySeedSql} from "./support/aqvoraCurrencyFixture";
import {readE2EBooks, readE2EOpen, sqlE2ESnapshot} from "./support/aqvoraE2EEvidence";
import {readVerifiedTrialBalance} from "../src/accounting/verifiedTrialBalance";
import type {SalesInvoice, SalesIssueReceipt} from "../src/accounting/salesContracts";
import type {TrialBalancePage} from "../src/accounting/readContracts";

const statusPath = process.env.AQVORA_LOCAL_SUPABASE_STATUS;
describe.skipIf(!statusPath)("Release candidate security through actual Auth/PostgREST", () => {
  let h: E2EHarness;
  beforeAll(async () => { h = await createE2EHarness(statusPath!); }, 120000);
  afterAll(async () => { if (h) await h.close(); });
  const issuedCompany = async () => {
    const c = await h.company(), invoice = await h.approved(c), args = h.issueArgs(c, invoice);
    await h.enroll(c);
    const issue = await h.rpc<SalesIssueReceipt>(h.ownerA, "issue_aqvora_sales_invoice", args);
    return {c, invoice, args, issue};
  };

  it("denies AAL1, anonymous, cross-company identities, IDs and user-metadata impersonation", async () => {
    const {c, invoice} = await issuedCompany();
    const read = {p_organization_id: c.org, p_invoice_id: invoice.id};
    for (const actor of [null, h.foreign, {...h.ownerA, token: h.ownerA.lowToken}]) {
      denied(await h.tryRpc(actor, "get_aqvora_sales_invoice", read));
      denied(await h.tryRpc(actor, "read_aqvora_currency_policy", {p_organization_id: c.org, p_currency: "PKR", p_as_of_date: e2eDate}));
    }
    const other = await h.company();
    denied(await h.tryRpc(h.ownerA, "get_aqvora_sales_invoice", {...read, p_organization_id: other.org}));
    denied(await h.tryRpc(h.ownerA, "create_aqvora_sales_draft", {p_organization_id: c.org, p_intent_key: randomUUID(),
      p_customer_id: other.customer, p_business_date: e2eDate, p_due_date: e2eDate, p_currency: "PKR",
      p_lines: [{description: "Foreign customer", quantity_millionths: "1000000", unit_price_minor: "1", discount_minor: "0"}]}));
    expect((await h.foreign.client.auth.updateUser({data: {role: "OWNER", organization_id: c.org}})).error).toBeNull();
    const refreshed = await h.foreign.client.auth.refreshSession(); expect(refreshed.error).toBeNull();
    denied(await h.tryRpc({...h.foreign, token: refreshed.data.session!.access_token}, "get_aqvora_sales_invoice", read));
    denied(await h.request(h.ownerA, "aqvora_journals", {organization_id: c.org}));
    denied(await h.request(h.ownerA, "aqvora_currency_policies", undefined, "GET"));
    denied(await h.tryRpc(h.ownerA, "aqvora_currency_source_policy", {p_org: c.org}));
  });

  it("requires independent OWNER approval for invoice, cash and customer receipt", async () => {
    const c = await h.company(); let d = await h.transition(c, await h.draft(c), "submit");
    denied(await h.tryRpc(h.ownerA, "transition_aqvora_sales_invoice", {p_organization_id: c.org,
      p_invoice_id: d.id, p_expected_revision: d.revision, p_action: "approve"}));
    d = await h.transition(c, d, "approve", h.ownerB); await h.enroll(c);
    await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", h.issueArgs(c, d));
    const cash = await h.cash(c, "60");
    denied(await h.tryRpc(h.ownerA, "confirm_aqvora_cash_collection", {p_organization_id: c.org,
      p_collection_id: cash.id, p_expected_revision: cash.revision, p_counted_minor: "60", p_attestation: "cash_counted_in_person"}));
    const receipt = await h.receiptTransition(c, await h.receiptDraft(c, await h.confirm(c, cash), d), "submit");
    denied(await h.tryRpc(h.ownerA, "transition_aqvora_customer_receipt", {p_organization_id: c.org,
      p_receipt_id: receipt.id, p_expected_revision: receipt.revision, p_action: "approve"}));
    expect(await h.receiptTransition(c, receipt, "approve", h.ownerB)).toMatchObject({approved_by: h.ownerB.id});
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(1);
  });

  it("blocks approval when trusted service policy changes after submission", async () => {
    const c = await h.company(), d = await h.transition(c, await h.draft(c), "submit");
    await h.db.query("UPDATE private.aqvora_sales_policies SET revision=revision+1,evidence='TEST ONLY changed policy' WHERE organization_id=$1", [c.org]);
    denied(await h.tryRpc(h.ownerB, "transition_aqvora_sales_invoice", {p_organization_id: c.org,
      p_invoice_id: d.id, p_expected_revision: d.revision, p_action: "approve"}));
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(0);
  });

  it("serializes concurrent submission and rejects altered, foreign-actor and duplicate issuance intents", async () => {
    const c = await h.company(), draft = await h.draft(c);
    const submit = {p_organization_id: c.org, p_invoice_id: draft.id, p_expected_revision: draft.revision, p_action: "submit"};
    const results = await Promise.all([h.tryRpc(h.ownerA, "transition_aqvora_sales_invoice", submit),
      h.tryRpc(h.ownerA, "transition_aqvora_sales_invoice", submit)]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status >= 400)).toHaveLength(1);
    const approved = await h.transition(c, results.find(r => r.status === 200)!.data as SalesInvoice, "approve", h.ownerB);
    await h.enroll(c); const args = h.issueArgs(c, approved);
    const original = await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", args);
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", {...args, p_fingerprint: "0".repeat(64)}));
    denied(await h.tryRpc(h.ownerB, "issue_aqvora_sales_invoice", args));
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", {...args, p_intent_key: randomUUID()}));
    const other = await h.approved(c);
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", {...h.issueArgs(c, other), p_intent_key: args.p_intent_key}));
    expect(await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", args)).toEqual(original);
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(1);
    expect((await h.db.query("SELECT last_number::text n FROM private.aqvora_sales_numbers WHERE organization_id=$1", [c.org])).rows[0].n).toBe("1");
  });

  it("blocks new issue in a closed period and preserves exact recovery after later closure", async () => {
    const c = await h.company(), d = await h.approved(c); await h.enroll(c);
    const args = h.issueArgs(c, d);
    await h.rpc(h.ownerB, "close_aqvora_period", {p_organization_id: c.org, p_period_id: c.period, p_expected_revision: "1", p_reason: "TEST ONLY closed"});
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", args));
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(0);
    await h.rpc(h.ownerB, "reopen_aqvora_period", {p_organization_id: c.org, p_period_id: c.period, p_expected_revision: "2", p_reason: "TEST ONLY reopen"});
    const issued = await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", args);
    await h.rpc(h.ownerB, "close_aqvora_period", {p_organization_id: c.org, p_period_id: c.period, p_expected_revision: "3", p_reason: "TEST ONLY close again"});
    expect(await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", args)).toEqual(issued);
  });

  it("rejects incomplete/repeated real report pages and restarts on policy-source drift", async () => {
    const {c, invoice} = await issuedCompany();
    const r = await h.prepareReceipt(c, invoice, "60"); await h.rpc(h.ownerA, "post_aqvora_customer_receipt", h.receiptArgs(c, r.receipt));
    const request = {p_organization_id: c.org, p_from_date: "0001-01-01", p_to_date: "2026-12-31", p_currency: "PKR"};
    const first = await h.rpc<TrialBalancePage>(h.ownerA, "read_aqvora_trial_balance", {...request, p_limit: 1});
    expect(first.has_more).toBe(true);
    await expect(readVerifiedTrialBalance(async () => first, request, {pageSize: 1})).rejects.toThrow(/ordinal|cursor|incomplete/i);
    await expect(readVerifiedTrialBalance(async () => ({...first, rows: [], returned_count: 0, has_more: false, next_cursor: null}),
      request, {pageSize: 1})).rejects.toThrow(/incomplete|count|row/i);
    await h.db.query(currencySeedSql(c.org, h.ownerA.id, "PKR", 2, 2, "2026-11-21"));
    denied(await h.tryRpc(h.ownerA, "read_aqvora_trial_balance", {...request, p_limit: 1,
      p_cursor: first.next_cursor, p_snapshot_token: first.source.snapshot_token}), "40001");
  });

  it("fails closed across invoice, receipt, AR, GL and TB after currency corruption", async () => {
    const {c, invoice} = await issuedCompany();
    const receipt = await h.prepareReceipt(c, invoice, "60");
    await h.rpc(h.ownerA, "post_aqvora_customer_receipt", h.receiptArgs(c, receipt.receipt));
    const before = await sqlE2ESnapshot(h.db, c);
    const change = async (exponent: number) => {
      await h.db.query("BEGIN;ALTER TABLE private.aqvora_currency_policies DISABLE TRIGGER USER");
      await h.db.query("UPDATE private.aqvora_currency_policies SET exponent=$1 WHERE organization_id=$2", [exponent, c.org]);
      await h.db.query("ALTER TABLE private.aqvora_currency_policies ENABLE TRIGGER USER;COMMIT");
    };
    try {
      await change(0);
      const scope = {p_organization_id: c.org, p_currency: "PKR"};
      for (const [name, args] of [
        ["get_aqvora_sales_invoice", {p_organization_id: c.org, p_invoice_id: invoice.id}],
        ["get_aqvora_customer_receipt", {p_organization_id: c.org, p_receipt_id: receipt.receipt.id}],
        ["read_aqvora_receivables", {...scope, p_as_of_date: e2eDate}],
        ["read_aqvora_general_ledger", {...scope, p_from_date: "0001-01-01", p_to_date: e2eDate, p_account_id: ar}],
        ["read_aqvora_trial_balance", {...scope, p_from_date: "0001-01-01", p_to_date: e2eDate}],
      ] as const) denied(await h.tryRpc(h.ownerA, name, args), "23514");
    } finally { await change(2); }
    expect(await sqlE2ESnapshot(h.db, c)).toEqual(before);
    expect((await readE2EBooks(h, c)).recon.outstanding_minor).toBe("90");
  });

  it("keeps posted journals, source receipts and allocations immutable", async () => {
    const {c, invoice, issue} = await issuedCompany();
    const receipt = await h.prepareReceipt(c, invoice, "60"); await h.rpc(h.ownerA, "post_aqvora_customer_receipt", h.receiptArgs(c, receipt.receipt));
    const before = await sqlE2ESnapshot(h.db, c);
    for (const table of ["aqvora_journals", "aqvora_journal_lines", "aqvora_posting_receipts", "aqvora_receipt_allocations"])
      await expect(h.db.query(`DELETE FROM public.${table} WHERE organization_id=$1`, [c.org])).rejects.toThrow(/immutable/i);
    denied(await h.request(h.ownerA, `aqvora_journals?organization_id=eq.${c.org}`, {total_minor: "1"}, "PATCH"));
    denied(await h.tryRpc(h.ownerA, "reverse_aqvora_journal", {organization_id: c.org, original_journal_id: issue.journal_id,
      intent_key: randomUUID(), business_date: e2eDate, reason: "Unsupported credit/refund"}));
    expect(await sqlE2ESnapshot(h.db, c)).toEqual(before);
  });

  it("serializes competing settlements so cumulative allocations cannot exceed face value", async () => {
    const {c, invoice} = await issuedCompany();
    const x = await h.prepareReceipt(c, invoice, "90"), y = await h.prepareReceipt(c, invoice, "90");
    const results = await Promise.all([h.tryRpc(h.ownerA, "post_aqvora_customer_receipt", h.receiptArgs(c, x.receipt)),
      h.tryRpc(h.ownerA, "post_aqvora_customer_receipt", h.receiptArgs(c, y.receipt))]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1); expect(results.filter(r => r.status >= 400)).toHaveLength(1);
    expect(await readE2EOpen(h, c, invoice.id)).toMatchObject({allocated_minor: "90", outstanding_minor: "60"});
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(2);
  });

  it("denies an in-flight issue when membership revocation wins the lock order", async () => {
    const c = await h.company(), invoice = await h.approved(c); await h.enroll(c);
    const blocker = new Client({connectionString: h.status.DB_URL}); await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("UPDATE public.organization_members SET is_active=false WHERE organization_id=$1 AND user_id=$2", [c.org, h.ownerA.id]);
      const pid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      const pending = h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", h.issueArgs(c, invoice));
      const deadline = Date.now() + 5000; let observed = false;
      while (Date.now() < deadline) {
        observed = (await h.db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%issue_aqvora_sales_invoice%') waiting", [pid])).rows[0].waiting;
        if (observed) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await blocker.query("COMMIT");
      denied(await pending); expect(observed).toBe(true);
      expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(0);
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); }
  });

  it("rejects previously issued JWTs after actual Auth sign-out revokes the live session", async () => {
    const c = await h.company(), invoice = await h.approved(c); await h.enroll(c);
    const sid = sessionId(h.ownerA); expect((await h.db.query("SELECT id FROM auth.sessions WHERE id=$1", [sid])).rows).toHaveLength(1);
    expect((await h.ownerA.client.auth.signOut()).error).toBeNull();
    expect((await h.db.query("SELECT id FROM auth.sessions WHERE id=$1", [sid])).rows).toHaveLength(0);
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", h.issueArgs(c, invoice)));
    denied(await h.tryRpc(h.ownerA, "read_aqvora_currency_policy", {p_organization_id: c.org, p_currency: "PKR", p_as_of_date: e2eDate}), "42501");
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(0);
  });
});
