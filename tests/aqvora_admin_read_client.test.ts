import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient, hasConfiguredCloudSession } from "../src/lib/supabase";
import { loadAqvoraAdminReadSnapshot } from "../src/services/aqvoraAdminReadService";

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
  hasConfiguredCloudSession: vi.fn(),
}));

const organizationId = "77f11111-1111-4111-8111-111111111111";
const userId = "88f22222-2222-4222-8222-222222222222";
const request = { userId, organizationId, isCloudAccount: true };

const account = {
  organization_id: organizationId,
  id: "a1",
  code: "1010",
  name: "Cash in hand",
  account_class: "asset",
  normal_side: "debit",
  parent_id: null,
  is_posting: true,
  is_active: true,
  control_role: "cash",
  revision: 3,
};
const period = {
  organization_id: organizationId,
  id: "p1",
  starts_on: "2026-11-01",
  ends_on: "2026-11-30",
  state: "open",
  reopen_count: 2,
  revision: "9007199254740993",
};
const rpc = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_ADMIN_READS", "true");
  vi.mocked(hasConfiguredCloudSession).mockResolvedValue(true);
  rpc.mockImplementation(async (name: string) => {
    if (name === "list_aqvora_accounts") return { data: [account], error: null };
    if (name === "list_aqvora_periods") return { data: [period], error: null };
    throw new Error("Unexpected RPC call");
  });
  vi.mocked(getSupabaseClient).mockReturnValue({
    rpc,
  } as unknown as ReturnType<typeof getSupabaseClient>);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  rpc.mockReset();
});

describe("AQVORA V2 administration read adapter (PR #44 contract)", () => {
  it("maps a company-scoped chart and period with exact bigint revisions", async () => {
    const snapshot = await loadAqvoraAdminReadSnapshot(request);
    expect(snapshot.source).toBe("verified-cloud-rpc");
    expect(snapshot.accounts).toEqual([{
      organizationId,
      id: "a1",
      code: "1010",
      name: "Cash in hand",
      accountClass: "asset",
      normalSide: "debit",
      parentId: null,
      isPosting: true,
      isActive: true,
      controlRole: "cash",
      revision: "3",
    }]);
    expect(snapshot.periods).toEqual([{
      organizationId,
      id: "p1",
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      state: "open",
      reopenCount: 2,
      revision: "9007199254740993",
    }]);
    expect(snapshot.hasMoreAccounts).toBe(false);
    expect(snapshot.hasMorePeriods).toBe(false);
    expect(rpc).toHaveBeenCalledWith("list_aqvora_accounts", {
      p_organization_id: organizationId, p_after_code: null, p_limit: 200,
    });
    expect(rpc).toHaveBeenCalledWith("list_aqvora_periods", {
      p_organization_id: organizationId, p_before_start: null, p_limit: 200,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("is OFF by default and never calls the cloud without an explicit opt-in", async () => {
    vi.stubEnv("VITE_ENABLE_AQVORA_ADMIN_READS", undefined);
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/not enabled/);
    expect(hasConfiguredCloudSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects local/demo identities and missing sessions before any RPC", async () => {
    await expect(loadAqvoraAdminReadSnapshot({ ...request, isCloudAccount: false }))
      .rejects.toThrow(/signed-in cloud company/);
    vi.mocked(hasConfiguredCloudSession).mockResolvedValue(false);
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/session expired/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never substitutes an illustrative chart when SQL, MFA or migrations fail", async () => {
    rpc.mockImplementation(async (name: string) => name === "list_aqvora_accounts"
      ? { data: null, error: { message: "permission denied" } }
      : { data: [period], error: null });
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/could not be verified/);
  });

  it("refuses cross-company response rows even if a server accidentally returns them", async () => {
    rpc.mockImplementation(async (name: string) => name === "list_aqvora_accounts"
      ? { data: [{ ...account, organization_id: "another-company" }], error: null }
      : { data: [period], error: null });
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/tenant mismatch/);
  });

  it("rejects unsafe revision precision and malformed fiscal period semantics", async () => {
    rpc.mockImplementation(async (name: string) => name === "list_aqvora_accounts"
      ? { data: [{ ...account, revision: 9007199254740992 }], error: null }
      : { data: [period], error: null });
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/exactly/);
    rpc.mockImplementation(async (name: string) => name === "list_aqvora_accounts"
      ? { data: [account], error: null }
      : { data: [{ ...period, state: "reopened" }], error: null });
    await expect(loadAqvoraAdminReadSnapshot(request)).rejects.toThrow(/invalid/);
  });

  it("does not present a full chart if the first page could be incomplete", async () => {
    rpc.mockImplementation(async (name: string) => name === "list_aqvora_accounts"
      ? { data: Array.from({ length: 200 }, (_, i) => ({ ...account, id: `a${i}`, code: `C${i}` })), error: null }
      : { data: [], error: null });
    const snapshot = await loadAqvoraAdminReadSnapshot(request);
    expect(snapshot.accounts).toHaveLength(200);
    expect(snapshot.hasMoreAccounts).toBe(true);
  });
});
