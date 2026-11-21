import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
  postIsolatedCustomerReceipt,recoverOriginalCustomerReceiptPosting,
  isIsolatedReceiptPostingEnabled,
} from "../src/services/aqvoraReceiptPostingService";
import {reserveReceiptPosting,readPendingReceiptPosting}
  from "../src/accounting/pendingReceiptPosting";

const mock=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),config:vi.fn(),
  configured:vi.fn()}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:mock.rpc}),getSupabaseConfig:mock.config,
  hasConfiguredCloudSession:mock.session,isSupabaseConfigured:mock.configured,
}));
const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const customer="44444444-4444-4444-8444-444444444444";
const collection="55555555-5555-4555-8555-555555555555";
const receiptId="66666666-6666-4666-8666-666666666666";
const invoice="77777777-7777-4777-8777-777777777777";
const journal="88888888-8888-4888-8888-888888888888";
const allocation="99999999-9999-4999-8999-999999999999";
const intent="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hash="d".repeat(64);
const fp="c".repeat(64);
const ctx={organizationId:org,userId:maker,isCloudAccount:true,
  currency:"PKR",asOfDate:"2026-11-21"};

const cash=(posted:boolean)=>({
  organization_id:org,id:collection,creation_intent:"cash-1",
  collection_number:"CC-1",source_kind:"controlled_cash",
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"150",state:"confirmed",revision:"2",
  created_by:maker,confirmed_by:checker,created_at:"2026-11-20T09:00:00Z",
  confirmed_at:"2026-11-20T09:01:00Z",maker_session_fingerprint:hash,
  checker_session_fingerprint:hash,fingerprint:fp,cancel_reason:null,
  customer_snapshot:{id:customer},policy_snapshot:{
    currency:"PKR",source_kind:"controlled_cash",
  },evidence_method:"dual_control_cash_attestation",
  posted_receipt_id:posted?receiptId:null,
});
const issue=()=>({
  organization_id:org,receipt_id:receiptId,collection_id:collection,
  source_ref:"CC-1",receipt_number:"CR-1",intent_key:intent,
  journal_id:journal,journal_intent_key:`customer-receipt:${journal}`,
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"150",source_revision:"3",posted_revision:"4",
  fingerprint:hash,posted_by:maker,posted_at:"2026-11-20T11:00:00Z",
  allocations:[{allocation_id:allocation,invoice_id:invoice,
    amount_minor:"150",journal_id:journal,line_no:2}],
  evidence_method:"dual_control_cash_attestation",
});
const receipt=(posted:boolean)=>({
  organization_id:org,id:receiptId,creation_intent:"draft-intent",
  collection_id:collection,collection_fingerprint:fp,
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"150",state:posted?"posted":"approved",
  revision:posted?"4":"3",created_by:maker,approved_by:checker,
  policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  fingerprint:hash,journal_id:posted?journal:null,
  receipt_number:posted?"CR-1":null,cancel_reason:null,
  allocations:[{invoice_id:invoice,amount_minor:"150",
    invoice_revision:"4",invoice_fingerprint:"e".repeat(64)}],
  ...(posted?{issue_receipt:issue(),reconciliation:{
    source_complete:true,cash_debit_minor:"150",ar_credit_minor:"150",
    allocated_minor:"150",bank_verified:false,
    evidence_method:"dual_control_cash_attestation",
  }}:{}),
});
let posted=false;
const reserve=()=>reserveReceiptPosting(org,maker,receiptId,"3",hash);

beforeEach(()=>{
  posted=false;
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>intent});
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_POSTING","true");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockImplementation(async(method:string)=>{
    if(method==="post_aqvora_customer_receipt"){posted=true;
      return {data:issue(),error:null};}
    return {data:method==="get_aqvora_customer_receipt"?receipt(posted):
      method==="get_aqvora_cash_collection"?cash(posted):
      method==="lookup_aqvora_customer_receipt_issue"?(posted?issue():null):null,
      error:null};
  });
});
afterEach(()=>{
  vi.resetAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();sessionStorage.clear();
});

