import {beforeEach,describe,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({
  isolated:vi.fn(()=>true),session:vi.fn(async()=>true),
  rpc:vi.fn(),accounts:vi.fn(),
}));
vi.mock("../src/services/aqvoraVerifiedFinancialReadService",()=>({
  isIsolatedVerifiedFinancialReadEnabled:h.isolated,
}));
vi.mock("../src/lib/supabase",()=>({
  getSupabaseClient:()=>({rpc:h.rpc}),
  hasConfiguredCloudSession:h.session,
}));
vi.mock("../src/services/aqvoraPostingAccountsReadService",()=>({
  listIsolatedPostingAccounts:h.accounts,
}));
import {
  isIsolatedManualJournalEnabled,loadIsolatedManualJournalSetup,
  postIsolatedManualJournal,recoverIsolatedManualJournal,
  makeManualJournalLine,
} from "../src/services/aqvoraManualJournalService";
import {
  reserveManualJournal,readPendingManualJournal,clearPendingManualJournal,
} from "../src/accounting/pendingManualJournal";

const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="11111111-1111-4111-8111-111111111111";
const CASH="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAPITAL="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RESTRICTED="ffffffff-ffff-4fff-8fff-ffffffffffff";
const INTENT="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOURNAL="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERIOD="99999999-9999-4999-8999-999999999999";
const ctx={organizationId:ORG,userId:USER,currency:"PKR",
  isCloudAccount:true,isDemoMode:false,actorRole:"OWNER"};
const lines=[
  {account_id:CASH,debit_minor:"10000",credit_minor:"0"},
  {account_id:CAPITAL,debit_minor:"0",credit_minor:"10000"},
];
const account=(id:string,control_role:string|null=null)=>({
  id,organization_id:ORG,code:id===CASH?"1010":id===CAPITAL?"3010":"1100",
  name:"Verified account",account_class:id===CAPITAL?"equity":"asset",
  normal_side:id===CAPITAL?"credit":"debit",
  is_active:true,is_posting:true,parent_id:null,revision:"1",control_role,
});
const period={id:PERIOD,organization_id:ORG,starts_on:"2026-01-01",
  ends_on:"2026-12-31",state:"open"};
const receipt={organization_id:ORG,intent_key:INTENT,journal_id:JOURNAL,
  total_minor:"10000",posted_at:"2026-11-21T12:00:00+00:00",posted_by:USER};

beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubEnv("VITE_ENABLE_AQVORA_STAGING_MANUAL_JOURNALS","true");
  vi.stubGlobal("crypto",{randomUUID:()=>INTENT});
  sessionStorage.clear();
  h.isolated.mockReturnValue(true);h.session.mockResolvedValue(true);
  h.accounts.mockResolvedValue([account(CASH,"cash"),account(CAPITAL),
    account(RESTRICTED,"receivable")]);
  h.rpc.mockImplementation(async (name:string)=>{
    if(name==="list_aqvora_periods")return {data:[period],error:null};
    if(name==="post_aqvora_journal"||name==="lookup_aqvora_receipt"){
      return {data:receipt,error:null};
    }
    return {data:null,error:{message:"Unexpected RPC"}};
  });
});
const reserve=()=>reserveManualJournal(ORG,USER,"PKR","2026-11-20",lines);

