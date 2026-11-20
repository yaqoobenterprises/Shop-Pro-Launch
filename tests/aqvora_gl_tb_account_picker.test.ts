import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {listIsolatedPostingAccounts} from "../src/services/aqvoraPostingAccountsReadService";

const mock=vi.hoisted(()=>({
  rpc:vi.fn(),session:vi.fn(),config:vi.fn(),configured:vi.fn(),
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:mock.rpc}),
  getSupabaseConfig:mock.config,
  hasConfiguredCloudSession:mock.session,
  isSupabaseConfigured:mock.configured,
}));
const org="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const ctx={organizationId:org,userId:user,isCloudAccount:true};
const account=(id:string,code:string,posting=true)=>({
  organization_id:org,id,code,name:`Account ${code}`,
  account_class:"asset",normal_side:"debit",parent_id:null,
  is_posting:posting,is_active:true,control_role:null,revision:"1",
});
const cash=account("33333333-3333-4333-8333-333333333333","1000");
const parent=account("44444444-4444-4444-8444-444444444444","1010",false);
const bank=account("55555555-5555-4555-8555-555555555555","1020");

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockResolvedValue({data:[cash,parent,bank],error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA isolated certified finance account picker",()=>{
  it("lists company-owned active posting accounts, never using non-posting parents",async()=>{
    const result=await listIsolatedPostingAccounts(ctx);
    expect(result.map(x=>x.code)).toEqual(["1000","1020"]);
    expect(mock.rpc).toHaveBeenCalledWith("list_aqvora_accounts",{
      p_organization_id:org,p_after_code:null,p_limit:100,
    });
  });
  it("paginates safely and never returns a partial truncated directory",async()=>{
    mock.rpc.mockResolvedValueOnce({data:[cash],error:null})
      .mockResolvedValueOnce({data:[bank],error:null})
      .mockResolvedValueOnce({data:[],error:null});
    expect((await listIsolatedPostingAccounts(ctx,{pageSize:1}))).toHaveLength(2);
    expect(mock.rpc).toHaveBeenNthCalledWith(2,"list_aqvora_accounts",
      expect.objectContaining({p_after_code:"1000",p_limit:1}));
  });
  it("rejects same-company duplicates, foreign rows and noncanonical revisions",async()=>{
    for(const rows of [
      [cash,cash],
      [bank,cash],
      [cash,{...bank,organization_id:"other"}],
      [{...cash,revision:"1.5"}],
      [{...cash,is_posting:true,id:""}],
    ]){
      mock.rpc.mockResolvedValueOnce({data:rows,error:null});
      await expect(listIsolatedPostingAccounts(ctx)).rejects.toThrow();
    }
  });
  it("never reads when the staging flag, live session or cloud account is absent",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS","");
    await expect(listIsolatedPostingAccounts(ctx)).rejects.toThrow(/disabled/);
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS","true");
    mock.session.mockResolvedValue(false);
    await expect(listIsolatedPostingAccounts(ctx)).rejects.toThrow(/session unavailable/);
    await expect(listIsolatedPostingAccounts({...ctx,isCloudAccount:false}))
      .rejects.toThrow(/disabled/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("throws on pagination overlimit and a source permission refusal",async()=>{
    mock.rpc.mockResolvedValueOnce({data:[cash],error:null});
    await expect(listIsolatedPostingAccounts(ctx,{pageSize:1,maxPages:1}))
      .rejects.toThrow(/safe pagination limit/);
    mock.rpc.mockResolvedValueOnce({data:null,
      error:Object.assign(new Error("Forbidden"),{code:"42501"})});
    await expect(listIsolatedPostingAccounts(ctx))
      .rejects.toMatchObject({code:"42501"});
  });
});
