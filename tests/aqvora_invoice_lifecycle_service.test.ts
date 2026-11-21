import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySalesLifecycleInvoice } from "../src/accounting/verifiedSalesLifecycle";
import {
  isIsolatedInvoiceLifecycleEnabled, isIsolatedInvoiceIssueEnabled,
  loadIsolatedSalesInvoice, transitionIsolatedSalesInvoice,
  issueIsolatedSalesInvoice, lookupIsolatedSalesIssue,
} from "../src/services/aqvoraSalesLifecycleService";

const fake=vi.hoisted(()=>({
  rpc:vi.fn(),session:vi.fn(),config:vi.fn(),configured:vi.fn(),
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:fake.rpc}),getSupabaseConfig:fake.config,
  hasConfiguredCloudSession:fake.session,isSupabaseConfigured:fake.configured,
}));
const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const customer="44444444-4444-4444-8444-444444444444";
const invoiceId="55555555-5555-4555-8555-555555555555";
const journal="66666666-6666-4666-8666-666666666666";
const key="77777777-7777-4777-8777-777777777777";
const fingerprint="a".repeat(64);
const ctx=(userId=maker)=>({organizationId:org,userId,isCloudAccount:true,
  currency:"PKR",asOfDate:"2026-11-21"});
const receipt=()=>({
  organization_id:org,invoice_id:invoiceId,customer_id:customer,
  document_number:"SI-1",business_date:"2026-11-20",currency:"PKR",
  face_minor:"150",source_revision:"3",issued_revision:"4",
  fingerprint,journal_id:journal,intent_key:key,posted_by:maker,
  journal_intent_key:"journal-unique-intent",posted_at:"2026-11-20T12:00:00Z",
});
const source=(state:"draft"|"submitted"|"approved"|"issued"="draft")=>({
  organization_id:org,id:invoiceId,creation_intent:"create-1",
  customer_id:customer,currency:"PKR",business_date:"2026-11-20",
  due_date:"2026-11-30",created_by:maker,created_at:"2026-11-20T10:00:00Z",
  revision:state==="draft"?"1":state==="submitted"?"2":state==="approved"?"3":"4",
  lines:[{line_no:1,description:"Consulting",quantity_millionths:"1500000",
    unit_price_minor:"101",discount_minor:"2",gross_minor:"152",net_minor:"150"}],
  gross_minor:"152",discount_minor:"2",face_minor:"150",
  state, approved_by:state==="approved"||state==="issued"?checker:null,
  fingerprint:state==="draft"?null:fingerprint,
  customer_snapshot:state==="draft"?null:{id:customer,name:"Acme"},
  policy_snapshot:state==="draft"?null:{jurisdiction:"TEST"},
  journal_id:state==="issued"?journal:null,
  document_number:state==="issued"?"SI-1":null,cancel_reason:null,
  ...(state==="issued"?{
    issue_receipt:receipt(),
    reconciliation:{source_complete:true,face_minor:"150",ar_debit_minor:"150",
      revenue_credit_minor:"150",allocated_minor:"0",outstanding_minor:"150",
      settlements_supported:true,basis:"v2_posted_receipt_allocations"},
  }:{}),
});

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_DRAFT_MUTATIONS","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE","true");
  fake.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  fake.configured.mockReturnValue(true);
  fake.session.mockResolvedValue(true);
  fake.rpc.mockResolvedValue({data:source(),error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("verified service invoice financial source",()=>{
  it("accepts real draft/submitted/approved/issued source states",()=>{
    for(const state of ["draft","submitted","approved","issued"] as const){
      const v=verifySalesLifecycleInvoice(source(state),{...ctx(),invoiceId});
      expect(v.state).toBe(state);
      expect(v.face_minor).toBe("150");
    }
  });
  it("rejects fake posting, false money, self-approval and foreign tenant",()=>{
    for (const altered of [
      {...source("draft"),journal_id:journal},
      {...source("approved"),approved_by:maker},
      {...source("approved"),fingerprint:"invalid"},
      {...source("issued"),issue_receipt:{...receipt(),face_minor:"149"}},
      {...source("issued"),reconciliation:{...source("issued").reconciliation,ar_debit_minor:"149"}},
      {...source("issued"),reconciliation:{...source("issued").reconciliation,allocated_minor:"200"}},
      {...source(),organization_id:"foreign"},
      {...source(),lines:[{...source().lines[0],gross_minor:"151"}]},
    ])expect(()=>verifySalesLifecycleInvoice(altered,{...ctx(),invoiceId})).toThrow();
  });
});

describe("isolated invoice maker/checker lifecycle transport",()=>{
  it("blocks transition/financial issue unless separately explicit staging flags exist",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE","");
    expect(isIsolatedInvoiceLifecycleEnabled()).toBe(false);
    await expect(transitionIsolatedSalesInvoice(ctx(),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"1",p_action:"submit",
    })).rejects.toThrow(/disabled/);
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE","true");
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE","");
    expect(isIsolatedInvoiceIssueEnabled()).toBe(false);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("loads a real source via strict company-scoped read-only RPC",async()=>{
    const loaded=await loadIsolatedSalesInvoice(ctx(),invoiceId);
    expect(loaded.state).toBe("draft");
    expect(fake.rpc).toHaveBeenCalledWith("get_aqvora_sales_invoice",{
      p_organization_id:org,p_invoice_id:invoiceId,
    });
  });
  it("submits maker draft once with exact compare-and-swap revision",async()=>{
    fake.rpc.mockResolvedValueOnce({data:source("draft"),error:null})
      .mockResolvedValueOnce({data:source("submitted"),error:null});
    const result=await transitionIsolatedSalesInvoice(ctx(),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"1",p_action:"submit",
    });
    expect(result.state).toBe("submitted");
    expect(result.revision).toBe("2");
    expect(fake.rpc).toHaveBeenNthCalledWith(2,"transition_aqvora_sales_invoice",{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"1",
      p_action:"submit",p_reason:null,
    });
  });
  it("distinct OWNER approval preserves original immutable source fingerprint",async()=>{
    fake.rpc.mockResolvedValueOnce({data:source("submitted"),error:null})
      .mockResolvedValueOnce({data:source("approved"),error:null});
    const result=await transitionIsolatedSalesInvoice(ctx(checker),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"2",p_action:"approve",
    });
    expect(result.approved_by).toBe(checker);
    expect(result.fingerprint).toBe(fingerprint);
  });
  it("refuses self-approval and stale revisions BEFORE mutating SQL",async()=>{
    fake.rpc.mockResolvedValueOnce({data:source("submitted"),error:null});
    await expect(transitionIsolatedSalesInvoice(ctx(maker),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"2",p_action:"approve",
    })).rejects.toThrow(/maker-checker/);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    fake.rpc.mockResolvedValueOnce({data:source("draft"),error:null});
    await expect(transitionIsolatedSalesInvoice(ctx(maker),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"9",p_action:"submit",
    })).rejects.toThrow(/revision/);
    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });
  it("reject requires reason, and source-policy SQL denial propagates unchanged",async()=>{
    await expect(transitionIsolatedSalesInvoice(ctx(checker),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"2",
      p_action:"reject",p_reason:"",
    })).rejects.toThrow(/reason/);
    fake.rpc.mockResolvedValueOnce({data:source("draft"),error:null})
      .mockResolvedValueOnce({data:null,error:Object.assign(new Error("Missing trusted tax policy"),{code:"23514"})});
    await expect(transitionIsolatedSalesInvoice(ctx(),{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"1",p_action:"submit",
    })).rejects.toMatchObject({code:"23514"});
  });
  it("issues one approved invoice and validates durable journal and outstanding",async()=>{
    fake.rpc.mockResolvedValueOnce({data:source("approved"),error:null})
      .mockResolvedValueOnce({data:receipt(),error:null})
      .mockResolvedValueOnce({data:source("issued"),error:null});
    const done=await issueIsolatedSalesInvoice(ctx(),{
      p_organization_id:org,p_invoice_id:invoiceId,
      p_expected_revision:"3",p_fingerprint:fingerprint,p_intent_key:key,
    });
    expect(done.invoice.state).toBe("issued");
    expect(done.receipt.journal_id).toBe(journal);
    expect(fake.rpc).toHaveBeenNthCalledWith(2,"issue_aqvora_sales_invoice",{
      p_organization_id:org,p_invoice_id:invoiceId,p_expected_revision:"3",
      p_fingerprint:fingerprint,p_intent_key:key,
    });
  });
  it("missing original issuance is unresolved, never permission for a new key",async()=>{
    fake.rpc.mockResolvedValueOnce({data:null,error:null});
    expect(await lookupIsolatedSalesIssue(ctx(),key))
      .toEqual({status:"unresolved",safeToChangeIntent:false});
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers original issue only after matching durable source document",async()=>{
    fake.rpc.mockResolvedValueOnce({data:receipt(),error:null})
      .mockResolvedValueOnce({data:source("issued"),error:null});
    const recovered=await lookupIsolatedSalesIssue(ctx(),key);
    expect(recovered.status).toBe("found");
  });
  it("preserves actual 42501/40001 denial instead of fabricating success",async()=>{
    for(const code of ["42501","40001"]){
      fake.rpc.mockResolvedValueOnce({data:null,
        error:Object.assign(new Error("Source denied"),{code})});
      await expect(lookupIsolatedSalesIssue(ctx(),key)).rejects.toMatchObject({code});
    }
  });
});
