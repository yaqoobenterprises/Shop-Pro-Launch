// @vitest-environment node
import {writeFileSync} from "node:fs";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createE2EHarness, denied, ar, receiptCash, e2eDate, type E2EHarness} from "./support/aqvoraE2EHarness";
import {evidenceHash, migrationManifest, readE2EBooks, readE2EOpen, seedLegacySentinel, sqlE2ESnapshot} from "./support/aqvoraE2EEvidence";
import {restoreE2E} from "./support/aqvoraE2ERestore";
import {verifySalesLifecycleInvoice} from "../src/accounting/verifiedSalesLifecycle";
import {verifyControlledCashCollection} from "../src/accounting/verifiedCashCollection";
import {verifyCustomerReceiptDetail} from "../src/accounting/verifiedCustomerReceipt";
import type {SalesIssueReceipt} from "../src/accounting/salesContracts";
import type {CustomerReceipt, CustomerReceiptIssue, PostCustomerReceiptRequest} from "../src/accounting/receiptContracts";

const statusPath = process.env.AQVORA_LOCAL_SUPABASE_STATUS;
describe.skipIf(!statusPath)("Release candidate: two actual OWNERs, MFA and end-to-end accounting", () => {
  let h: E2EHarness;
  beforeAll(async () => { h = await createE2EHarness(statusPath!); }, 120000);
  afterAll(async () => { if (h) await h.close(); });

  it("issues 150 once, collects 60 then 90, certifies every book and restores through fresh PostgREST", async () => {
    const legacy = await seedLegacySentinel(h);
    const c = await h.company();
    const context = {organizationId: c.org, customerId: c.customer, currency: "PKR", asOfDate: e2eDate};
    expect(c.org).not.toBe(legacy.org);
    const members = (await h.db.query("SELECT user_id,role FROM public.organization_members WHERE organization_id=$1 ORDER BY user_id", [c.org])).rows;
    expect(members).toHaveLength(2);
    expect(members.every(m => m.role === "OWNER")).toBe(true);
    const duplicate = await h.tryRpc(h.ownerA, "create_aqvora_customer", {p_organization_id: c.org,
      p_code: "e2e-customer", p_name: "Duplicate case-insensitive code"});
    denied(duplicate, "P0001");
    expect(duplicate.data).toMatchObject({message: "Customer code already identifies a different request"});
    const empty = await h.rpc<{source: {source_journal_count: string; legacy_included: false; opening_migration_verified: false}}>(h.ownerA,
      "read_aqvora_trial_balance", {p_organization_id: c.org, p_from_date: "0001-01-01", p_to_date: e2eDate, p_currency: "PKR"});
    expect(empty.source).toMatchObject({source_journal_count: "0", legacy_included: false, opening_migration_verified: false});
    let invoice = await h.draft(c);
    verifySalesLifecycleInvoice(invoice, {...context, invoiceId: invoice.id});
    expect(invoice).toMatchObject({state: "draft", gross_minor: "152", discount_minor: "2", face_minor: "150"});
    invoice = await h.transition(c, invoice, "submit");
    denied(await h.tryRpc(h.ownerA, "transition_aqvora_sales_invoice", {p_organization_id: c.org,
      p_invoice_id: invoice.id, p_expected_revision: invoice.revision, p_action: "approve"}));
    invoice = await h.transition(c, invoice, "approve", h.ownerB);
    expect(invoice).toMatchObject({created_by: h.ownerA.id, approved_by: h.ownerB.id, revision: "3"});
    const issue = h.issueArgs(c, invoice);
    // Company still default OFF: no posting, receipt or number may be created.
    denied(await h.tryRpc(h.ownerA, "issue_aqvora_sales_invoice", issue));
    expect((await sqlE2ESnapshot(h.db, c)).journals).toHaveLength(0);
    await h.enroll(c);
    // First successful write commits, but the client deliberately discards its
    // response body. Recovery must use this exact original intent, never a new one.
    const lost = await fetch(`${h.status.API_URL}/rest/v1/rpc/issue_aqvora_sales_invoice`, {method: "POST",
      headers: {apikey: h.status.ANON_KEY, Authorization: `Bearer ${h.ownerA.token}`, "Content-Type": "application/json"},
      body: JSON.stringify(issue), signal: AbortSignal.timeout(15000)});
    expect(lost.status).toBe(200); await lost.body?.cancel();
    const issued = await h.rpc<SalesIssueReceipt>(h.ownerA, "lookup_aqvora_sales_issue", {
      p_organization_id: c.org, p_intent_key: issue.p_intent_key});
    const retries = await Promise.all(Array.from({length: 3}, () => h.rpc(h.ownerA, "issue_aqvora_sales_invoice", issue)));
    retries.forEach(value => expect(value).toEqual(issued));
    const getInvoice = async () => verifySalesLifecycleInvoice(await h.rpc(h.ownerA, "get_aqvora_sales_invoice", {
      p_organization_id: c.org, p_invoice_id: invoice.id}), {...context, invoiceId: invoice.id});
    expect(await getInvoice()).toMatchObject({state: "issued", face_minor: "150", issue_receipt: issued,
      reconciliation: {ar_debit_minor: "150", revenue_credit_minor: "150", outstanding_minor: "150"}});
    const scale = issued.currency_policy;
    expect(scale).toMatchObject({organization_id: c.org, currency_exponent: 2, minor_units_per_major: "100", revision: "1"});
    const settlements: Array<{args: PostCustomerReceiptRequest; response: CustomerReceiptIssue}> = [];
    const settle = async (amount: string) => {
      const prepared = await h.prepareReceipt(c, invoice, amount);
      expect(prepared.collection).toMatchObject({created_by: h.ownerA.id, confirmed_by: h.ownerB.id});
      expect(verifyControlledCashCollection(prepared.collection, {...context, collectionId: prepared.collection.id}))
        .toMatchObject({attestation: "dual_control", bankVerified: false});
      const args = h.receiptArgs(c, prepared.receipt);
      const [first, second] = await Promise.all([h.rpc<CustomerReceiptIssue>(h.ownerA, "post_aqvora_customer_receipt", args),
        h.rpc<CustomerReceiptIssue>(h.ownerA, "post_aqvora_customer_receipt", args)]);
      expect(second).toEqual(first);
      expect(first.currency_policy).toEqual(scale);
      expect(await h.rpc(h.ownerA, "lookup_aqvora_customer_receipt_issue", {
        p_organization_id: c.org, p_intent_key: args.p_intent_key})).toEqual(first);
      const detail = verifyCustomerReceiptDetail(await h.rpc<CustomerReceipt>(h.ownerA, "get_aqvora_customer_receipt", {
        p_organization_id: c.org, p_receipt_id: prepared.receipt.id}), {...context, receiptId: prepared.receipt.id});
      expect(detail).toMatchObject({state: "posted", currency_policy: scale, reconciliation: {bank_verified: false}});
      settlements.push({args, response: first});
      return detail;
    };
    await settle("60");
    expect(await readE2EOpen(h, c, invoice.id)).toMatchObject({face_minor: "150", allocated_minor: "60", outstanding_minor: "90", status: "partial"});
    const partial = await readE2EBooks(h, c);
    expect(partial.recon).toMatchObject({face_minor: "150", allocated_minor: "60", outstanding_minor: "90", ar_control_minor: "90"});
    expect(partial.receivable.closingMinor).toBe("90"); expect(partial.cash.closingMinor).toBe("60");
    expect(partial.tb.totals).toMatchObject({debit_minor: "210", credit_minor: "210"});
    await settle("90");
    const final = await readE2EBooks(h, c);
    expect(final.recon).toMatchObject({face_minor: "150", allocated_minor: "150", outstanding_minor: "0", ar_control_minor: "0"});
    expect(final.receivable).toMatchObject({closingMinor: "0", pageCount: 3});
    expect(final.cash.closingMinor).toBe("150"); expect(final.revenue.closingMinor).toBe("-150");
    expect(final.tb.totals).toMatchObject({debit_minor: "300", credit_minor: "300", closing_debit_minor: "150", closing_credit_minor: "150"});
    expect(await readE2EOpen(h, c, invoice.id)).toMatchObject({allocated_minor: "150", outstanding_minor: "0", status: "settled"});
    const snapshot = await sqlE2ESnapshot(h.db, c);
    expect(snapshot.journals).toHaveLength(3); expect(snapshot.lines).toHaveLength(6);
    expect(snapshot.allocations.map(a => BigInt(a.amount_minor)).reduce((a, b) => a + b, 0n)).toBe(150n);
    expect(snapshot.totals).toEqual({debit: "300", credit: "300"});
    for (const journal of snapshot.journals) {
      const lines = snapshot.lines.filter(l => l.journal_id === journal.id);
      const amount = journal.total_minor;
      expect(lines.map(l => ({account: l.account_id, debit: l.debit_minor, credit: l.credit_minor})))
        .toEqual(journal.source_kind === "sales_invoice" ? [
          {account: ar, debit: "150", credit: "0"}, {account: c.revenue, debit: "0", credit: "150"},
        ] : [{account: receiptCash, debit: amount, credit: "0"}, {account: ar, debit: "0", credit: amount}]);
      expect(lines.find(l => l.account_id === ar)).toMatchObject({party_id: c.customer, open_item_id: invoice.id});
      expect(journal.payload.currency_policy).toEqual(scale);
    }
    const postedBeforeClose = await getInvoice();
    await h.rpc(h.ownerB, "close_aqvora_period", {p_organization_id: c.org, p_period_id: c.period,
      p_expected_revision: "1", p_reason: "TEST ONLY restore and retry after close"});
    expect(await h.rpc(h.ownerA, "issue_aqvora_sales_invoice", issue)).toEqual(issued);
    for (const s of settlements) expect(await h.rpc(h.ownerA, "post_aqvora_customer_receipt", s.args)).toEqual(s.response);
    expect(await getInvoice()).toEqual(postedBeforeClose);
    expect(await legacy.snapshot()).toEqual(legacy.before);
    expect(await sqlE2ESnapshot(h.db, c)).toEqual(snapshot);
    const versions = (await h.db.query("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version")).rows.map(x => x.version);
    const migrations = migrationManifest();
    expect(versions).toEqual(migrations.map(x => x.name.slice(0, 14)));
    const restore = await restoreE2E(h, c, invoice, issue, issued, settlements, legacy);
    const proof = {contract: "aqvora-local-e2e-evidence-v1", source_head: process.env.AQVORA_E2E_SOURCE_SHA ?? null,
      base_head: "f200cc9068c06887f08b4dfb837f4068c7f720dc", company_id: c.org,
      two_distinct_owners: true, actual_aal2: true, invoice_minor: "150", receipts_minor: ["60", "90"],
      partial_ar_minor: "90", final_ar_minor: "0", debit_minor: "300", credit_minor: "300",
      sql_digest: evidenceHash(snapshot), legacy_digest: evidenceHash(legacy.before),
      source_token: final.tb.source.snapshot_token, migrations, restore,
      limitations: ["No hosted/browser acceptance", "No physical/PITR restore", "No finance approval or production activation"]};
    if (process.env.AQVORA_E2E_EVIDENCE_PATH) writeFileSync(process.env.AQVORA_E2E_EVIDENCE_PATH, JSON.stringify(proof, null, 2));
    console.info("AQVORA local E2E evidence", JSON.stringify({...proof, migrations: migrations.length}));
    expect(await legacy.snapshot()).toEqual(legacy.before);
  }, 180000);
});