describe("AQVORA isolated immutable Customer Receipt posting",()=>{
  it("stays disabled without a separate receipt financial gate",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_POSTING","");
    expect(isIsolatedReceiptPostingEnabled()).toBe(false);
    await expect(postIsolatedCustomerReceipt(ctx,reserve().request))
      .rejects.toThrow(/disabled/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("posts only with original reserved key and independently reconciles journal/allocations",async()=>{
    const req=reserve().request;
    const result=await postIsolatedCustomerReceipt(ctx,req);
    expect(result.issue.journal_id).toBe(journal);
    expect(result.receipt.state).toBe("posted");
    expect(result.receipt.reconciliation?.bank_verified).toBe(false);
    expect(mock.rpc.mock.calls.filter(call=>call[0]==="post_aqvora_customer_receipt"))
      .toEqual([["post_aqvora_customer_receipt",req]]);
  });
  it("a lost ACK never allows a different key and can recover original source read-only",async()=>{
    const req=reserve().request;
    mock.rpc.mockImplementationOnce(async()=>({data:receipt(false),error:null}))
      .mockImplementationOnce(async()=>({data:cash(false),error:null}))
      .mockImplementationOnce(async()=>{posted=true;
        return {data:null,error:Object.assign(new Error("Network lost after commit"),{code:"PGRST"})};
      });
    await expect(postIsolatedCustomerReceipt(ctx,req))
      .rejects.toThrow(/Network lost/);
    expect(readPendingReceiptPosting(org,maker)?.request).toEqual(req);
    const recovered=await recoverOriginalCustomerReceiptPosting(ctx,req);
    expect(recovered.issue.intent_key).toBe(intent);
    expect(mock.rpc.mock.calls.filter(call=>call[0]==="post_aqvora_customer_receipt"))
      .toHaveLength(1);
  });
  it("missing original receipt is unresolved, never another financial intent",async()=>{
    const req=reserve().request;
    await expect(recoverOriginalCustomerReceiptPosting(ctx,req))
      .rejects.toThrow(/unresolved/);
    expect(readPendingReceiptPosting(org,maker)?.request).toEqual(req);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects foreign company, changed revision/fingerprint and changed actor before post",async()=>{
    const req=reserve().request;
    for(const modified of [
      {...req,p_organization_id:customer},
      {...req,p_fingerprint:"e".repeat(64)},
      {...req,p_expected_revision:"5"},
      {...req,p_intent_key:invoice},
    ]){
      await expect(postIsolatedCustomerReceipt(ctx,modified)).rejects.toThrow();
    }
    expect(mock.rpc).not.toHaveBeenCalled();
    await expect(postIsolatedCustomerReceipt({...ctx,userId:checker},req))
      .rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("blocks self-approved receipt and stale source without trying financial RPC",async()=>{
    const req=reserve().request;
    mock.rpc.mockResolvedValueOnce({data:{...receipt(false),approved_by:maker},error:null})
      .mockResolvedValueOnce({data:cash(false),error:null});
    await expect(postIsolatedCustomerReceipt(ctx,req))
      .rejects.toThrow(/not currently independently approved/);
    expect(mock.rpc.mock.calls.some(call=>call[0]==="post_aqvora_customer_receipt"))
      .toBe(false);
  });
  it("refuses forged posting acknowledgement and retains original recovery intent",async()=>{
    const req=reserve().request;
    mock.rpc.mockImplementation(async(method:string)=>{
      if(method==="post_aqvora_customer_receipt"){posted=true;
        return {data:{...issue(),amount_minor:"151"},error:null};}
      return {data:method==="get_aqvora_customer_receipt"?receipt(posted):
        method==="get_aqvora_cash_collection"?cash(posted):
        method==="lookup_aqvora_customer_receipt_issue"?issue():null,error:null};
    });
    await expect(postIsolatedCustomerReceipt(ctx,req))
      .rejects.toThrow(/did not reconcile/);
    expect(readPendingReceiptPosting(org,maker)?.request).toEqual(req);
  });
  it("revoked Auth session and denied source never post or claim success",async()=>{
    const req=reserve().request;
    mock.session.mockResolvedValue(false);
    await expect(postIsolatedCustomerReceipt(ctx,req))
      .rejects.toThrow(/Matching live cloud session/);
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.session.mockResolvedValue(true);
    mock.rpc.mockResolvedValueOnce({
      data:null,error:Object.assign(new Error("Denied"),{code:"42501"}),
    });
    await expect(postIsolatedCustomerReceipt(ctx,req))
      .rejects.toMatchObject({code:"42501"});
    expect(readPendingReceiptPosting(org,maker)?.request).toEqual(req);
  });
});
