import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isIsolatedVerifiedFinancialReadEnabled,
  loadIsolatedVerifiedGeneralLedger,
  loadIsolatedVerifiedTrialBalance,
} from "../src/services/aqvoraVerifiedFinancialReadService";

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: vi.fn(),
  configured: vi.fn(),
  config: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ rpc: fake.rpc }),
  getSupabaseConfig: fake.config,
  hasConfiguredCloudSession: fake.session,
  isSupabaseConfigured: fake.configured,
}));

const request = {
  organizationId: "company-a",
  userId: "manager-a",
  isCloudAccount: true,
  currency: "PKR",
  fromDate: "2026-11-01",
  toDate: "2026-11-30",
};
const source = () => ({
  contract_version: "aqvora-read-v1",
  organization_id: "company-a",
  currency: "PKR",
  from_date: "2026-11-01",
  to_date: "2026-11-30",
  snapshot_token: "b".repeat(64),
  observed_at: "2026-11-20T10:00:00Z",
  authorized_user_id: "manager-a",
  authorized_role: "MANAGER",
  basis: "v2_posted_journals",
  source_complete: true,
  legacy_included: false,
  opening_migration_verified: false,
  consistency: "restart_on_source_change",
  source_journal_count: "0",
  source_line_count: "0",
  source_debit_minor: "0",
  source_credit_minor: "0",
});
const tbResponse = () => ({
  source: source(), rows: [],
  matched_count: "0", returned_count: 0,
  has_more: false, next_cursor: null,
  totals: {
    opening_debit_minor: "0", opening_credit_minor: "0",
    debit_minor: "0", credit_minor: "0",
    closing_debit_minor: "0", closing_credit_minor: "0",
  },
});
const glResponse = () => ({
  source: source(), rows: [],
  matched_count: "0", returned_count: 0,
  has_more: false, next_cursor: null,
  account: {
    organization_id: "company-a", id: "cash", code: "1000", name: "Cash",
    account_class: "asset", normal_side: "debit", parent_id: null,
    is_posting: true, is_active: true, control_role: null, revision: "1",
  },
  opening_minor: "0", debit_minor: "0", credit_minor: "0", closing_minor: "0",
});

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS", "true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", "true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
  fake.config.mockReturnValue({
    url: "https://abcdefghijklmnopqrst.supabase.co",
    anonKey: "sb_publishable_test_only",
  });
  fake.configured.mockReturnValue(true);
  fake.session.mockResolvedValue(true);
  fake.rpc.mockResolvedValue({ data: tbResponse(), error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("AQVORA default-off isolated financial RPC transport", () => {
  it("refuses all reads when rollout flags are absent", async () => {
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS", "");
    expect(isIsolatedVerifiedFinancialReadEnabled()).toBe(false);
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/disabled outside isolated staging/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("refuses known business projects, lookalike domains and mismatched staging refs", async () => {
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "xarbzazjzcaezcpstiga");
    expect(isIsolatedVerifiedFinancialReadEnabled()).toBe(false);
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
    for (const url of [
      "https://abcdefghijklmnopqrst.supabase.co.evil.test",
      "https://abcdefghijklmnopqrst.supabase.co/other",
      "https://differentabcdefghijkl.supabase.co",
    ]) {
      fake.config.mockReturnValue({ url, anonKey: "sb_publishable_test_only" });
      expect(isIsolatedVerifiedFinancialReadEnabled()).toBe(false);
    }
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("refuses demo/noncloud users and lost authenticated sessions", async () => {
    await expect(loadIsolatedVerifiedTrialBalance({
      ...request, isCloudAccount: false,
    })).rejects.toThrow(/signed-in cloud/);
    fake.session.mockResolvedValue(false);
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/session is unavailable/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("loads verified complete TB through the strictly read-only RPC", async () => {
    const result = await loadIsolatedVerifiedTrialBalance(request);
    expect(result.rows).toHaveLength(0);
    expect(result.totals.debit_minor).toBe("0");
    expect(result.source.legacy_included).toBe(false);
    expect(result.source.opening_migration_verified).toBe(false);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("read_aqvora_trial_balance", {
      p_organization_id: "company-a",
      p_from_date: "2026-11-01",
      p_to_date: "2026-11-30",
      p_currency: "PKR",
      p_limit: 100,
      p_cursor: null,
      p_snapshot_token: null,
    });
  });

  it("loads one verified General Ledger account via its only permitted RPC", async () => {
    fake.rpc.mockResolvedValue({ data: glResponse(), error: null });
    const result = await loadIsolatedVerifiedGeneralLedger({
      ...request, accountId: "cash",
    });
    expect(result.account.id).toBe("cash");
    expect(result.closingMinor).toBe("0");
    expect(fake.rpc).toHaveBeenCalledWith("read_aqvora_general_ledger",
      expect.objectContaining({ p_account_id: "cash" }));
  });

  it("never exposes a response from a different tenant or authorized user", async () => {
    fake.rpc.mockResolvedValueOnce({
      data: { ...tbResponse(), source: { ...source(), organization_id: "company-b" } },
      error: null,
    });
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/context mismatch/);
    fake.rpc.mockResolvedValueOnce({
      data: { ...tbResponse(), source: { ...source(), authorized_user_id: "other-user" } },
      error: null,
    });
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/different authorized user/);
  });

  it("propagates MFA/permission and source-drift errors without presenting zero", async () => {
    for (const code of ["42501", "40001", "23514"]) {
      fake.rpc.mockResolvedValueOnce({
        data: null, error: Object.assign(new Error("Financial report denied"), {code}),
      });
      await expect(loadIsolatedVerifiedTrialBalance(request))
        .rejects.toMatchObject({ code });
    }
    expect(fake.rpc).toHaveBeenCalledTimes(3);
  });

  it("discards a result if the active session becomes unavailable during the request", async () => {
    fake.session.mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/session is unavailable/);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects an error/malformed payload without falling back to sample balances", async () => {
    fake.rpc.mockResolvedValueOnce({ data: { rows: [] }, error: null });
    await expect(loadIsolatedVerifiedTrialBalance(request))
      .rejects.toThrow(/complete certified V2 read/);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });
});
