import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isIsolatedSalesReadEnabled, loadVerifiedServiceInvoice,
  loadVerifiedSalesInvoicePage, lookupVerifiedSalesIssue,
} from "../src/services/aqvoraSalesInvoiceReadService";

const fake = vi.hoisted(() => ({
  rpc: vi.fn(), session: vi.fn(), configured: vi.fn(), config: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ rpc: fake.rpc }),
  getSupabaseConfig: fake.config,
  hasConfiguredCloudSession: fake.session,
  isSupabaseConfigured: fake.configured,
}));

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const first = "33333333-3333-4333-8333-333333333333";
const second = "44444444-4444-4444-8444-444444444444";
const customer = "55555555-5555-4555-8555-555555555555";
const approver = "77777777-7777-4777-8777-777777777777";
const journal = "66666666-6666-4666-8666-666666666666";
const fingerprint = "a".repeat(64);
const context = { organizationId: org, userId: user, isCloudAccount: true };

function invoice(invoiceId = first) {
  return {
    organization_id: org, id: invoiceId, creation_intent: "create-1",
    customer_id: customer, currency: "PKR",
    business_date: "2026-11-20", due_date: "2026-11-30",
    created_by: user, approved_by: approver, created_at: "2026-11-20T12:00:00Z",
    state: "issued", revision: "4", fingerprint, document_number: "SI-1",
    journal_id: journal, cancel_reason: null,
    lines: [{
      line_no: 1, description: "Service", quantity_millionths: "1500000",
      unit_price_minor: "101", discount_minor: "2",
      gross_minor: "152", net_minor: "150",
    }],
    gross_minor: "152", discount_minor: "2", face_minor: "150",
    customer_snapshot: { id: customer, code: "C100", name: "Test Customer" },
    policy_snapshot: { currency: "PKR", tax_treatment: "verified_out_of_scope" },
    issue_receipt: {
      organization_id: org, invoice_id: invoiceId, customer_id: customer,
      currency: "PKR", business_date: "2026-11-20",
      document_number: "SI-1", journal_id: journal, fingerprint,
      face_minor: "150", issued_revision: "4", source_revision: "3",
      intent_key: "issue-1", posted_by: user,
      posted_at: "2026-11-20T12:00:00Z",
      journal_intent_key: `sales-invoice:${journal}`,
    },
    reconciliation: {
      source_complete: true, face_minor: "150",
      ar_debit_minor: "150", revenue_credit_minor: "150",
      settlements_supported: false, basis: "unsettled_issued_service_invoice",
    },
  };
}
function draft(invoiceId = first) {
  const {
    issue_receipt: _receipt, reconciliation: _reconciliation, ...base
  } = invoice(invoiceId);
  return {
    ...base, state: "draft", approved_by: null, revision: "1",
    journal_id: null, document_number: null, fingerprint: null,
    customer_snapshot: null, policy_snapshot: null,
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_SALES_READS", "true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", "true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
  fake.config.mockReturnValue({
    url: "https://abcdefghijklmnopqrst.supabase.co", anonKey: "sb_publishable_testing",
  });
  fake.configured.mockReturnValue(true);
  fake.session.mockResolvedValue(true);
  fake.rpc.mockResolvedValue({ data: invoice(), error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("AQVORA isolated staging-only sales invoice reader", () => {
  it("defaults off without explicit two-factor staging configuration", async () => {
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_SALES_READS", "");
    expect(isIsolatedSalesReadEnabled()).toBe(false);
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/disabled outside isolated staging/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("blocks production business refs, lookalikes and missing configuration", () => {
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "xarbzazjzcaezcpstiga");
    expect(isIsolatedSalesReadEnabled()).toBe(false);
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
    for (const url of [
      "https://abcdefghijklmnopqrst.supabase.co.evil.test",
      "https://abcdefghijklmnopqrst.supabase.co/rest/v1",
      "https://anotherprojectnamea.supabase.co",
    ]) {
      fake.config.mockReturnValue({ url, anonKey: "public" });
      expect(isIsolatedSalesReadEnabled()).toBe(false);
    }
    fake.configured.mockReturnValue(false);
    expect(isIsolatedSalesReadEnabled()).toBe(false);
  });

  it("requires cloud identity, canonical company UUID and active matching session", async () => {
    await expect(loadVerifiedServiceInvoice({ ...context, isCloudAccount: false }, first))
      .rejects.toThrow(/matching live cloud session/);
    await expect(loadVerifiedServiceInvoice({ ...context, organizationId: "fake" }, first))
      .rejects.toThrow(/Invalid company/);
    fake.session.mockResolvedValue(false);
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/matching live cloud session/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("reads verified issued invoice and does not manufacture paid or outstanding money", async () => {
    const result = await loadVerifiedServiceInvoice(context, first);
    expect(result.sourceBasis).toBe("verified_issued_service_invoice");
    expect(result.paymentState).toBe("not_available");
    expect("outstanding_minor" in result).toBe(false);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("get_aqvora_sales_invoice", {
      p_organization_id: org, p_invoice_id: first,
    });
  });

  it("reads a draft only as unposted, never as an unpaid receivable", async () => {
    fake.rpc.mockResolvedValueOnce({ data: draft(), error: null });
    const result = await loadVerifiedServiceInvoice(context, first);
    expect(result.sourceBasis).toBe("unposted_service_draft");
    expect(result.paymentState).toBe("not_available");
  });

  it("rejects forged tenant or altered AR vs revenue reconciliation", async () => {
    fake.rpc.mockResolvedValueOnce({
      data: { ...invoice(), organization_id: "different-tenant" }, error: null,
    });
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/another company or invoice/);
    fake.rpc.mockResolvedValueOnce({
      data: { ...invoice(), reconciliation: { ...invoice().reconciliation,
        revenue_credit_minor: "149" } }, error: null,
    });
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/AR\/revenue reconciliation/);
  });

  it("surfaces actual SQL denial and missing source instead of a fictional zero", async () => {
    for (const code of ["42501", "23514", "40001"]) {
      fake.rpc.mockResolvedValueOnce({
        data: null, error: Object.assign(new Error("Denied"), { code }),
      });
      await expect(loadVerifiedServiceInvoice(context, first))
        .rejects.toMatchObject({ code });
    }
    fake.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/Malformed sales invoice response/);
  });

  it("drops a result if session disappears after the RPC call", async () => {
    fake.session.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(loadVerifiedServiceInvoice(context, first))
      .rejects.toThrow(/matching live cloud session/);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it("looks up committed issuance by intent, cross-checking exact durable invoice receipt", async () => {
    fake.rpc.mockResolvedValueOnce({ data: invoice().issue_receipt, error: null })
      .mockResolvedValueOnce({ data: invoice(), error: null });
    const result = await lookupVerifiedSalesIssue(context, "issue-1");
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.receipt.journal_id).toBe(journal);
      expect(result.invoice.paymentState).toBe("not_available");
    }
    expect(fake.rpc).toHaveBeenNthCalledWith(1,"lookup_aqvora_sales_issue",{
      p_organization_id: org,p_intent_key: "issue-1",
    });
    expect(fake.rpc).toHaveBeenNthCalledWith(2,"get_aqvora_sales_invoice",{
      p_organization_id: org,p_invoice_id: first,
    });
  });

  it("does not interpret missing issuance receipt as permission to issue again", async () => {
    fake.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await lookupVerifiedSalesIssue(context,"issue-1"))
      .toEqual({ status: "not_found", safeToReissue: false });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a replaced intent, foreign receipt, or a disagreement with issued source", async () => {
    for (const changed of [
      { intent_key: "other" },
      { organization_id: "foreign" },
      { journal_id: "fake-journal" },
      { face_minor: "999" },
    ]) {
      fake.rpc.mockResolvedValueOnce({
        data: { ...invoice().issue_receipt, ...changed }, error: null,
      });
      if (changed.intent_key || changed.organization_id) {
        await expect(lookupVerifiedSalesIssue(context,"issue-1")).rejects.toThrow(/foreign or mismatched/);
      } else {
        fake.rpc.mockResolvedValueOnce({ data: invoice(), error: null });
        await expect(lookupVerifiedSalesIssue(context,"issue-1"))
          .rejects.toThrow(/disagrees with durable source/);
      }
    }
  });

  it("loads only a bounded live UUID-sorted invoice page and labels it incomplete", async () => {
    fake.rpc.mockResolvedValueOnce({ data: [draft(first), invoice(second)], error: null });
    const result = await loadVerifiedSalesInvoicePage(context, {limit:2});
    expect(result.sourceComplete).toBe(false);
    expect(result.hasPotentialNextPage).toBe(true);
    expect(result.nextId).toBe(second);
    expect(result.invoices.map(x=>x.paymentState)).toEqual(["not_available","not_available"]);
    expect(fake.rpc).toHaveBeenCalledWith("list_aqvora_sales_invoices", {
      p_organization_id: org,p_after_id: null,p_limit: 2,
    });
  });

  it("never accepts missing pages, duplicate IDs, unsorted or cross-company invoices", async () => {
    for (const entries of [
      [invoice(second), draft(first)], [draft(first), draft(first)],
      [draft(first), { ...invoice(second), organization_id:"other-org" }],
      [draft(first), invoice(second), draft(second)],
    ]) {
      fake.rpc.mockResolvedValueOnce({ data: entries, error: null });
      await expect(loadVerifiedSalesInvoicePage(context, {limit:2})).rejects.toThrow();
    }
    fake.rpc.mockResolvedValueOnce({ data: { rows: [] }, error: null });
    await expect(loadVerifiedSalesInvoicePage(context)).rejects.toThrow(/invalid source or length/);
  });

  it("validates cursors and request limits before contacting the backend", async () => {
    await expect(loadVerifiedSalesInvoicePage(context, {limit:201}))
      .rejects.toThrow(/page size/);
    await expect(loadVerifiedSalesInvoicePage(context, {afterId:"not-a-uuid"}))
      .rejects.toThrow(/Invalid invoice cursor/);
    await expect(loadVerifiedServiceInvoice(context, "invalid-invoice"))
      .rejects.toThrow(/Invalid invoice/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
