import { describe, expect, it } from "vitest";
import { verifyServiceInvoiceSource } from "../src/accounting/verifiedSalesInvoice";

const company = "org-a";
const id = "invoice-a";
const fingerprint = "a".repeat(64);
const context = { organizationId: company, invoiceId: id };

const issued = () => ({
  organization_id: company, id, creation_intent: "create-1",
  customer_id: "customer-a", currency: "PKR",
  business_date: "2026-11-20", due_date: "2026-11-30",
  created_by: "manager-b", approved_by: "owner-a", created_at: "2026-11-20T12:00:00Z",
  state: "issued", revision: "4", fingerprint, document_number: "SI-1",
  journal_id: "journal-1", cancel_reason: null,
  lines: [{
    line_no: 1, description: "Service", quantity_millionths: "1500000",
    unit_price_minor: "101", discount_minor: "2",
    gross_minor: "152", net_minor: "150",
  }],
  gross_minor: "152", discount_minor: "2", face_minor: "150",
  customer_snapshot: { id: "customer-a", code: "C100", name: "Customer" },
  policy_snapshot: { currency: "PKR", tax_treatment: "verified_out_of_scope" },
  issue_receipt: {
    organization_id: company, invoice_id: id, customer_id: "customer-a",
    currency: "PKR", business_date: "2026-11-20", document_number: "SI-1",
    journal_id: "journal-1", fingerprint, face_minor: "150",
    issued_revision: "4", source_revision: "3", intent_key: "issue-1",
    posted_by: "owner-a", posted_at: "2026-11-20T12:00:00Z",
    journal_intent_key: "sales-invoice:journal-1",
  },
  reconciliation: {
    source_complete: true, face_minor: "150",
    ar_debit_minor: "150", revenue_credit_minor: "150",
    settlements_supported: false,
    basis: "unsettled_issued_service_invoice",
  },
});
const unissued = () => {
  const v = issued();
  const { issue_receipt: _receipt, reconciliation: _reconciliation, ...base } = v;
  return {
    ...base, state: "draft", revision: "1", approved_by: null,
    journal_id: null, document_number: null, fingerprint: null,
    customer_snapshot: null, policy_snapshot: null,
  };
};

describe("AQVORA V2 verified service invoice source — no fictitious payment status", () => {
  it("accepts actual PR #59 quantity-millionths, half-up calculation and AR/revenue certification", () => {
    const result = verifyServiceInvoiceSource(issued(), context);
    expect(result).toMatchObject({
      sourceBasis: "verified_issued_service_invoice",
      paymentState: "not_available",
      invoice: { face_minor: "150", gross_minor: "152", document_number: "SI-1" },
    });
    expect("outstanding_minor" in result).toBe(false);
    expect("paid_minor" in result).toBe(false);
  });

  it("treats draft as unposted and never calls it an unpaid posted receivable", () => {
    const result = verifyServiceInvoiceSource(unissued(), context);
    expect(result.sourceBasis).toBe("unposted_service_draft");
    expect(result.paymentState).toBe("not_available");
  });

  it("keeps a full signed-BIGINT invoice exact", () => {
    const max = "9223372036854775807";
    const v = issued();
    v.lines[0] = {
      ...v.lines[0], quantity_millionths: "1000000", unit_price_minor: max,
      discount_minor: "0", gross_minor: max, net_minor: max,
    };
    v.gross_minor = max;
    v.discount_minor = "0";
    v.face_minor = max;
    v.issue_receipt.face_minor = max;
    v.reconciliation.face_minor = max;
    v.reconciliation.ar_debit_minor = max;
    v.reconciliation.revenue_credit_minor = max;
    expect(verifyServiceInvoiceSource(v, context).invoice.face_minor).toBe(max);
  });

  it.each([
    ["foreign company", { organization_id: "org-b" }, /another company/],
    ["wrong invoice", { id: "invoice-b" }, /another company/],
    ["unsupported currency", { currency: "pkr" }, /currency/],
    ["invalid due date", { due_date: "2026-02-30" }, /due date/],
    ["due date before issue", { due_date: "2026-11-19" }, /predates/],
    ["unsupported lifecycle", { state: "paid" }, /lifecycle state/],
    ["noncanonical amount", { face_minor: "150.0" }, /canonical/],
    ["forged posted amount", { face_minor: "151" }, /totals do not reconcile/],
    ["changed source fingerprint", { fingerprint: "b".repeat(64) }, /source mismatch/],
    ["counterfeit document number", { document_number: "SI-ABC" }, /document number/],
    ["untrusted approval revision", { revision: "5" }, /source mismatch/],
  ])("fails closed on %s", (_label, changes, message) => {
    expect(() => verifyServiceInvoiceSource({ ...issued(), ...changes }, context)).toThrow(message);
  });

  it("refuses rounded JavaScript money, malformed line numbering and fake discounts", () => {
    for (const bad of [
      { unit_price_minor: 101 },
      { gross_minor: "151" },
      { discount_minor: "153" },
      { net_minor: "151" },
      { quantity_millionths: "-1500000" },
      { line_no: 2 },
      { description: " " },
    ]) {
      const v = issued();
      expect(() => verifyServiceInvoiceSource({
        ...v, lines: [{ ...v.lines[0], ...bad }],
      }, context)).toThrow();
    }
  });

  it("refuses a document missing its immutable certified source, audit/receipt link or matching allocation policy", () => {
    const v = issued();
    const cases = [
      { ...v, issue_receipt: undefined },
      { ...v, reconciliation: undefined },
      { ...v, reconciliation: { ...v.reconciliation, source_complete: false } },
      { ...v, reconciliation: { ...v.reconciliation, settlements_supported: true } },
      { ...v, reconciliation: { ...v.reconciliation, ar_debit_minor: "149" } },
      { ...v, reconciliation: { ...v.reconciliation, revenue_credit_minor: "149" } },
      { ...v, issue_receipt: { ...v.issue_receipt, journal_id: "fake-journal" } },
      { ...v, issue_receipt: { ...v.issue_receipt, source_revision: "2" } },
      { ...v, policy_snapshot: { ...v.policy_snapshot, tax_treatment: "taxable" } },
      { ...v, customer_snapshot: { ...v.customer_snapshot, id: "foreign-customer" } },
    ];
    for (const item of cases) {
      expect(() => verifyServiceInvoiceSource(item, context)).toThrow();
    }
  });

  it("rejects unissued docs pretending to have an AR posting or receipt", () => {
    const draft = unissued();
    for (const modified of [
      { ...draft, journal_id: "journal-fake" },
      { ...draft, document_number: "SI-12" },
      { ...draft, issue_receipt: issued().issue_receipt },
      { ...draft, reconciliation: issued().reconciliation },
    ]) expect(() => verifyServiceInvoiceSource(modified, context))
      .toThrow(/Unissued sales document/);
  });

  it("rejects totals exceeding the company BIGINT limit and invalid missing lines", () => {
    const v = issued();
    for (const modified of [
      { ...v, face_minor: "9223372036854775808" },
      { ...v, lines: [] },
      { ...v, lines: null },
      { ...v, discount_minor: "-1" },
    ]) expect(() => verifyServiceInvoiceSource(modified, context)).toThrow();
  });
});
