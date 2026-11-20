import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, hasConfiguredCloudSession, getSupabaseConfig, isSupabaseConfigured } from "../src/lib/supabase";
import { loadAqvoraCompleteAdminReadSnapshot } from "../src/services/aqvoraAdminReadService";
import { isAqvoraIsolatedStagingReadEnabled } from "../src/services/aqvoraAdminStagingGuard";

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  hasConfiguredCloudSession: vi.fn(),
  getSupabaseConfig: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

const organizationId = "77f11111-1111-4111-8111-111111111111";
const userId = "88f22222-2222-4222-8222-222222222222";
const request = { organizationId, userId, isCloudAccount: true };
const serverAccount = (n: number) => ({
  organization_id: organizationId, id: "account-" + n, code: "A" + String(n).padStart(3, "0"),
  name: "Account " + n, account_class: "asset", normal_side: "debit",
  parent_id: null, is_posting: true, is_active: true, control_role: null,
  revision: "9007199254740993",
});
const serverPeriod = (n: number) => ({
  organization_id: organizationId, id: "period-" + n,
  starts_on: new Date(Date.UTC(2026, 11, 31 - n)).toISOString().slice(0, 10),
  ends_on: new Date(Date.UTC(2026, 11, 31 - n)).toISOString().slice(0, 10),
  state: "closed", reopen_count: 0, revision: "3",
});
const rpc = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_ADMIN_READS", "true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", "true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
  vi.mocked(getSupabaseConfig).mockReturnValue({
    url: "https://abcdefghijklmnopqrst.supabase.co", anonKey: "sb_publishable_sample",
  });
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(hasConfiguredCloudSession).mockResolvedValue(true);
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof getSupabaseClient>);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); rpc.mockReset(); });

describe("AQVORA staging guard and paginated admin integration", () => {
  it("requires an explicit second opt-in and exact non-business project host", () => {
    expect(isAqvoraIsolatedStagingReadEnabled()).toBe(true);
    vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", undefined);
    expect(isAqvoraIsolatedStagingReadEnabled()).toBe(false);
    vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW", "true");
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "xarbzazjzcaezcpstiga");
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "https://xarbzazjzcaezcpstiga.supabase.co", anonKey: "sb_publishable_sample",
    });
    expect(isAqvoraIsolatedStagingReadEnabled()).toBe(false);
    vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF", "abcdefghijklmnopqrst");
    expect(isAqvoraIsolatedStagingReadEnabled()).toBe(false); // project does not match URL
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "https://abcdefghijklmnopqrst.supabase.co.attacker.example", anonKey: "sb_publishable_sample",
    });
    expect(isAqvoraIsolatedStagingReadEnabled()).toBe(false);
  });

  it("fetches multiple authenticated cursor pages without losing exact bigint revisions", async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => {
      if (name === "list_aqvora_accounts")
        return { data: params.p_after_code === null
          ? Array.from({ length: 200 }, (_, i) => serverAccount(i))
          : [serverAccount(200), serverAccount(201)], error: null };
      if (name === "list_aqvora_periods")
        return { data: params.p_before_start === null ? [serverPeriod(0)] : [], error: null };
      throw Error("Unexpected RPC");
    });
    const snapshot = await loadAqvoraCompleteAdminReadSnapshot(request);
    expect(snapshot.accounts).toHaveLength(202);
    expect(snapshot.hasMoreAccounts).toBe(false);
    expect(snapshot.periods).toHaveLength(1);
    expect(snapshot.accounts[201].revision).toBe("9007199254740993");
    expect(rpc).toHaveBeenCalledWith("list_aqvora_accounts", {
      p_organization_id: organizationId, p_after_code: "A199", p_limit: 200,
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("does not return a partial company book after a cursor RPC failure", async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => ({
      data: name === "list_aqvora_accounts" && params.p_after_code === null
        ? Array.from({ length: 200 }, (_, i) => serverAccount(i)) : [],
      error: name === "list_aqvora_accounts" && params.p_after_code !== null
        ? { message: "access denied" } : null,
    }));
    await expect(loadAqvoraCompleteAdminReadSnapshot(request))
      .rejects.toThrow(/pagination could not be verified/);
  });

  it("rejects pagination cursor drift and duplicate pages", async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => ({
      data: name === "list_aqvora_accounts"
        ? (params.p_after_code === null ? Array.from({ length: 200 }, (_, i) => serverAccount(i))
          : [serverAccount(199)])
        : [], error: null,
    }));
    await expect(loadAqvoraCompleteAdminReadSnapshot(request))
      .rejects.toThrow(/out-of-order or duplicate/);
  });

  it("rejects tenant-mismatched data on later pages", async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => ({
      data: name === "list_aqvora_accounts"
        ? (params.p_after_code === null ? Array.from({ length: 200 }, (_, i) => serverAccount(i))
          : [{ ...serverAccount(200), organization_id: "foreign-company" }])
        : [], error: null,
    }));
    await expect(loadAqvoraCompleteAdminReadSnapshot(request))
      .rejects.toThrow(/tenant mismatch/);
  });

  it("follows newest-first fiscal cursors without conflating periods", async () => {
    rpc.mockImplementation(async (name: string, params: Record<string, unknown>) => ({
      data: name === "list_aqvora_accounts" ? [] :
        params.p_before_start === null
          ? Array.from({ length: 200 }, (_, i) => serverPeriod(i))
          : [serverPeriod(200)], error: null,
    }));
    const snapshot = await loadAqvoraCompleteAdminReadSnapshot(request);
    expect(snapshot.periods).toHaveLength(201);
    expect(snapshot.hasMorePeriods).toBe(false);
    expect(rpc).toHaveBeenCalledWith("list_aqvora_periods", {
      p_organization_id: organizationId, p_before_start: serverPeriod(199).starts_on, p_limit: 200,
    });
  });
});
