import { describe, expect, it } from "vitest";
import {
  verifyInvoiceOpenBalance, verifyOpenInvoicePage,
  verifyReceivablesReconciliation, verifyReceivablesSource,
} from "../src/accounting/verifiedReceiptReads";

const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const customer = "33333333-3333-4333-8333-333333333333";
const invoiceA = "44444444-4444-4444-8444-444444444444";
const invoiceB = "55555555-5555-4555-8555-555555555555";
const receipt = "66666666-6666-4666-8666-666666666666";
const collection = "77777777-7777-4777-8777-777777777777";
const journal = "88888888-8888-4888-8888-888888888888";
const allocationId = "99999999-9999-4999-8999-999999999999";
const token = "a".repeat(64);
const context = {
  organizationId: org,
  currency: "PKR",
  customerId: customer,
  asOfDate: "2026-11-20",
};
const source = () => ({
  contract_version: "aqvora-read-v1", organization_id: org, currency: "PKR",
  from_date: "0001-01-01", to_date: "2026-11-20", snapshot_token: token,
  observed_at: "2026-11-20T18:00:00Z",
  authorized_user_id: actor, authorized_role: "MANAGER",
  basis: "v2_posted_journals", source_complete: true,
  legacy_included: false, opening_migration_verified: false,
  consistency: "restart_on_source_change",
  source_journal_count: "2", source_line_count: "4",
  source_debit_minor: "1000", source_credit_minor: "1000",
});
const allocated = () => ({
  allocation_id: allocationId, receipt_id: receipt, collection_id: collection,
  receipt_number: "CR-1", business_date: "2026-11-20",
  amount_minor: "400", journal_id: journal, line_no: 2,
});
const invoice = (id = invoiceA) => ({
  organization_id: org, invoice_id: id, customer_id: customer,
  currency: "PKR", business_date: "2026-11-18",
  due_date: "2026-12-20", as_of_date: "2026-11-20",
  face_minor: "1000", allocated_minor: "400", outstanding_minor: "600",
  all_posted_allocated_minor: "400", status: "partial",
  allocations: [allocated()], fingerprint: "b".repeat(64),
  source_complete: true, scope: "v2_invoice_allocations",
  legacy_included: false, opening_migration_verified: false,
});
const summary = () => ({
  source: source(), customer_id: customer, as_of_date: "2026-11-20",
  invoice_count: "1", face_minor: "1000", allocated_minor: "400",
  outstanding_minor: "600", ar_control_minor: "600",
  scope: "customer", aging_supported: false,
});
const page = (rows = [invoice()]) => ({
  source: source(), rows, matched_count: "1", has_more: false,
  next_after_id: rows.length ? rows[rows.length - 1].invoice_id : null,
});

