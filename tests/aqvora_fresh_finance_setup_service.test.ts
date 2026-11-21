import {beforeEach,describe,expect,it,vi} from "vitest";

const harness=vi.hoisted(()=>({
  connected:vi.fn(()=>true),
  session:vi.fn(async()=>true),
  rpc:vi.fn(),
  trial:vi.fn(),
}));
vi.mock("../src/services/aqvoraVerifiedFinancialReadService",()=>({
  isIsolatedVerifiedFinancialReadEnabled:harness.connected,
  loadIsolatedVerifiedTrialBalance:harness.trial,
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:harness.rpc}),
  hasConfiguredCloudSession:harness.session,
}));
import {
  createFreshFinanceAccount,createFreshFinancePeriod,
  isFreshFinanceSetupStagingEnabled,loadFreshFinanceSetup,
} from "../src/services/aqvoraFreshFinanceSetupService";

const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="11111111-1111-4111-8111-111111111111";
const FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PERIOD="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ctx={
  organizationId:ORG,userId:USER,currency:"PKR",ownerRole:"OWNER",
  isCloudAccount:true,isDemoMode:false,
};
const account={
  organization_id:ORG,id:ACC,code:"1010",name:"Cash",account_class:"asset",
  normal_side:"debit",parent_id:null,is_posting:true,is_active:true,
};
const period={
  organization_id:ORG,id:PERIOD,starts_on:"2026-01-01",ends_on:"2026-12-31",
  state:"open",
};
const certified=(token="f".repeat(64),count="0")=>({
  source:{
    organization_id:ORG,currency:"PKR",contract_version:"aqvora-read-v1",
    source_complete:true,legacy_included:false,
    source_journal_count:count,source_line_count:count,
    source_debit_minor:"0",source_credit_minor:"0",
    snapshot_token:token,
  },
  totals:{debit_minor:"0",credit_minor:"0",
    closing_debit_minor:"0",closing_credit_minor:"0"},
  rows:[],matchedCount:"0",
});

beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("VITE_ENABLE_AQVORA_FRESH_FINANCE_SETUP","true");
  harness.connected.mockReturnValue(true);
  harness.session.mockResolvedValue(true);
  harness.trial.mockResolvedValue(certified());
  harness.rpc.mockImplementation(async(name:string)=>{
    if(name==="list_aqvora_accounts")return {data:[account],error:null};
    if(name==="list_aqvora_periods")return {data:[period],error:null};
    if(name==="create_aqvora_account"||name==="get_aqvora_account"){
      return {data:account,error:null};
    }
    if(name==="create_aqvora_period"||name==="get_aqvora_period"){
      return {data:period,error:null};
    }
    return {data:null,error:{message:"RPC not allowed"}};
  });
});

