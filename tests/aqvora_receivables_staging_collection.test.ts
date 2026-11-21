import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectIsolatedOpenInvoices } from "../src/services/aqvoraReceivablesReadService";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(), session: vi.fn(), configured: vi.fn(), config: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({rpc: mock.rpc}),
  getSupabaseConfig: mock.config,
  hasConfiguredCloudSession: mock.session,
  isSupabaseConfigured: mock.configured,
}));

const org="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const a="44444444-4444-4444-8444-444444444444";
const b="55555555-5555-4555-8555-555555555555";
const context={
  organizationId:org,userId:user,isCloudAccount:true,
  customerId:customer,currency:"PKR",asOfDate:"2026-11-20",
};
const source=()=>({
  contract_version:"aqvora-read-v1",organization_id:org,currency:"PKR",
  from_date:"0001-01-01",to_date:"2026-11-20",
  snapshot_token:"a".repeat(64),observed_at:"2026-11-20T12:00:00Z",
  authorized_user_id:user,authorized_role:"MANAGER",
  basis:"v2_posted_journals",source_complete:true,
  legacy_included:false,opening_migration_verified:false,
  consistency:"restart_on_source_change",
  source_journal_count:"2",source_line_count:"4",
  source_debit_minor:"1000",source_credit_minor:"1000",
});
const row=(id:string)=>({
  organization_id:org,invoice_id:id,customer_id:customer,
  business_date:"2026-11-18",due_date:"2026-12-20",
  as_of_date:"2026-11-20",currency:"PKR",face_minor:"500",
  allocated_minor:"0",outstanding_minor:"500",
  all_posted_allocated_minor:"0",status:"unpaid",allocations:[],
  scope:"v2_invoice_allocations",source_complete:true,
  legacy_included:false,opening_migration_verified:false,
  fingerprint:"b".repeat(64),
});
const first=()=>({
  source:source(),rows:[row(a)],matched_count:"2",
  has_more:true,next_after_id:a,
});
const second=()=>({
  source:source(),rows:[row(b)],matched_count:"2",
  has_more:false,next_after_id:b,
});

