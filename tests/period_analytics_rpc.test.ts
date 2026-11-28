import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rows: vi.fn(), requireCloud: vi.fn(), demo: vi.fn() }));
vi.mock("../src/lib/security", () => ({ getSecurityPrincipal: () => ({ id: "user-a", organizationId: "shop-a", role: "OWNER" }) }));
vi.mock("../src/lib/supabase", () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("../src/services/ledgerService", () => ({ ledgerService: { getAllFilteredTransactions: mocks.rows } }));
vi.mock("../src/services/ledgerReadPolicy", () => ({ isDemoOrganization: mocks.demo, requireAuthoritativeCloudRead: mocks.requireCloud }));
import { loadPeriodAnalytics } from "../src/services/periodAnalyticsService";
const range = { startDate: "2026-11-01", endDate: "2026-11-03" };
const response = () => ({ totals: { income_paisa: 30001, expense_paisa: 10000, net_profit_paisa: 20001, transaction_count: 2 }, trend: [{ key: "2026-11-02", income_paisa: 30001, expense_paisa: 10000, net_profit_paisa: 20001, transaction_count: 2 }], categories: [] });
beforeEach(() => { vi.stubEnv("VITE_PERIOD_ANALYTICS_RPC", "true"); vi.clearAllMocks(); mocks.demo.mockReturnValue(false); mocks.requireCloud.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllEnvs());

describe("enabled period analytics API", () => {
  it("uses verified server totals, fills empty days and leaves the full register unloaded", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });
    const result = await loadPeriodAnalytics(range);
    expect(result.totals.income_paisa).toBe(30001);
    expect(result.records).toBeUndefined();
    expect(result.trend.map(day => day.income_paisa)).toEqual([0, 30001, 0]);
    expect(mocks.requireCloud).toHaveBeenCalledOnce();
    expect(mocks.rows).not.toHaveBeenCalled();
  });
  it("passes the selected type and category to the organization-scoped API", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });
    await loadPeriodAnalytics({ ...range, type: "expense", categoryId: "category-a" });
    expect(mocks.rpc).toHaveBeenCalledWith("cashbook_period_analytics", { target_org: "shop-a", start_date: range.startDate, end_date: range.endDate, filter_type: "expense", filter_category: "category-a" });
  });
  it("rejects failed or imprecise summaries instead of presenting invented totals", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("denied") });
    await expect(loadPeriodAnalytics(range)).rejects.toThrow("could not be verified");
    const data = response(); data.totals.income_paisa = Number.MAX_SAFE_INTEGER + 1;
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(loadPeriodAnalytics(range)).rejects.toThrow("supported precision");
  });
  it("keeps demo reads on the isolated demo service", async () => {
    mocks.demo.mockReturnValue(true); mocks.rows.mockResolvedValue([]);
    const result = await loadPeriodAnalytics(range);
    expect(result.records).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.totals.transaction_count).toBe(0);
  });
});
