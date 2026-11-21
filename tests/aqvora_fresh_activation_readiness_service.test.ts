import {beforeEach,describe,expect,it,vi} from "vitest";

const h=vi.hoisted(()=>({
  allowed:vi.fn(()=>true),session:vi.fn(async()=>true),
  setup:vi.fn(),rpc:vi.fn(),
}));
vi.mock("../src/services/aqvoraFreshFinanceSetupService",()=>({
  isFreshFinanceSetupStagingEnabled:h.allowed,
  loadFreshFinanceSetup:h.setup,
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:h.rpc}),
  hasConfiguredCloudSession:h.session,
}));
import {checkFreshFinanceActivationReadiness} from
  "../src/services/aqvoraFreshFinanceReadinessService";

const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="11111111-1111-4111-8111-111111111111";
const ctx={organizationId:ORG,userId:USER,ownerRole:"OWNER",
  currency:"PKR",isCloudAccount:true,isDemoMode:false};
const token="b".repeat(64);
const classes=[
  "asset","equity","liability","revenue","expense","cost_of_sales",
] as const;
const accounts=classes.map((account_class,i)=>({
  organization_id:ORG,id:"account-"+i,code:String(i+1)+"010",name:account_class,
  account_class,normal_side:"debit",is_posting:true,is_active:true,
  parent_id:null,
}));
const period={
  organization_id:ORG,id:"period-1",starts_on:"2026-01-01",
  ends_on:"2026-12-31",state:"open",
};
const snapshot={
  accounts,periods:[period],certifiedZeroJournals:true,
  currency:"PKR",sourceToken:token,
};
const policy={
  contract_version:"aqvora-currency-policy-v1",status:"configured",
  organization_id:ORG,transaction_currency:"PKR",ledger_currency:"PKR",
  currency_exponent:2,minor_units_per_major:"100",display_decimal_places:2,
  revision:"1",effective_from:"2025-01-01",fingerprint:"c".repeat(64),
  provenance:{
    kind:"trusted_company_accounting_policy",
    authority_reference:"approved ISO authority review",
    authority_revision:"2026-1",approval_reference:"review-1",approved_by:USER,
  },
  source_rounding:"quantity_millionths_half_up_per_line_v1",fx_supported:false,
};
const response=(p:unknown=policy)=>({
  contract_version:"aqvora-currency-read-v1",
  organization_id:ORG,transaction_currency:"PKR",ledger_currency:"PKR",
  as_of_date:"2026-01-01",status:p===null?"unconfigured":"configured",
  display_complete:p!==null,policy:p,
});

beforeEach(()=>{
  vi.clearAllMocks();
  h.allowed.mockReturnValue(true);
  h.session.mockResolvedValue(true);
  h.setup.mockResolvedValue(snapshot);
  h.rpc.mockResolvedValue({data:response(),error:null});
});

describe("AQVORA fresh-company activation readiness preflight, read-only",()=>{
  it("reviews full authentic evidence while never granting posting authority",async()=>{
    const result=await checkFreshFinanceActivationReadiness(ctx);
    expect(result).toMatchObject({
      organizationId:ORG,currency:"PKR",sourceToken:token,
      zeroFinancialHistoryCertified:true,currencyPolicyRevision:"1",
      fiscalPeriods:1,postingAccounts:6,blockers:[],
      checklistComplete:true,activationPermitted:false,
      stage:"READ_ONLY_STAGING_PREFLIGHT",
    });
    expect(h.setup).toHaveBeenCalledTimes(2);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0]).toEqual([
      "read_aqvora_currency_policy",{
        p_organization_id:ORG,p_currency:"PKR",p_as_of_date:"2026-01-01",
      },
    ]);
    expect(h.rpc.mock.calls.every(c=>c[0]!=="post_aqvora_journal" &&
      c[0]!=="activate_aqvora_company" &&
      c[0]!=="aqvora_enabled_companies")).toBe(true);
  });
  it("reports missing CoA and fiscal config as blockers, not fake zeros",async()=>{
    h.setup.mockResolvedValue({...snapshot,
      accounts:accounts.slice(0,2),periods:[]});
    const result=await checkFreshFinanceActivationReadiness(ctx);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "NO_FISCAL_PERIOD","MULTIPLE_OPEN_PERIODS","MISSING_REVENUE",
      "MISSING_LIABILITY","MISSING_EXPENSE","MISSING_COST_OF_SALES",
      "CURRENCY_POLICY_UNCONFIGURED",
    ]));
    expect(result.activationPermitted).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("does not invent money scale if trustworthy currency authority is unconfigured",async()=>{
    h.rpc.mockResolvedValue({data:response(null),error:null});
    const result=await checkFreshFinanceActivationReadiness(ctx);
    expect(result.currencyPolicyRevision).toBeNull();
    expect(result.blockers).toEqual(["CURRENCY_POLICY_UNCONFIGURED"]);
    expect(result.checklistComplete).toBe(false);
  });
  it("blocks incorrect policy exponent, company, date and malformed policy",async()=>{
    for(const item of [
      response({...policy,organization_id:"foreign"}),
      response({...policy,currency_exponent:2,minor_units_per_major:"1000"}),
      {...response(),organization_id:"foreign"},
      {...response(),as_of_date:"2026-01-02"},
      {...response(),display_complete:false},
      { ...response(),policy:null },
    ]){
      h.rpc.mockResolvedValue({data:item,error:null});
      await expect(checkFreshFinanceActivationReadiness(ctx)).rejects.toThrow();
    }
  });
  it("refuses a revoked/foreign/manager session BEFORE any currency RPC",async()=>{
    await expect(checkFreshFinanceActivationReadiness({
      ...ctx,ownerRole:"MANAGER",
    })).rejects.toThrow(/OWNER/);
    await expect(checkFreshFinanceActivationReadiness({
      ...ctx,isDemoMode:true,
    })).rejects.toThrow(/OWNER/);
    h.allowed.mockReturnValue(false);
    await expect(checkFreshFinanceActivationReadiness(ctx)).rejects.toThrow(/OWNER/);
    h.allowed.mockReturnValue(true);
    h.session.mockResolvedValue(false);
    await expect(checkFreshFinanceActivationReadiness(ctx)).rejects.toThrow(/OWNER/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects a changing verified zero source, unauthorized RPC, or interval overlap",async()=>{
    h.setup.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({
      ...snapshot,sourceToken:"d".repeat(64),
    });
    await expect(checkFreshFinanceActivationReadiness(ctx))
      .rejects.toThrow(/changed during readiness/);
    h.setup.mockReset();h.setup.mockResolvedValue(snapshot);
    h.rpc.mockResolvedValue({data:null,error:{message:"MFA required"}});
    await expect(checkFreshFinanceActivationReadiness(ctx)).rejects.toThrow(/MFA required/);
    h.rpc.mockResolvedValue({data:response(),error:null});
    const overlapping={...period,id:"period-2",starts_on:"2026-06-01",
      ends_on:"2027-05-31",state:"closed"};
    h.setup.mockResolvedValue({...snapshot,periods:[period,overlapping]});
    const result=await checkFreshFinanceActivationReadiness(ctx);
    expect(result.blockers).toContain("OVERLAPPING_PERIODS");
  });
});
