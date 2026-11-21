import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIsolatedSalesCustomer, createIsolatedServiceInvoiceDraft,
  isIsolatedSalesDraftCreationEnabled,
} from "../src/services/aqvoraStagingSalesDraftService";

const fake=vi.hoisted(()=>({
  rpc:vi.fn(),session:vi.fn(),config:vi.fn(),configured:vi.fn(),
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:fake.rpc}),
  getSupabaseConfig:fake.config,
  hasConfiguredCloudSession:fake.session,
  isSupabaseConfigured:fake.configured,
}));

const org="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const invoice="44444444-4444-4444-8444-444444444444";
const ctx={organizationId:org,userId:user,currency:"PKR",
  asOfDate:"2026-11-20",isCloudAccount:true};
const request=()=>({
  p_organization_id:org,p_intent_key:"create-draft-once-123",
  p_customer_id:customer,p_business_date:"2026-11-20",
  p_due_date:"2026-12-10",p_currency:"PKR",
  p_lines:[{
    description:"Service",quantity_millionths:"1500000",
    unit_price_minor:"101",discount_minor:"2",
  }],
});
const saved=()=>({
  organization_id:org,id:invoice,creation_intent:"create-draft-once-123",
  customer_id:customer,business_date:"2026-11-20",due_date:"2026-12-10",
  currency:"PKR",state:"draft",revision:"1",created_by:user,
  gross_minor:"152",discount_minor:"2",face_minor:"150",
  lines:[{line_no:1,...request().p_lines[0],
    gross_minor:"152",net_minor:"150"}],
  approved_by:null,fingerprint:null,journal_id:null,
});
const newCustomer=()=>({
  organization_id:org,id:customer,code:"C-1",name:"Acme Ltd",
  revision:"1",is_active:true,created_by:user,
});

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS","true");
  fake.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  fake.configured.mockReturnValue(true);
  fake.session.mockResolvedValue(true);
  fake.rpc.mockImplementation(async (method:string)=>({
    data:method==="create_aqvora_customer"?newCustomer():saved(),error:null,
  }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA isolated-staging source-only customer and sales drafts",()=>{
  it("is strictly disabled by default and never invokes a mutation",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS","");
    expect(isIsolatedSalesDraftCreationEnabled()).toBe(false);
    await expect(createIsolatedServiceInvoiceDraft(ctx,request()))
      .rejects.toThrow(/draft mutations are disabled/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("creates a scoped customer via canonical RPC and validates original actor",async()=>{
    const result=await createIsolatedSalesCustomer(ctx,{code:"C-1",name:"Acme Ltd"});
    expect(result).toMatchObject({code:"C-1",organization_id:org});
    expect(fake.rpc).toHaveBeenCalledWith("create_aqvora_customer",{
      p_organization_id:org,p_code:"C-1",p_name:"Acme Ltd",
    });
  });
  it("creates a service-only draft with exact half-up quantity rounding",async()=>{
    const result=await createIsolatedServiceInvoiceDraft(ctx,request());
    expect(result.face_minor).toBe("150");
    expect(result.state).toBe("draft");
    expect(fake.rpc).toHaveBeenCalledWith("create_aqvora_sales_draft",request());
  });
  it("reuses the SAME stable intent and parameters for an exact retry",async()=>{
    const first=await createIsolatedServiceInvoiceDraft(ctx,request());
    const second=await createIsolatedServiceInvoiceDraft(ctx,request());
    expect(second.id).toBe(first.id);
    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });
  it("fails before RPC for fake company, date, amount, tax field or discount",async()=>{
    const baseline=request();
    for (const changed of [
      {p_organization_id:"foreign"},
      {p_currency:"USD"},
      {p_business_date:"2026-02-30"},
      {p_due_date:"2026-11-19"},
      {p_lines:[{...baseline.p_lines[0],unit_price_minor:"101.5"}]},
      {p_lines:[{...baseline.p_lines[0],discount_minor:"999"}]},
      {p_lines:[{...baseline.p_lines[0],quantity_millionths:"0"}]},
      {p_lines:[{...baseline.p_lines[0],tax_minor:"25"}]},
    ]) {
      await expect(createIsolatedServiceInvoiceDraft(ctx,{
        ...baseline,...changed,
      })).rejects.toThrow();
    }
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("refuses an altered source/actor/journal response even after a successful RPC",async()=>{
    for (const changed of [
      {organization_id:"other"},{created_by:customer},{face_minor:"151"},
      {creation_intent:"new-intent"},
      {lines:[{...saved().lines[0],gross_minor:"151"}]},
      {revision:"0"},
    ]) {
      fake.rpc.mockResolvedValueOnce({data:{...saved(),...changed},error:null});
      await expect(createIsolatedServiceInvoiceDraft(ctx,request())).rejects.toThrow();
    }
  });
  it("never uses an invalid session, demo identity or existing business project",async()=>{
    await expect(createIsolatedServiceInvoiceDraft({...ctx,isCloudAccount:false},request()))
      .rejects.toThrow(/Matching live cloud session/);
    fake.session.mockResolvedValue(false);
    await expect(createIsolatedServiceInvoiceDraft(ctx,request()))
      .rejects.toThrow(/Matching live cloud session/);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("does not silently retry after a lost-response or permission error",async()=>{
    for (const code of ["42501","23514","40001"]) {
      fake.rpc.mockResolvedValueOnce({
        data:null,error:Object.assign(new Error("Posting/draft request refused"),{code}),
      });
      await expect(createIsolatedServiceInvoiceDraft(ctx,request()))
        .rejects.toMatchObject({code});
    }
    expect(fake.rpc).toHaveBeenCalledTimes(3);
  });
});
