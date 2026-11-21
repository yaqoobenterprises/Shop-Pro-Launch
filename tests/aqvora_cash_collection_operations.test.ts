import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIsolatedCashCollection, confirmIsolatedCashCollection,
  cancelIsolatedCashCollection, isIsolatedCashCollectionEnabled,
  loadCurrentIsolatedCash,
} from "../src/services/aqvoraCashCollectionOperations";

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
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const customer="44444444-4444-4444-8444-444444444444";
const cashId="55555555-5555-4555-8555-555555555555";
const key="66666666-6666-4666-8666-666666666666";
const fp="a".repeat(64);
const ctx=(userId=maker)=>({organizationId:org,userId,currency:"PKR",
  asOfDate:"2026-11-21",isCloudAccount:true});
const req=()=>({p_organization_id:org,p_intent_key:key,
  p_customer_id:customer,p_business_date:"2026-11-20",p_currency:"PKR",
  p_amount_minor:"150",p_source_kind:"controlled_cash" as const});
const draft=()=>({
  organization_id:org,id:cashId,creation_intent:key,collection_number:"CC-1",
  source_kind:"controlled_cash",customer_id:customer,business_date:"2026-11-20",
  currency:"PKR",amount_minor:"150",state:"draft",revision:"1",
  created_by:maker,confirmed_by:null,
  maker_session_fingerprint:fp,checker_session_fingerprint:null,
  customer_snapshot:null,policy_snapshot:null,fingerprint:null,
  created_at:"2026-11-20T14:00:00Z",confirmed_at:null,cancel_reason:null,
  evidence_method:"unconfirmed_claim",posted_receipt_id:null,
});
const confirmed=()=>({
  ...draft(),state:"confirmed",revision:"2",confirmed_by:checker,
  checker_session_fingerprint:fp,fingerprint:fp,
  customer_snapshot:{id:customer,name:"Synthetic Customer"},
  policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  confirmed_at:"2026-11-20T14:01:00Z",evidence_method:"dual_control_cash_attestation",
});
const cancelled=()=>({...draft(),state:"cancelled",revision:"2",cancel_reason:"Entered in error"});

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS","true");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockImplementation(async (method:string)=>({
    data:method==="confirm_aqvora_cash_collection"?confirmed():
      method==="cancel_aqvora_cash_collection"?cancelled():draft(),error:null,
  }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA operational controlled-cash staging RPCs",()=>{
  it("never sends a mutation unless the independent cash gate is enabled",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS","");
    expect(isIsolatedCashCollectionEnabled()).toBe(false);
    await expect(createIsolatedCashCollection(ctx(),req()))
      .rejects.toThrow(/disabled outside isolated staging/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("saves exact cash claim once with original intent and returns only unconfirmed source",async()=>{
    const result=await createIsolatedCashCollection(ctx(),req());
    expect(result.attestation).toBe("unconfirmed");
    expect(result.bankVerified).toBe(false);
    expect(result.collection.amount_minor).toBe("150");
    expect(mock.rpc).toHaveBeenCalledWith("create_aqvora_cash_collection",req());
  });
  it("identical creation intent stays reusable for a lost response",async()=>{
    await createIsolatedCashCollection(ctx(),req());
    await createIsolatedCashCollection(ctx(),req());
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc.mock.calls[0][1]).toEqual(mock.rpc.mock.calls[1][1]);
  });
  it("denies altered money, foreign tenant, future date and unsupported source before mutation",async()=>{
    for (const mutation of [
      {p_organization_id:"elsewhere"},{p_currency:"USD"},
      {p_business_date:"2026-11-22"},{p_business_date:"2026-02-30"},
      {p_source_kind:"bank_feed"},{p_amount_minor:"150.00"},
      {p_amount_minor:"0"},{p_amount_minor:"9223372036854775808"},
      {p_customer_id:"fake"},{p_intent_key:""},
    ]){
      await expect(createIsolatedCashCollection(ctx(),{
        ...req(),...mutation,
      } as ReturnType<typeof req>)).rejects.toThrow();
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("refuses tampered actor, amount and foreign source responses",async()=>{
    for(const mutation of [
      {created_by:checker},{organization_id:"elsewhere"},
      {amount_minor:"151"},{customer_id:"elsewhere"},
      {creation_intent:"not-original"},{fingerprint:fp},
    ]){
      mock.rpc.mockResolvedValueOnce({data:{...draft(),...mutation},error:null});
      await expect(createIsolatedCashCollection(ctx(),req())).rejects.toThrow();
    }
  });
  it("only a distinct OWNER confirms the exact amount and server revision",async()=>{
    const result=await confirmIsolatedCashCollection(ctx(checker),draft(),{
      p_organization_id:org,p_collection_id:cashId,p_expected_revision:"1",
      p_counted_minor:"150",p_attestation:"cash_counted_in_person",
    },"OWNER");
    expect(result.collection.state).toBe("confirmed");
    expect(result.attestation).toBe("dual_control");
    expect(result.bankVerified).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith("confirm_aqvora_cash_collection",{
      p_organization_id:org,p_collection_id:cashId,p_expected_revision:"1",
      p_counted_minor:"150",p_attestation:"cash_counted_in_person",
    });
  });
  it("blocks self-confirmation, manager approval, changed counts and stale revisions",async()=>{
    for(const [user,role,count,rev] of [
      [maker,"OWNER","150","1"],[checker,"MANAGER","150","1"],
      [checker,"OWNER","149","1"],[checker,"OWNER","150","2"],
    ] as const){
      await expect(confirmIsolatedCashCollection(ctx(user),draft(),{
        p_organization_id:org,p_collection_id:cashId,
        p_expected_revision:rev,p_counted_minor:count,
        p_attestation:"cash_counted_in_person",
      },role)).rejects.toThrow();
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("cancels only an unconfirmed claim with exact audit reason",async()=>{
    const result=await cancelIsolatedCashCollection(ctx(maker),
      draft(),"Entered in error","MANAGER");
    expect(result.collection.state).toBe("cancelled");
    expect(mock.rpc).toHaveBeenCalledWith("cancel_aqvora_cash_collection",{
      p_organization_id:org,p_collection_id:cashId,
      p_expected_revision:"1",p_reason:"Entered in error",
    });
    await expect(cancelIsolatedCashCollection(ctx(checker),confirmed() as never,
      "Entered in error","OWNER")).rejects.toThrow(/valid draft/);
  });
  it("requires live session, avoids synthetic data fallback and propagates SQLSTATE",async()=>{
    mock.session.mockResolvedValue(false);
    await expect(createIsolatedCashCollection(ctx(),req()))
      .rejects.toThrow(/Matching live cloud session/);
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.session.mockResolvedValue(true);
    for(const code of ["42501","23514","40001"]){
      mock.rpc.mockResolvedValueOnce({
        data:null,error:Object.assign(new Error("Server denied"),{code}),
      });
      await expect(loadCurrentIsolatedCash(ctx(),cashId))
        .rejects.toMatchObject({code});
    }
  });
});