beforeEach(()=>{
  vi.stubEnv("VITE_ENABLE_AQVORA_VERIFIED_AR_READS","true");
  vi.stubEnv("VITE_AQVORA_ISOLATED_STAGING_REVIEW","true");
  vi.stubEnv("VITE_AQVORA_STAGING_PROJECT_REF","abcdefghijklmnopqrst");
  mock.config.mockReturnValue({url:"https://abcdefghijklmnopqrst.supabase.co",anonKey:"public"});
  mock.configured.mockReturnValue(true);
  mock.session.mockResolvedValue(true);
  mock.rpc.mockImplementation(async (_method:string,args:Record<string,unknown>)=>({
    data:args.p_after_id ? second() : first(),error:null,
  }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});

describe("AQVORA all-or-nothing source-token-fenced open-invoice collection",()=>{
  it("collects 2 exact pages under one source and no invented bank verification",async()=>{
    const result=await collectIsolatedOpenInvoices(context,{pageSize:1});
    expect(result).toMatchObject({
      complete:true,matchedCount:"2",pageCount:2,
      legacyIncluded:false,bankVerified:false,
    });
    expect(result.invoices.map(x=>x.invoice_id)).toEqual([a,b]);
    expect(mock.rpc).toHaveBeenNthCalledWith(1,"list_aqvora_open_invoices",{
      p_organization_id:org,p_customer_id:customer,p_currency:"PKR",
      p_as_of_date:"2026-11-20",p_after_id:null,p_limit:1,
      p_snapshot_token:null,
    });
    expect(mock.rpc).toHaveBeenNthCalledWith(2,"list_aqvora_open_invoices",
      expect.objectContaining({p_after_id:a,p_snapshot_token:"a".repeat(64)}));
  });

  it("returns a certified zero-row V2 result only from an actual empty server page",async()=>{
    mock.rpc.mockResolvedValueOnce({data:{
      source:source(),rows:[],matched_count:"0",
      has_more:false,next_after_id:null,
    },error:null});
    const result=await collectIsolatedOpenInvoices(context);
    expect(result.invoices).toEqual([]);
    expect(result.matchedCount).toBe("0");
    expect(result.complete).toBe(true);
  });

  it("does not continue after a 40001 source-drift refusal or expose partial results",async()=>{
    mock.rpc.mockResolvedValueOnce({data:first(),error:null})
      .mockResolvedValueOnce({
        data:null,error:Object.assign(new Error("Snapshot changed"),{code:"40001"}),
      });
    await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
      .rejects.toMatchObject({code:"40001"});
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects a new snapshot token even if data appears otherwise consistent",async()=>{
    mock.rpc.mockResolvedValueOnce({data:first(),error:null})
      .mockResolvedValueOnce({data:{
        ...second(),source:{...source(),snapshot_token:"c".repeat(64)},
      },error:null});
    await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
      .rejects.toThrow(/source changed/);
  });

  it("refuses changed authorized user, role or source counts across pages",async()=>{
    for(const change of [
      {authorized_user_id:customer},{authorized_role:"OWNER"},
      {source_journal_count:"3"},{source_debit_minor:"999",source_credit_minor:"999"},
    ]) {
      mock.rpc.mockResolvedValueOnce({data:first(),error:null})
        .mockResolvedValueOnce({data:{...second(),source:{...source(),...change}},error:null});
      await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
        .rejects.toThrow(/source identity changed/);
    }
  });

  it("rejects a missing final page, wrong total count and repeated keyset cursors",async()=>{
    for(const invalid of [
      {...second(),matched_count:"3"},
      {...second(),next_after_id:a},
      {...second(),rows:[row(a)],next_after_id:a},
      {...second(),has_more:true,next_after_id:b},
    ]) {
      mock.rpc.mockResolvedValueOnce({data:first(),error:null})
        .mockResolvedValueOnce({data:invalid,error:null});
      await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
        .rejects.toThrow();
    }
  });

  it("rejects currency authority drift even if financial snapshot token is unchanged",async()=>{
    const p={
      contract_version:"aqvora-currency-policy-v1",status:"configured",
      organization_id:org,transaction_currency:"PKR",ledger_currency:"PKR",
      currency_exponent:2,minor_units_per_major:"100",display_decimal_places:2,
      revision:"1",effective_from:"2026-01-01",fingerprint:"a".repeat(64),
      provenance:{kind:"trusted_company_accounting_policy",
        authority_reference:"test",authority_revision:"1",approval_reference:"test-approved",
        approved_by:user},
      source_rounding:"quantity_millionths_half_up_per_line_v1",fx_supported:false,
    };
    const evidence={
      currency_evidence_version:"aqvora-currency-report-v1",
      currency_policy_status:"configured",display_complete:true,
      currency_policy:p,currency_policy_revisions:[p],
      currency_policy_timeline_fingerprint:"a".repeat(64),
    };
    const firstPage={...first(),rows:[{...row(a),currency_policy:p,display_complete:true}],
      source:{...source(),...evidence}};
    for(const secondSource of [
      {...source(),...evidence,
        currency_policy_timeline_fingerprint:"b".repeat(64)},
      source(),
      {...source(),...evidence,currency_policy:{...p,fingerprint:"b".repeat(64)}},
    ]){
      mock.rpc.mockReset(); // Each scenario starts with a fresh network-response sequence.
      mock.rpc.mockResolvedValueOnce({data:firstPage,error:null})
        .mockResolvedValueOnce({data:{...second(),rows:[{...row(b),currency_policy:p,display_complete:true}],source:secondSource},error:null});
      await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
        .rejects.toThrow(/currency|policy/i);
    }
    mock.rpc.mockReset();
    mock.rpc.mockResolvedValueOnce({data:first(),error:null})
      .mockResolvedValueOnce({data:{...second(),source:{...source(),...evidence}},error:null});
    await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
      .rejects.toThrow(/currency|policy/i);
  });
  it("rejects an invoice whose original policy is absent from certified AR history",async()=>{
    const p={
      contract_version:"aqvora-currency-policy-v1",status:"configured",
      organization_id:org,transaction_currency:"PKR",ledger_currency:"PKR",
      currency_exponent:2,minor_units_per_major:"100",display_decimal_places:2,
      revision:"1",effective_from:"2026-01-01",fingerprint:"a".repeat(64),
      provenance:{kind:"trusted_company_accounting_policy",
        authority_reference:"test",authority_revision:"1",approval_reference:"test-approved",
        approved_by:user},
      source_rounding:"quantity_millionths_half_up_per_line_v1",fx_supported:false,
    };
    const evidence={
      currency_evidence_version:"aqvora-currency-report-v1",
      currency_policy_status:"configured",display_complete:true,
      currency_policy:p,currency_policy_revisions:[p],
      currency_policy_timeline_fingerprint:"a".repeat(64),
    };
    const forged={...row(a),currency_policy:{...p,fingerprint:"b".repeat(64)},
      display_complete:true};
    const bad={...first(),rows:[forged],source:{...source(),...evidence}};
    mock.rpc.mockResolvedValueOnce({data:bad,error:null});
    await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
      .rejects.toThrow(/not in certified report history/);
  });
  it("never returns a truncated report when the page/row budget is exceeded",async()=>{
    await expect(collectIsolatedOpenInvoices(context,{
      pageSize:1,maxPages:1,
    })).rejects.toThrow(/pagination limit/);
    await expect(collectIsolatedOpenInvoices(context,{
      pageSize:1,maxRows:1,
    })).rejects.toThrow(/safe row bounds/);
  });

  it("rejects invalid limits or tenant/date before making an RPC request",async()=>{
    for(const changes of [{pageSize:0},{pageSize:201},{maxPages:0},{maxRows:0}]) {
      await expect(collectIsolatedOpenInvoices(context,changes))
        .rejects.toThrow(/Invalid AQVORA/);
    }
    await expect(collectIsolatedOpenInvoices({
      ...context,asOfDate:"2026-02-30",
    })).rejects.toThrow(/date/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("discards completed data if the active session is lost after the final page",async()=>{
    mock.session.mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true).mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(collectIsolatedOpenInvoices(context,{pageSize:1}))
      .rejects.toThrow(/Matching live cloud session/);
  });
});
