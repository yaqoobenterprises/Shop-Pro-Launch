import React from "react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";

const h=vi.hoisted(()=>({
  allowed:vi.fn(()=>true),
  load:vi.fn(),
  createAccount:vi.fn(),
  createPeriod:vi.fn(),
  role:"OWNER" as string,
  currentOrg:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}));
const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
vi.mock("../src/context/AuthContext",()=>({
  useAuth:()=>({
    user:{id:"11111111-1111-4111-8111-111111111111",role:h.role},
    organization:{id:h.currentOrg,currency:"PKR",timezone:"Asia/Karachi"},
    isCloudAccount:true,isDemoMode:false,
  }),
}));
vi.mock("../src/services/aqvoraFreshFinanceSetupService",()=>({
  isFreshFinanceSetupStagingEnabled:h.allowed,
  loadFreshFinanceSetup:h.load,
  createFreshFinanceAccount:h.createAccount,
  createFreshFinancePeriod:h.createPeriod,
}));
import {FreshFinanceSetupWorkspace} from "../src/components/accounting/FreshFinanceSetupWorkspace";

const snapshot={
  accounts:[{id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organization_id:ORG,code:"1010",name:"Bank",
    account_class:"asset",normal_side:"debit",parent_id:null,
    is_posting:true,is_active:true}],
  periods:[],
  currency:"PKR",certifiedZeroJournals:true,
  sourceToken:"a".repeat(64),
};

beforeEach(()=>{
  vi.clearAllMocks();
  h.role="OWNER";
  h.currentOrg=ORG;
  h.allowed.mockReturnValue(true);
  h.load.mockResolvedValue(snapshot);
  h.createAccount.mockResolvedValue(snapshot.accounts[0]);
  h.createPeriod.mockResolvedValue({id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"});
});
describe("AQVORA owner-only fresh finance setup interface",()=>{
  it("renders certified zero state, actual server accounts and no financial writer button",async()=>{
    render(<FreshFinanceSetupWorkspace/>);
    expect(await screen.findByText(/Certified 0 posted journals/)).toBeTruthy();
    expect(screen.getByText("Bank")).toBeTruthy();
    expect(screen.getByText(/No fiscal periods yet/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/post.*journal/i})).toBeNull();
    expect(screen.getByText(/No opening money, journal, old Cashbook import or writer activation/))
      .toBeTruthy();
    expect(h.load).toHaveBeenCalledOnce();
  });

  it("saves real account and fiscal form through verified service then re-reads company books",async()=>{
    render(<FreshFinanceSetupWorkspace/>);
    await screen.findByText(/Certified 0 posted journals/);
    fireEvent.change(screen.getByRole("textbox",{name:"Account code"}),{
      target:{value:"1020"},
    });
    fireEvent.change(screen.getByRole("textbox",{name:"Account name"}),{
      target:{value:"Operating Bank"},
    });
    fireEvent.click(screen.getByRole("button",{name:"Create verified account"}));
    await waitFor(()=>expect(h.createAccount).toHaveBeenCalledOnce());
    expect(h.createAccount.mock.calls[0][1]).toMatchObject({
      code:"1020",name:"Operating Bank",accountClass:"asset",normalSide:"debit",
    });
    await waitFor(()=>expect(h.load).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Account created and independently re-read/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Period begins"),{
      target:{value:"2026-01-01"},
    });
    fireEvent.change(screen.getByLabelText("Period ends"),{
      target:{value:"2026-12-31"},
    });
    fireEvent.click(screen.getByRole("button",{name:"Create verified period"}));
    await waitFor(()=>expect(h.createPeriod).toHaveBeenCalledOnce());
    expect(h.createPeriod.mock.calls[0][1]).toMatchObject({
      startsOn:"2026-01-01",endsOn:"2026-12-31",
    });
    await waitFor(()=>expect(h.load).toHaveBeenCalledTimes(3));
  });

  it("locks down unknown stage and non-owner role without any API call",()=>{
    h.role="MANAGER";
    const view=render(<FreshFinanceSetupWorkspace/>);
    expect(screen.getByText(/Only an authenticated company OWNER/)).toBeTruthy();
    expect(h.load).not.toHaveBeenCalled();
    h.role="OWNER";
    h.allowed.mockReturnValue(false);
    view.rerender(<FreshFinanceSetupWorkspace/>);
    expect(screen.queryByRole("button",{name:"Create verified account"})).toBeNull();
    expect(h.load).not.toHaveBeenCalled();
  });

  it("discards old-tenant mutation results after the user changes companies",async()=>{
    let resolveOld:((value:unknown)=>void)|undefined;
    h.createAccount.mockImplementation(()=>new Promise(resolve=>{resolveOld=resolve;}));
    const view=render(<FreshFinanceSetupWorkspace/>);
    await screen.findByText(/Certified 0 posted journals/);
    fireEvent.change(screen.getByRole("textbox",{name:"Account code"}),{
      target:{value:"1020"},
    });
    fireEvent.change(screen.getByRole("textbox",{name:"Account name"}),{
      target:{value:"Operating Bank"},
    });
    fireEvent.click(screen.getByRole("button",{name:"Create verified account"}));
    await waitFor(()=>expect(h.createAccount).toHaveBeenCalledOnce());
    h.currentOrg="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    view.rerender(<FreshFinanceSetupWorkspace/>);
    await waitFor(()=>expect(h.load).toHaveBeenCalledTimes(2));
    resolveOld?.({});
    await waitFor(()=>expect(h.load).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(/Account created and independently re-read/)).toBeNull();
  });

  it("never displays a green zero after a certification failure",async()=>{
    h.load.mockRejectedValueOnce(new Error("MFA required: source cannot be certified"));
    render(<FreshFinanceSetupWorkspace/>);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent",
      expect.stringContaining("MFA required"));
    expect(screen.queryByText(/Certified 0 posted journals/)).toBeNull();
    expect(screen.getByRole("button",{name:"Refresh verified source"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Refresh verified source"}));
    expect(await screen.findByText(/Certified 0 posted journals/)).toBeTruthy();
  });
});