describe("Fresh new-company staging finance setup: SQL-backed owner checks",()=>{
  it("starts only with two matching certified zero-source tokens and real account/period listing",async()=>{
    expect(isFreshFinanceSetupStagingEnabled()).toBe(true);
    const result=await loadFreshFinanceSetup(ctx);
    expect(result.certifiedZeroJournals).toBe(true);
    expect(result.accounts).toEqual([account]);
    expect(result.periods).toEqual([period]);
    expect(result.sourceToken).toBe("f".repeat(64));
    expect(harness.trial).toHaveBeenCalledTimes(2);
    expect(harness.trial.mock.calls[0][0]).toMatchObject({
      organizationId:ORG,userId:USER,fromDate:"0001-01-01",toDate:"9999-12-31",
    });
    expect(harness.rpc.mock.calls.map(call=>call[0])).toEqual([
      "list_aqvora_accounts","list_aqvora_periods",
    ]);
  });

  it("uses server-owned CoA and period mutations, then independently verifies saved records",async()=>{
    const created=await createFreshFinanceAccount(ctx,{
      code:" 1010 ",name:" Cash ",accountClass:"asset",normalSide:"debit",
    });
    expect(created).toEqual(account);
    expect(harness.rpc.mock.calls.map(call=>call[0])).toEqual([
      "create_aqvora_account","get_aqvora_account",
    ]);
    expect(harness.rpc.mock.calls[0][1]).toMatchObject({
      p_organization_id:ORG,p_code:"1010",p_name:"Cash",
      p_account_class:"asset",p_normal_side:"debit",
      p_parent_id:null,p_is_posting:true,
    });
    const saved=await createFreshFinancePeriod(ctx,{
      startsOn:"2026-01-01",endsOn:"2026-12-31",
    });
    expect(saved).toEqual(period);
    expect(harness.rpc.mock.calls.slice(-2).map(call=>call[0])).toEqual([
      "create_aqvora_period","get_aqvora_period",
    ]);
    expect(harness.rpc.mock.calls.at(-2)?.[1]).toMatchObject({
      p_organization_id:ORG,p_starts_on:"2026-01-01",p_ends_on:"2026-12-31",
    });
    expect(harness.trial).toHaveBeenCalledTimes(2);
    expect(harness.rpc.mock.calls.every(call=>
      !String(call[0]).includes("post_aqvora") &&
      !String(call[0]).includes("enabled_companies"))).toBe(true);
  });

  it("rejects manager, foreign context, disconnected staging and expired cloud session without SQL writes",async()=>{
    await expect(loadFreshFinanceSetup({...ctx,ownerRole:"MANAGER"})).rejects.toThrow(/OWNER/);
    await expect(loadFreshFinanceSetup({...ctx,organizationId:"x"})).rejects.toThrow(/OWNER/);
    await expect(loadFreshFinanceSetup({...ctx,isDemoMode:true})).rejects.toThrow(/OWNER/);
    harness.connected.mockReturnValue(false);
    await expect(createFreshFinanceAccount(ctx,{
      code:"1010",name:"Cash",accountClass:"asset",normalSide:"debit",
    })).rejects.toThrow(/OWNER/);
    harness.connected.mockReturnValue(true);
    harness.session.mockResolvedValue(false);
    await expect(loadFreshFinanceSetup(ctx)).rejects.toThrow(/matching cloud session/);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("does not create CoA after any journal or source token drift",async()=>{
    harness.trial.mockResolvedValueOnce(certified("f".repeat(64),"1"));
    await expect(createFreshFinanceAccount(ctx,{
      code:"1010",name:"Cash",accountClass:"asset",normalSide:"debit",
    })).rejects.toThrow(/Existing financial activity/);
    expect(harness.rpc).not.toHaveBeenCalled();
    harness.trial.mockReset();
    harness.trial.mockResolvedValueOnce(certified("a".repeat(64)))
      .mockResolvedValueOnce(certified("b".repeat(64)));
    await expect(loadFreshFinanceSetup(ctx)).rejects.toThrow(/source changed/i);
  });

  it("rejects foreign/duplicated/unsorted ledger accounts and invalid fiscal periods",async()=>{
    harness.rpc.mockImplementation(async(name:string)=>{
      if(name==="list_aqvora_accounts")return {
        data:[{...account,organization_id:FOREIGN}],error:null,
      };
      return {data:[],error:null};
    });
    await expect(loadFreshFinanceSetup(ctx)).rejects.toThrow(/foreign/i);
    harness.rpc.mockImplementation(async(name:string)=>{
      if(name==="list_aqvora_accounts")return {
        data:[account,{...account,id:FOREIGN}],error:null,
      };
      return {data:[],error:null};
    });
    await expect(loadFreshFinanceSetup(ctx)).rejects.toThrow(/duplicated/i);
    await expect(createFreshFinancePeriod(ctx,{
      startsOn:"2026-12-31",endsOn:"2026-01-01",
    })).rejects.toThrow(/non-reversed/);
  });

  it("never claims an RLS-denied, mismatched or lost write as a successful save",async()=>{
    harness.rpc.mockImplementation(async(name:string)=>{
      if(name==="create_aqvora_account")return {data:null,error:{message:"MFA required"}};
      return {data:null,error:null};
    });
    await expect(createFreshFinanceAccount(ctx,{
      code:"1010",name:"Cash",accountClass:"asset",normalSide:"debit",
    })).rejects.toThrow(/MFA required/);
    harness.rpc.mockImplementation(async(name:string)=>{
      if(name==="create_aqvora_account")return {data:account,error:null};
      if(name==="get_aqvora_account")return {data:{...account,name:"Tampered"},error:null};
      return {data:null,error:null};
    });
    await expect(createFreshFinanceAccount(ctx,{
      code:"1010",name:"Cash",accountClass:"asset",normalSide:"debit",
    })).rejects.toThrow(/did not reconcile/);
    expect(harness.rpc.mock.calls.some(call=>String(call[0]).includes("post_aqvora"))).toBe(false);
  });

  it("rejects wrong account class, malformed code and invalid date before API",async()=>{
    await expect(createFreshFinanceAccount(ctx,{
      code:"1 invalid code",name:"Cash",accountClass:"asset",normalSide:"debit",
    })).rejects.toThrow(/valid posting/);
    await expect(createFreshFinanceAccount(ctx,{
      code:"1010",name:"Cash",accountClass:"unapproved" as never,normalSide:"debit",
    })).rejects.toThrow(/valid posting/);
    await expect(createFreshFinancePeriod(ctx,{
      startsOn:"2026-02-30",endsOn:"2026-12-31",
    })).rejects.toThrow(/valid non-reversed/);
    expect(harness.rpc).not.toHaveBeenCalled();
  });
});
