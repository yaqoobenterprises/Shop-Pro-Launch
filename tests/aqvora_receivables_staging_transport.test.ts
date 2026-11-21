import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isIsolatedReceivablesReadEnabled,
} from "../src/services/aqvoraReceivablesStagingGate";
import {
  loadIsolatedInvoiceOpenBalance, loadIsolatedReceivablesReconciliation,
} from "../src/services/aqvoraReceivablesReadService";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(), session: vi.fn(), configured: vi.fn(), config: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({rpc: mock.rpc}),
  getSupabaseConfig: mock.config,
  hasConfiguredCloudSession: mock.session,
  isSupabaseConfigured: mock.configured,
}));

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const customer = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const context = {
  organizationId: org, userId: user, customerId: customer,
  isCloudAccount: true, currency: "PKR", asOfDate: "2026-11-20",
};
const source = () => ({
  contract_version: "aqvora-read-v1", organization_id: org,
  currency: "PKR", from_date: "0001-01-01", to_date: "2026-11-20",
  snapshot_token: "a".repeat(64), observed_at: "2026-11-20T14:00:00Z",
  authorized_user_id: user, authorized_role: "OWNER",
  basis: "v2_posted_journals", source_complete: true,
  legacy_included: false, opening_migration_verified: false,
  consistency: "restart_on_source_change", source_journal_count: "2",
  source_line_count: "4", source_debit_minor: "1000",
  source_credit_minor: "1000",
});
const invoice = () => ({
  organization_id: org, invoice_id: invoiceId, customer_id: customer,
  currency: "PKR", business_date: "2026-11-18", due_date: "2026-12-20",
  as_of_date: "2026-11-20", face_minor: "1000", allocated_minor: "0",
  outstanding_minor: "1000", all_posted_allocated_minor: "0",
  status: "unpaid", allocations: [],
  source_complete: true, scope: "v2_invoice_allocations",
  fingerprint: "b".repeat(64), legacy_included: false,
  opening_migration_verified: false,
});
const report = () => ({
  source: source(), customer_id: customer, scope: "customer",
  as_of_date: "2026-11-20", invoice_count: "1",
  face_minor: "1000", allocated_minor: "400",
  outstanding_minor: "600", ar_control_minor: "600",
  aging_supported: false,
});

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS", "true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", "true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
  mock.config.mockReturnValue({
    url: "https://abcdefghijklmnopqrst.supabase.co",
    anonKey: "sb_publishable_test",
  });
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockResolvedValue({data: invoice(), error: null});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("AQVORA default-off V2 receivables staging RPC transport", () => {
  it("does not call Supabase when staging feature is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS", "");
    expect(isIsolatedReceivablesReadEnabled()).toBe(false);
    await expect(loadIsolatedInvoiceOpenBalance(context,invoiceId))
      .rejects.toThrow(/disabled outside isolated staging/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("blocks actual existing business projects and lookalike domains", () => {
    for(const ref of ["xarbzazjzcaezcpstiga","ienwbrrzsutbispaiymi"]) {
      vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", ref);
      mock.config.mockReturnValue({url:`https://${ref}.supabase.co`,anonKey:"public"});
      expect(isIsolatedReceivablesReadEnabled()).toBe(false);
    }
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
    for(const url of [
      "https://abcdefghijklmnopqrst.supabase.co.evil.test",
      "https://abcdefghijklmnopqrst.supabase.co/api",
      "https://anotherabcdefghijkl.supabase.co",
    ]) {
      mock.config.mockReturnValue({url,anonKey:"public"});
      expect(isIsolatedReceivablesReadEnabled()).toBe(false);
    }
  });

  it("rejects demo users, absent sessions and invalid company identities", async () => {
    await expect(loadIsolatedInvoiceOpenBalance({
      ...context,isCloudAccount:false,
    },invoiceId)).rejects.toThrow(/Matching live cloud session/);
    mock.session.mockResolvedValue(false);
    await expect(loadIsolatedInvoiceOpenBalance(context,invoiceId))
      .rejects.toThrow(/Matching live cloud session/);
    await expect(loadIsolatedInvoiceOpenBalance({
      ...context,organizationId:"fake-company",
    },invoiceId)).rejects.toThrow(/Invalid AQVORA organization/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("uses the exact source-owned open-balance RPC and returns only certified invoice data", async () => {
    const result = await loadIsolatedInvoiceOpenBalance(context,invoiceId);
    expect(result.outstanding_minor).toBe("1000");
    expect(result.legacy_included).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith("get_aqvora_invoice_open_balance",{
      p_organization_id:org,p_invoice_id:invoiceId,p_as_of_date:"2026-11-20",
    });
  });

  it("denies forged company/receipt data and an expired post-request session", async () => {
    mock.rpc.mockResolvedValueOnce({
      data:{...invoice(),organization_id:"other-company"},error:null,
    });
    await expect(loadIsolatedInvoiceOpenBalance(context,invoiceId))
      .rejects.toThrow(/foreign, incomplete/);
    mock.session.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(loadIsolatedInvoiceOpenBalance(context,invoiceId))
      .rejects.toThrow(/Matching live cloud session/);
  });

  it("reconciles a verified customer AR control and validates authorized identity", async () => {
    mock.rpc.mockResolvedValueOnce({data:report(),error:null});
    const result=await loadIsolatedReceivablesReconciliation(context);
    expect(result.outstanding_minor).toBe("600");
    expect(result.aging_supported).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith("read_aqvora_receivables",{
      p_organization_id:org,p_currency:"PKR",p_as_of_date:"2026-11-20",
      p_customer_id:customer,
    });
    mock.rpc.mockResolvedValueOnce({
      data:{...report(),source:{...source(),authorized_user_id:customer}},
      error:null,
    });
    await expect(loadIsolatedReceivablesReconciliation(context))
      .rejects.toThrow(/another authorized user/);
  });

  it("surfaces server-denied access, corruption and source drift unchanged", async () => {
    for (const code of ["42501","23514","40001"]) {
      mock.rpc.mockResolvedValueOnce({
        data:null,error:Object.assign(new Error("Server denied"),{code}),
      });
      await expect(loadIsolatedReceivablesReconciliation(context))
        .rejects.toMatchObject({code});
    }
  });

  it("never substitutes a sample result for malformed or missing RPC data", async () => {
    mock.rpc.mockResolvedValueOnce({data:null,error:null});
    await expect(loadIsolatedInvoiceOpenBalance(context,invoiceId))
      .rejects.toThrow(/Malformed AQVORA invoice balance response/);
    mock.rpc.mockResolvedValueOnce({data:{},error:null});
    await expect(loadIsolatedReceivablesReconciliation(context))
      .rejects.toThrow(/Malformed AQVORA source certification response/);
  });
});
