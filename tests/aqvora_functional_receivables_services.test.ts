import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatExactCurrencyMinor } from "../src/accounting/formatExactCurrencyMinor";
import { loadIsolatedSalesCustomers } from "../src/services/aqvoraSalesCustomersReadService";

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
const context = {
  organizationId: org, userId:user, isCloudAccount:true,
  currency: "PKR", asOfDate:"2026-11-20",
};
const customer = (code: string, id:string) => ({
  organization_id:org, id, code, name:`Customer ${code}`,
  revision:"1", created_by:user, is_active:true,
});
const c1=customer("A-1","33333333-3333-4333-8333-333333333333");
const c2=customer("B-2","44444444-4444-4444-8444-444444444444");

beforeEach(() => {
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockResolvedValue({data:[c1,c2],error:null});
});
afterEach(() => {vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA exact minor-unit display", () => {
  it("renders all currencies as exact explicitly labeled source minor units", () => {
    expect(formatExactCurrencyMinor("100050","PKR")).toBe("PKR 100,050 minor units");
    expect(formatExactCurrencyMinor("100050","JPY")).toBe("JPY 100,050 minor units");
    expect(formatExactCurrencyMinor("100050","KWD")).toBe("KWD 100,050 minor units");
    expect(formatExactCurrencyMinor("0","PKR")).toBe("PKR 0 minor units");
  });
  it("preserves maximum signed-BIGINT invoice amounts exactly", () => {
    expect(formatExactCurrencyMinor("9223372036854775807","PKR"))
      .toBe("PKR 9,223,372,036,854,775,807 minor units");
  });
  it("refuses floats, negative and malformed currency strings", () => {
    for (const value of ["1.5","01","-1","1e9","1,000"]) {
      expect(() => formatExactCurrencyMinor(value,"PKR")).toThrow();
    }
    expect(() => formatExactCurrencyMinor("1","pkr")).toThrow();
  });
});

describe("AQVORA staging-only customer selector", () => {
  it("loads and validates exact sorted company-owned customer IDs",async () => {
    const result=await loadIsolatedSalesCustomers(context);
    expect(result).toMatchObject({sourceComplete:false,endReached:true});
    expect(result.customers.map(c=>c.code)).toEqual(["A-1","B-2"]);
    expect(mock.rpc).toHaveBeenCalledWith("list_aqvora_customers",{
      p_organization_id:org,p_after_code:null,p_limit:100,
    });
  });
  it("collects bounded keyset pages and rechecks session",async () => {
    mock.rpc.mockResolvedValueOnce({data:[c1],error:null})
      .mockResolvedValueOnce({data:[c2],error:null})
      .mockResolvedValueOnce({data:[],error:null});
    const result=await loadIsolatedSalesCustomers(context,{pageSize:1});
    expect(result.customers).toHaveLength(2);
    expect(mock.rpc).toHaveBeenNthCalledWith(2,"list_aqvora_customers",
      expect.objectContaining({p_after_code:"A-1",p_limit:1}));
  });
  it("rejects cross-tenant, duplicate code and untrusted revision",async () => {
    for(const rows of [
      [{...c1,organization_id:"other"}],
      [c1,c1],
      [c2,c1],
      [{...c1,revision:"1.5"}],
      [{...c1,code:"a b"}],
    ]) {
      mock.rpc.mockResolvedValueOnce({data:rows,error:null});
      await expect(loadIsolatedSalesCustomers(context)).rejects.toThrow();
    }
  });
  it("fails closed on truncation instead of returning a false complete directory",async () => {
    mock.rpc.mockResolvedValueOnce({data:[c1],error:null});
    await expect(loadIsolatedSalesCustomers(context,{pageSize:1,maxPages:1}))
      .rejects.toThrow(/safe page limit/);
  });
  it("refuses demo/lost sessions and carries 42501 without cached customers",async () => {
    await expect(loadIsolatedSalesCustomers({...context,isCloudAccount:false}))
      .rejects.toThrow(/Matching live cloud session/);
    mock.rpc.mockResolvedValueOnce({
      data:null,error:Object.assign(new Error("Access denied"),{code:"42501"}),
    });
    await expect(loadIsolatedSalesCustomers(context))
      .rejects.toMatchObject({code:"42501"});
  });
});