describe("AQVORA isolated owner manual journal transport",()=>{
  it("filters source-controlled accounts and verifies company-specific periods",async()=>{
    expect(isIsolatedManualJournalEnabled()).toBe(true);
    const s=await loadIsolatedManualJournalSetup(ctx);
    expect(s.accounts.map(a=>a.id)).toEqual([CASH,CAPITAL]);
    expect(s.periods).toEqual([period]);
    expect(h.rpc.mock.calls.map(c=>c[0])).toEqual(["list_aqvora_periods"]);
    expect(h.rpc.mock.calls[0][1]).toMatchObject({p_organization_id:ORG});
  });
  it("posts the original balanced payload through the audited RPC then independently recovers it",async()=>{
    const pending=reserve();
    const result=await postIsolatedManualJournal(ctx,pending);
    expect(result).toEqual(receipt);
    expect(h.rpc.mock.calls.map(c=>c[0])).toEqual([
      "list_aqvora_periods","post_aqvora_journal","lookup_aqvora_receipt",
    ]);
    expect(h.rpc.mock.calls[1][1]).toEqual(pending.request);
    expect(h.rpc.mock.calls[2][1]).toEqual({
      organization_id:ORG,intent_key:INTENT,
    });
    expect(readPendingManualJournal(ORG,USER)).toEqual(pending);
    clearPendingManualJournal(pending);
    expect(readPendingManualJournal(ORG,USER)).toBeNull();
    expect(h.rpc.mock.calls.filter(c=>c[0]==="post_aqvora_journal")).toHaveLength(1);
  });
  it("never automatically retries after a lost ACK; only original lookup is used",async()=>{
    const pending=reserve();
    h.rpc.mockImplementation(async(name:string)=>{
      if(name==="list_aqvora_periods")return {data:[period],error:null};
      if(name==="post_aqvora_journal")throw new Error("Network timeout after commit");
      if(name==="lookup_aqvora_receipt")return {data:receipt,error:null};
      return {data:null,error:null};
    });
    await expect(postIsolatedManualJournal(ctx,pending)).rejects.toThrow(/timeout/);
    expect(readPendingManualJournal(ORG,USER)).toEqual(pending);
    const recovered=await recoverIsolatedManualJournal(ctx,pending);
    expect(recovered.journal_id).toBe(JOURNAL);
    expect(h.rpc.mock.calls.filter(c=>c[0]==="post_aqvora_journal")).toHaveLength(1);
    clearPendingManualJournal(pending);
  });
  it("refuses a missing recovery proof without deleting or changing the original key",async()=>{
    const pending=reserve();
    h.rpc.mockResolvedValue({data:null,error:null});
    await expect(recoverIsolatedManualJournal(ctx,pending)).rejects.toThrow(/intent stays locked/);
    expect(readPendingManualJournal(ORG,USER)).toEqual(pending);
    expect(h.rpc.mock.calls.map(c=>c[0])).toEqual(["lookup_aqvora_receipt"]);
  });
  it("does not accept foreign, altered, wrong-actor or incorrect sum receipts",async()=>{
    const pending=reserve();
    for(const change of [
      {organization_id:"ffffffff-ffff-4fff-8fff-ffffffffffff"},
      {posted_by:"ffffffff-ffff-4fff-8fff-ffffffffffff"},
      {intent_key:JOURNAL},{total_minor:"10001"},{journal_id:"broken"},
    ]){
      h.rpc.mockResolvedValue({data:{...receipt,...change},error:null});
      await expect(recoverIsolatedManualJournal(ctx,pending))
        .rejects.toThrow(/disagrees/);
    }
    expect(readPendingManualJournal(ORG,USER)).toEqual(pending);
  });
  it("fails closed outside staging, for manager/demo/foreign and revoked MFA session",async()=>{
    const pending=reserve();
    h.isolated.mockReturnValue(false);
    await expect(postIsolatedManualJournal(ctx,pending)).rejects.toThrow(/isolated-staging/);
    h.isolated.mockReturnValue(true);
    await expect(postIsolatedManualJournal({...ctx,actorRole:"MANAGER"},pending))
      .rejects.toThrow(/OWNER/);
    await expect(postIsolatedManualJournal({...ctx,isDemoMode:true},pending))
      .rejects.toThrow(/OWNER/);
    await expect(postIsolatedManualJournal({...ctx,organizationId:JOURNAL},pending))
      .rejects.toThrow(/company or currency/);
    h.session.mockResolvedValue(false);
    await expect(postIsolatedManualJournal(ctx,pending)).rejects.toThrow(/matching cloud session/);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("rejects closed periods, missing controls, unapproved source account and mutations",async()=>{
    const pending=reserve();
    h.rpc.mockImplementation(async(name:string)=>name==="list_aqvora_periods"
      ?{data:[{...period,state:"closed"}],error:null}:{data:receipt,error:null});
    await expect(postIsolatedManualJournal(ctx,pending)).rejects.toThrow(/open fiscal period/);
    expect(h.rpc.mock.calls.some(c=>c[0]==="post_aqvora_journal")).toBe(false);
    h.rpc.mockImplementation(async(name:string)=>name==="list_aqvora_periods"
      ?{data:[period],error:null}:{data:receipt,error:null});
    h.accounts.mockResolvedValue([account(CASH,"cash")]);
    await expect(postIsolatedManualJournal(ctx,pending)).rejects.toThrow(/unverified\/controlled/);
    expect(readPendingManualJournal(ORG,USER)).toEqual(pending);
    expect(()=>makeManualJournalLine(CASH,"debit","100.00")).toThrow(/exact positive/);
    expect(()=>makeManualJournalLine(CASH,"debit","9223372036854775808"))
      .toThrow(/exceeds bigint/);
  });
});