describe("AQVORA verified V2 receivables / receipt reads", () => {
  it("verifies a partially paid source-backed invoice without assuming bank verification", () => {
    const verified = verifyInvoiceOpenBalance(invoice(), { ...context, invoiceId: invoiceA });
    expect(verified.status).toBe("partial");
    expect(verified.allocated_minor).toBe("400");
    expect(verified.outstanding_minor).toBe("600");
    expect(verified.legacy_included).toBe(false);
    expect("bank_verified" in verified).toBe(false);
  });

  it("verifies a truly unpaid invoice with no allocation provenance", () => {
    const unpaid = {
      ...invoice(), allocated_minor: "0", all_posted_allocated_minor: "0",
      outstanding_minor: "1000", status: "unpaid", allocations: [],
    };
    expect(verifyInvoiceOpenBalance(unpaid, {...context, invoiceId: invoiceA}).status)
      .toBe("unpaid");
  });

  it("verifies exact settlement at signed-BIGINT monetary boundary", () => {
    const max = "9223372036854775807";
    const paid = {
      ...invoice(), face_minor: max, allocated_minor: max,
      outstanding_minor: "0", all_posted_allocated_minor: max,
      status: "settled", allocations: [{ ...allocated(), amount_minor: max }],
    };
    expect(verifyInvoiceOpenBalance(paid, {...context,invoiceId:invoiceA}).status)
      .toBe("settled");
  });

  it("refuses fabricated payment totals, source flags, allocation provenance and status", () => {
    const example = invoice();
    for(const changed of [
      { organization_id: "foreign" }, { invoice_id: invoiceB },
      { customer_id: "another" }, { currency: "USD" },
      { as_of_date: "2026-11-19" }, { source_complete: false },
      { legacy_included: true }, { opening_migration_verified: true },
      { allocated_minor: "500" }, { outstanding_minor: "601" },
      { all_posted_allocated_minor: "399" }, { status: "settled" },
      { face_minor: "1000.0" }, { face_minor: "9223372036854775808" },
      { fingerprint: "not-a-hash" },
      { allocations: [{...allocated(),business_date:"2026-11-17"}] },
      { allocations: [{...allocated(),amount_minor:"401"}] },
      { allocations: [allocated(),allocated()] },
      { allocations: [{...allocated(),journal_id:"foreign"}] },
      { allocations: [{...allocated(),receipt_number:"CR-0"}] },
      { allocations: [{...allocated(),line_no:0}] },
    ]) expect(() => verifyInvoiceOpenBalance({...example,...changed}, {
      ...context,invoiceId:invoiceA,
    })).toThrow();
  });

  it("accepts certified open-invoice pages but never calls one page a complete company report", () => {
    const result = verifyOpenInvoicePage(page(), {
      ...context, customerId:customer, pageLimit: 100,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.sourceCompletePage).toBe(false);
    expect(result.nextId).toBe(invoiceA);
    expect(result.source.snapshot_token).toBe(token);
  });

  it("requires original snapshot token for continuation and rejects drift", () => {
    expect(() => verifyOpenInvoicePage(page(), {
      ...context,customerId:customer,afterId:invoiceB,pageLimit:100,
    })).toThrow(/requires its original snapshot/);
    expect(() => verifyOpenInvoicePage(page(), {
      ...context,customerId:customer,afterId:invoiceB,
      expectedToken:"c".repeat(64),pageLimit:100,
    })).toThrow(/source changed/);
  });

  it("rejects malformed page counts, ordering, missing next cursor and settled rows", () => {
    const a = invoice(invoiceA);
    const b = {
      ...invoice(invoiceB),allocated_minor:"0", outstanding_minor:"1000",
      all_posted_allocated_minor:"0",status:"unpaid",allocations:[],
    };
    const cases = [
      { ...page([a,b]), matched_count:"1" },
      { ...page([b,a]), matched_count:"2" },
      { ...page([a,a]), matched_count:"2" },
      { ...page([a]), next_after_id: null },
      { ...page([a]), has_more:true, next_after_id:null },
      { ...page([a]), rows:[{...a,allocated_minor:"1000",
        outstanding_minor:"0",all_posted_allocated_minor:"1000",status:"settled",
        allocations:[{...allocated(),amount_minor:"1000"}]}] },
    ];
    for(const item of cases) expect(() => verifyOpenInvoicePage(item, {
      ...context,customerId:customer,pageLimit:2,
    })).toThrow();
  });

  it("refuses uncertified sources, unauthorized roles and inconsistent accounting totals", () => {
    for(const changed of [
      {organization_id:"foreign"},
      {currency:"USD"},
      {authorized_role:"CASHIER"},
      {legacy_included:true},
      {opening_migration_verified:true},
      {source_complete:false},
      {snapshot_token:"invalid"},
      {source_credit_minor:"999"},
      {source_journal_count:"0",source_line_count:"4"},
    ]) expect(() => verifyReceivablesSource({...source(),...changed}, context)).toThrow();
  });

  it("reconciles customer AR and rejects changed control account or unsupported aging claim", () => {
    const valid = verifyReceivablesReconciliation(summary(),context);
    expect(valid.outstanding_minor).toBe("600");
    expect(valid.ar_control_minor).toBe("600");
    for(const change of [
      {outstanding_minor:"601"}, {ar_control_minor:"601"},
      {allocated_minor:"500"}, {aging_supported:true},
      {customer_id:invoiceA}, {as_of_date:"2026-11-19"},
      {scope:"company"},
    ]) expect(() => verifyReceivablesReconciliation({...summary(),...change},context)).toThrow();
  });

  it("validates full-company aggregate without requiring a customer filter", () => {
    const companyReport={...summary(),customer_id:null,scope:"company"};
    const verified=verifyReceivablesReconciliation(companyReport,{
      organizationId:org,currency:"PKR",asOfDate:"2026-11-20",
    });
    expect(verified.scope).toBe("company");
  });

  it("accepts exact zero for an empty but certified company report", () => {
    const empty={...summary(),invoice_count:"0",face_minor:"0",allocated_minor:"0",
      outstanding_minor:"0",ar_control_minor:"0"};
    expect(verifyReceivablesReconciliation(empty,context).invoice_count).toBe("0");
  });
});
