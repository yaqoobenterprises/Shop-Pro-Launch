import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {
  isIsolatedReceiptQueueEnabled,loadIsolatedCashQueuePage,
  loadIsolatedReceiptQueuePage,
} from "../src/services/aqvoraReceiptWorkQueues";

const mock=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),config:vi.fn(),configured:vi.fn()}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:mock.rpc}),
  getSupabaseConfig:mock.config,
  hasConfiguredCloudSession:mock.session,
  isSupabaseConfigured:mock.configured,
}));
const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const cashId="44444444-4444-4444-8444-444444444444";
const cashNext="55555555-5555-4555-8555-555555555555";
const receiptId="66666666-6666-4666-8666-666666666666";
const invoice="77777777-7777-4777-8777-777777777777";
const hash="a".repeat(64);
const ctx={organizationId:org,userId:actor,isCloudAccount:true,
  currency:"PKR",asOfDate:"2026-11-21"};
const cash=()=>({
  organization_id:org,id:cashId,creation_intent:"original-cash-1",
  collection_number:"CC-1",source_kind:"controlled_cash",
  customer_id:customer,business_date:"2026-11-20",currency:"PKR",
  amount_minor:"150",state:"draft",revision:"1",
  created_by:actor,confirmed_by:null,
  maker_session_fingerprint:hash,checker_session_fingerprint:null,
  customer_snapshot:null,policy_snapshot:null,fingerprint:null,
  created_at:"2026-11-20T10:00:00Z",confirmed_at:null,cancel_reason:null,
  evidence_method:"unconfirmed_claim",posted_receipt_id:null,
});
const receipt=()=>({
  organization_id:org,id:receiptId,creation_intent:"original-receipt-1",
  collection_id:cashId,collection_fingerprint:hash,customer_id:customer,
  business_date:"2026-11-20",currency:"PKR",amount_minor:"150",
  allocations:[{invoice_id:invoice,amount_minor:"150",
    invoice_revision:"4",invoice_fingerprint:hash}],
  state:"submitted",revision:"2",created_by:actor,approved_by:null,
  policy_snapshot:null,fingerprint:hash,journal_id:null,
  receipt_number:null,cancel_reason:null,
});
beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_CASH_OPERATIONS","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS","true");
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_INBOX","true");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockImplementation(async (method:string)=>({
    data:method==="list_aqvora_cash_collections"?[cash()]:[receipt()],
    error:null,
  }));
});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
describe("AQVORA isolated live operational work queues",()=>{
  it("is independent, default OFF and makes no RPC unless explicitly enabled",async()=>{
    vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_RECEIPT_INBOX","");
    expect(isIsolatedReceiptQueueEnabled()).toBe(false);
    await expect(loadIsolatedCashQueuePage(ctx)).rejects.toThrow(/disabled/);
    await expect(loadIsolatedReceiptQueuePage(ctx)).rejects.toThrow(/disabled/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("calls server-owned company cash list, validates current evidence, never bank balances",async()=>{
    const page=await loadIsolatedCashQueuePage(ctx);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].id).toBe(cashId);
    expect(page.rows[0].state).toBe("draft");
    expect(page.liveNotSnapshot).toBe(true);
    expect(page.bankVerified).toBe(false);
    expect(page.legacyIncluded).toBe(false);
    expect(page.hasPossibleMore).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith("list_aqvora_cash_collections",{
      p_organization_id:org,p_after_id:null,p_limit:20,
    });
  });
  it("loads receipt list as submitted, not posted, and never says paid",async()=>{
    const page=await loadIsolatedReceiptQueuePage(ctx);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].state).toBe("submitted");
    expect(page.rows[0].journal_id).toBeNull();
    expect(page.bankVerified).toBe(false);
    expect(mock.rpc).toHaveBeenCalledWith("list_aqvora_customer_receipts",{
      p_organization_id:org,p_after_id:null,p_limit:20,
    });
  });
  it("paginates ordered UUIDs without declaring an equal-size page complete",async()=>{
    mock.rpc.mockResolvedValueOnce({data:[cash()],error:null});
    const first=await loadIsolatedCashQueuePage(ctx,null,1);
    expect(first.hasPossibleMore).toBe(true);
    expect(first.nextAfterId).toBe(cashId);
    mock.rpc.mockResolvedValueOnce({data:[{
      ...cash(),id:cashNext,collection_number:"CC-2",
    }],error:null});
    const next=await loadIsolatedCashQueuePage(ctx,first.nextAfterId,1);
    expect(next.rows[0].id).toBe(cashNext);
    expect(mock.rpc).toHaveBeenLastCalledWith("list_aqvora_cash_collections",{
      p_organization_id:org,p_after_id:cashId,p_limit:1,
    });
  });
  it("rejects unordered, repeated, stale-cursor, oversized and foreign pages",async()=>{
    for(const rows of [
      [cash(),cash()],
      [cash(),{...cash(),id:cashNext,organization_id:customer}],
      [cash(),{...cash(),id:cashNext,amount_minor:"150.00"}],
      [{...cash(),id:cashNext,collection_number:"CC-2"},cash()],
      [{...cash(),business_date:"2026-11-22"}],
    ]){
      mock.rpc.mockResolvedValueOnce({data:rows,error:null});
      await expect(loadIsolatedCashQueuePage(ctx,null,10)).rejects.toThrow();
    }
    mock.rpc.mockResolvedValueOnce({data:[cash()],error:null});
    await expect(loadIsolatedCashQueuePage(ctx,cashId,20))
      .rejects.toThrow(/cursor/);
  });
  it("refuses forged receipt journal status and mismatched tenant/money",async()=>{
    for(const changed of [
      {organization_id:customer},{amount_minor:"149"},
      {journal_id:cashId},{state:"posted"},
    ]){
      mock.rpc.mockResolvedValueOnce({data:[{...receipt(),...changed}],error:null});
      await expect(loadIsolatedReceiptQueuePage(ctx)).rejects.toThrow();
    }
  });
  it("rejects malformed API pages, invalid page sizes, errors and revoked sessions",async()=>{
    for(const rows of [null,{},[cash(),cash()], [null]]){
      mock.rpc.mockResolvedValueOnce({data:rows,error:null});
      await expect(loadIsolatedCashQueuePage(ctx,null,1)).rejects.toThrow();
    }
    for(const n of [0,-1,101,1.5]){
      await expect(loadIsolatedCashQueuePage(ctx,null,n)).rejects.toThrow(/1–100/);
    }
    const denial=Object.assign(new Error("Denied"),{code:"42501"});
    mock.rpc.mockResolvedValueOnce({data:null,error:denial});
    await expect(loadIsolatedReceiptQueuePage(ctx)).rejects.toMatchObject({code:"42501"});
    mock.session.mockResolvedValue(false);
    await expect(loadIsolatedCashQueuePage(ctx)).rejects.toThrow(/Matching live cloud session/);
  });
});
