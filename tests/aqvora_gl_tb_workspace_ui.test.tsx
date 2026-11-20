import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {GeneralLedgerTrialBalanceWorkspace} from "../src/components/accounting/GeneralLedgerTrialBalanceWorkspace";

const mock=vi.hoisted(()=>({
  auth:vi.fn(),enabled:vi.fn(),accounts:vi.fn(),tb:vi.fn(),gl:vi.fn(),
}));
vi.mock("../src/context/AuthContext",()=>({useAuth:mock.auth}));
vi.mock("../src/services/aqvoraVerifiedFinancialReadService",()=>({
  isIsolatedVerifiedFinancialReadEnabled:mock.enabled,
  loadIsolatedVerifiedTrialBalance:mock.tb,
  loadIsolatedVerifiedGeneralLedger:mock.gl,
}));
vi.mock("../src/services/aqvoraPostingAccountsReadService",()=>({
  listIsolatedPostingAccounts:mock.accounts,
}));

const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const accountId="33333333-3333-4333-8333-333333333333";
const account={organization_id:org,id:accountId,code:"1000",name:"Cash",
  account_class:"asset",normal_side:"debit",parent_id:null,is_posting:true,
  is_active:true,control_role:null,revision:"1"};
const source={snapshot_token:"a".repeat(64),authorized_user_id:actor,
  basis:"v2_posted_journals",legacy_included:false,opening_migration_verified:false};
const trial=()=>({
  source,matchedCount:"1",pageCount:1,
  totals:{opening_debit_minor:"0",opening_credit_minor:"0",
    debit_minor:"100",credit_minor:"100",closing_debit_minor:"100",
    closing_credit_minor:"100"},
  rows:[{account,ordinal:"1",opening_minor:"0",debit_minor:"100",
    credit_minor:"0",closing_minor:"100",closing_debit_minor:"100",
    closing_credit_minor:"0"}],
});
const ledger=()=>({
  source,matchedCount:"1",pageCount:1,account,
  openingMinor:"0",debitMinor:"100",creditMinor:"0",closingMinor:"100",
  rows:[{journal_id:"journal-1",line_no:1,business_date:"2026-11-20",
    source_kind:"sales_invoice",source_id:"invoice-1",
    debit_minor:"100",credit_minor:"0",running_balance_minor:"100"}],
});

beforeEach(()=>{
  mock.enabled.mockReturnValue(true);
  mock.auth.mockReturnValue({
    organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
    user:{id:actor,role:"OWNER"},isCloudAccount:true,isDemoMode:false,
  });
  mock.accounts.mockResolvedValue([account]);
  mock.tb.mockResolvedValue(trial());
  mock.gl.mockResolvedValue(ledger());
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe("AQVORA verified General Ledger / Trial Balance functional route",()=>{
  it("is unavailable to demo/cashier or when isolated staging is disabled",()=>{
    mock.enabled.mockReturnValue(false);
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    expect(screen.getByText(/Disabled outside an explicitly approved isolated staging/)).toBeTruthy();
    expect(mock.accounts).not.toHaveBeenCalled();
  });
  it("renders actual certified V2 Trial Balance on user's request",async()=>{
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    await waitFor(()=>expect(mock.accounts).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("From"),{target:{value:"2026-11-01"}});
    fireEvent.change(screen.getByLabelText("To"),{target:{value:"2026-11-20"}});
    fireEvent.click(screen.getByRole("button",{name:"Load certified report"}));
    await waitFor(()=>expect(screen.getByRole("region",{name:"Verified trial balance"})).toBeTruthy());
    expect(screen.getByText("Certified totals")).toBeTruthy();
    expect(screen.getAllByText("PKR 100 minor units").length).toBeGreaterThan(0);
    expect(screen.getByText(/Legacy balances and verified opening migration are excluded/)).toBeTruthy();
    expect(mock.tb).toHaveBeenCalledWith(expect.objectContaining({
      organizationId:org,userId:actor,currency:"PKR",
      fromDate:"2026-11-01",toDate:"2026-11-20",
    }),expect.objectContaining({pageSize:100}));
  });
  it("selects only an authorized posting account and renders GL provenance",async()=>{
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    await waitFor(()=>expect(screen.getByRole("option",{name:/1000 · Cash/})).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"General Ledger"}));
    fireEvent.change(screen.getByLabelText("Posting account"),{target:{value:accountId}});
    fireEvent.change(screen.getByLabelText("From"),{target:{value:"2026-11-01"}});
    fireEvent.change(screen.getByLabelText("To"),{target:{value:"2026-11-20"}});
    fireEvent.click(screen.getByRole("button",{name:"Load certified report"}));
    await waitFor(()=>expect(screen.getByRole("region",{name:"Verified general ledger"})).toBeTruthy());
    expect(screen.getByText("sales_invoice")).toBeTruthy();
    expect(mock.gl).toHaveBeenCalledWith(expect.objectContaining({
      accountId,organizationId:org,userId:actor,
    }),expect.any(Object));
  });
  it("refuses a denied or inconsistent report instead of showing zero",async()=>{
    mock.tb.mockRejectedValue(Object.assign(new Error("Source changed"),{code:"40001"}));
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    fireEvent.click(screen.getByRole("button",{name:"Load certified report"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Source changed"));
    expect(screen.queryByText("Certified totals")).toBeNull();
  });
  it("invalidates displayed data immediately when report mode is switched",async()=>{
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    fireEvent.click(screen.getByRole("button",{name:"Load certified report"}));
    await waitFor(()=>expect(screen.getByText("Certified totals")).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"General Ledger"}));
    expect(screen.queryByText("Certified totals")).toBeNull();
  });
  it("does not run SQL without an account when a GL report was requested",async()=>{
    mock.accounts.mockResolvedValue([]);
    render(<GeneralLedgerTrialBalanceWorkspace/>);
    fireEvent.click(screen.getByRole("button",{name:"General Ledger"}));
    expect((screen.getByRole("button",{name:"Load certified report"}) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.gl).not.toHaveBeenCalled();
  });
});
