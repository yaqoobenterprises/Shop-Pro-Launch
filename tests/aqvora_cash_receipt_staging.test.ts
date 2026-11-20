import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadIsolatedCashCollection, loadIsolatedCustomerReceipt,
  lookupIsolatedCustomerReceiptIssue,
} from "../src/services/aqvoraCashReceiptReadService";

const mock=vi.hoisted(()=>({
  rpc:vi.fn(),session:vi.fn(),configured:vi.fn(),config:vi.fn(),
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
const collectionId="55555555-5555-4555-8555-555555555555";
const receiptId="66666666-6666-4666-8666-666666666666";
const invoiceId="77777777-7777-4777-8777-777777777777";
const journal="88888888-8888-4888-8888-888888888888";
const allocationId="99999999-9999-4999-8999-999999999999";
const fp="a".repeat(64);
const context={organizationId:org,userId:maker,isCloudAccount:true,
  customerId:customer,currency:"PKR",asOfDate:"2026-11-20"};
const cash=()=>({
  organization_id:org,id:collectionId,creation_intent:"cash-1",
  collection_number:"CC-1",source_kind:"controlled_cash",
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"100",state:"confirmed",revision:"2",
  created_by:maker,confirmed_by:checker,created_at:"2026-11-20T10:00:00Z",
  confirmed_at:"2026-11-20T10:01:00Z",
  maker_session_fingerprint:fp,checker_session_fingerprint:fp,
  fingerprint:"c".repeat(64),cancel_reason:null,
  customer_snapshot:{id:customer},
  policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  evidence_method:"dual_control_cash_attestation",
  posted_receipt_id:receiptId,
});
const receipt=()=>({
  organization_id:org,id:receiptId,creation_intent:"receipt-draft-1",
  collection_id:collectionId,collection_fingerprint:"c".repeat(64),
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"100",state:"posted",revision:"4",
  created_by:maker,approved_by:checker,
  policy_snapshot:{currency:"PKR",source_kind:"controlled_cash"},
  fingerprint:"d".repeat(64),journal_id:journal,
  receipt_number:"CR-1",cancel_reason:null,
  allocations:[{invoice_id:invoiceId,amount_minor:"100",
    invoice_revision:"4",invoice_fingerprint:"e".repeat(64)}],
  issue_receipt:{
    organization_id:org,receipt_id:receiptId,collection_id:collectionId,
    source_ref:"CC-1",receipt_number:"CR-1",intent_key:"post-1",
    journal_id:journal,journal_intent_key:`customer-receipt:${journal}`,
    customer_id:customer,business_date:"2026-11-20",currency:"PKR",
    amount_minor:"100",source_revision:"3",posted_revision:"4",
    fingerprint:"d".repeat(64),posted_by:maker,posted_at:"2026-11-20T10:02:00Z",
    allocations:[{allocation_id:allocationId,invoice_id:invoiceId,
      amount_minor:"100",journal_id:journal,line_no:2}],
    evidence_method:"dual_control_cash_attestation",
  },
  reconciliation:{
    source_complete:true,cash_debit_minor:"100",ar_credit_minor:"100",
    allocated_minor:"100",bank_verified:false,
    evidence_method:"dual_control_cash_attestation",
  },
});

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockImplementation(async (name:string)=>({
    data:name==="get_aqvora_cash_collection"?cash():
      name==="lookup_aqvora_customer_receipt_issue"?receipt().issue_receipt:receipt(),
    error:null,
  }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA isolated staging cash evidence and receipt recovery",()=>{
  it("uses only verified read-only receipt/cash RPCs and ties both sources",async()=>{
    const v=await loadIsolatedCustomerReceipt(context,receiptId);
    expect(v.bankVerified).toBe(false);
    expect(v.cash.attestation).toBe("dual_control");
    expect(v.receipt.reconciliation?.ar_credit_minor).toBe("100");
    expect(mock.rpc).toHaveBeenNthCalledWith(1,"get_aqvora_customer_receipt",{
      p_organization_id:org,p_receipt_id:receiptId,
    });
    expect(mock.rpc).toHaveBeenNthCalledWith(2,"get_aqvora_cash_collection",{
      p_organization_id:org,p_collection_id:collectionId,
    });
  });

  it("refuses unconfirmed cash as verified receipt evidence",async()=>{
    const source=cash();
    mock.rpc.mockImplementationOnce(async()=>({data:receipt(),error:null}))
      .mockImplementationOnce(async()=>({data:{
        ...source,state:"draft",revision:"1",confirmed_by:null,
        confirmed_at:null,checker_session_fingerprint:null,fingerprint:null,
        posted_receipt_id:null,evidence_method:"unconfirmed_claim",
      },error:null}));
    await expect(loadIsolatedCustomerReceipt(context,receiptId))
      .rejects.toThrow(/do not reconcile/);
  });

  it("rejects a different cash fingerprint, wrong source and false bank verification",async()=>{
    mock.rpc.mockImplementationOnce(async()=>({data:receipt(),error:null}))
      .mockImplementationOnce(async()=>({data:{...cash(),fingerprint:"f".repeat(64)},error:null}));
    await expect(loadIsolatedCustomerReceipt(context,receiptId))
      .rejects.toThrow(/do not reconcile/);
    mock.rpc.mockResolvedValueOnce({data:{
      ...receipt(),reconciliation:{...receipt().reconciliation,bank_verified:true},
    },error:null});
    await expect(loadIsolatedCustomerReceipt(context,receiptId))
      .rejects.toThrow(/reconciliation or evidence/);
  });

  it("recovers the exact durable issue by original intent without creating payment",async()=>{
    const v=await lookupIsolatedCustomerReceiptIssue(context,"post-1");
    expect(v.status).toBe("found");
    if(v.status==="found")expect(v.original.receipt.journal_id).toBe(journal);
    expect(mock.rpc).toHaveBeenCalledTimes(3);
    expect(mock.rpc).toHaveBeenNthCalledWith(1,
      "lookup_aqvora_customer_receipt_issue",{
        p_organization_id:org,p_intent_key:"post-1",
      });
  });

  it("a missing durable issue never authorizes issuing with a new idempotency key",async()=>{
    mock.rpc.mockResolvedValueOnce({data:null,error:null});
    expect(await lookupIsolatedCustomerReceiptIssue(context,"post-1"))
      .toEqual({status:"not_found",safeToCreateNewIntent:false});
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects forged immutable replay payloads and mismatched actor or invoice",async()=>{
    for(const changed of [
      {intent_key:"changed"},{organization_id:"elsewhere"},
      {journal_id:"fake-journal"},
      {allocations:[{...receipt().issue_receipt.allocations[0],
        amount_minor:"99"}]},
    ]) {
      mock.rpc.mockResolvedValueOnce({
        data:{...receipt().issue_receipt,...changed},error:null,
      });
      await expect(lookupIsolatedCustomerReceiptIssue(context,"post-1"))
        .rejects.toThrow();
    }
  });

  it("propagates 42501/23514 without fake receipt success or zeroed cash",async()=>{
    for(const code of ["42501","23514","40001"]) {
      mock.rpc.mockResolvedValueOnce({
        data:null,error:Object.assign(new Error("Source unavailable"),{code}),
      });
      await expect(loadIsolatedCashCollection(context,collectionId))
        .rejects.toMatchObject({code});
    }
  });

  it("blocks entire feature when staging is off or selected session is revoked",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","");
    await expect(loadIsolatedCustomerReceipt(context,receiptId))
      .rejects.toThrow(/disabled outside isolated staging/);
    vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
    mock.session.mockResolvedValue(false);
    await expect(loadIsolatedCustomerReceipt(context,receiptId))
      .rejects.toThrow(/Matching live cloud session/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
