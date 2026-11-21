import React from "react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";

const h=vi.hoisted(()=>({
  allowed:vi.fn(()=>true),
  load:vi.fn(),post:vi.fn(),recover:vi.fn(),
  read:vi.fn(),reserve:vi.fn(),clear:vi.fn(),
  role:"OWNER" as string,
  org:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}));
const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="11111111-1111-4111-8111-111111111111";
const CASH="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAPITAL="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INTENT="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const JOURNAL="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mockReceipt={organization_id:ORG,intent_key:INTENT,journal_id:JOURNAL,
  total_minor:"10000",posted_by:USER,posted_at:"2026-11-21T13:00:00Z"};
const mockPending={organizationId:ORG,userId:USER,currency:"PKR",
  request:{organization_id:ORG,intent_key:INTENT,business_date:"2026-11-20",
    lines:[
      {account_id:CASH,debit_minor:"10000",credit_minor:"0"},
      {account_id:CAPITAL,debit_minor:"0",credit_minor:"10000"},
    ]},
};
vi.mock("../src/context/AuthContext",()=>({
  useAuth:()=>({
    organization:{id:h.org,currency:"PKR"},user:{id:USER,role:h.role},
    isCloudAccount:true,isDemoMode:false,
  }),
}));
vi.mock("../src/services/aqvoraManualJournalService",()=>({
  isIsolatedManualJournalEnabled:h.allowed,
  loadIsolatedManualJournalSetup:h.load,
  postIsolatedManualJournal:h.post,
  recoverIsolatedManualJournal:h.recover,
  makeManualJournalLine:(account:string,side:"debit"|"credit",amount:string)=>{
    if(!account||!/^[1-9][0-9]*$/.test(amount))throw new Error("Exact amount required.");
    return {account_id:account,
      debit_minor:side==="debit"?amount:"0",
      credit_minor:side==="credit"?amount:"0"};
  },
}));
vi.mock("../src/accounting/pendingManualJournal",()=>({
  readPendingManualJournal:h.read,reserveManualJournal:h.reserve,clearPendingManualJournal:h.clear,
  validateManualJournalLines:(lines:Array<{debit_minor:string;credit_minor:string}>)=>{
    if(lines.length<2)throw new Error("More lines needed.");
    const dr=lines.reduce((x,l)=>x+BigInt(l.debit_minor),0n);
    const cr=lines.reduce((x,l)=>x+BigInt(l.credit_minor),0n);
    if(dr===0n||dr!==cr)throw new Error("Unbalanced exact lines.");
    return dr.toString();
  },
}));
import {AuthorizedJournalWorkspace} from "../src/components/accounting/AuthorizedJournalWorkspace";

beforeEach(()=>{
  vi.clearAllMocks();
  h.org=ORG;h.role="OWNER";h.allowed.mockReturnValue(true);
  h.load.mockResolvedValue({accounts:[
    {id:CASH,code:"1010",name:"Cash"},
    {id:CAPITAL,code:"3010",name:"Capital"},
  ],periods:[]});
  h.read.mockReturnValue(null);
  h.reserve.mockReturnValue(mockPending);
  h.post.mockResolvedValue(mockReceipt);
  h.recover.mockResolvedValue(mockReceipt);
});
async function fillBalanced(){
  await screen.findByRole("button",{name:"Post verified journal"});
  await waitFor(()=>expect(h.load).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Business date"),{
    target:{value:"2026-11-20"},
  });
  fireEvent.change(screen.getByLabelText("Line 1 account"),{target:{value:CASH}});
  fireEvent.change(screen.getByLabelText("Line 2 account"),{target:{value:CAPITAL}});
  fireEvent.change(screen.getByLabelText("Line 1 exact minor units"),{
    target:{value:"10000"},
  });
  fireEvent.change(screen.getByLabelText("Line 2 exact minor units"),{
    target:{value:"10000"},
  });
  expect(screen.getByText("Balanced")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("AQVORA manual journal staging UI",()=>{
  it("does not expose financial buttons outside owner-only isolated staging",()=>{
    h.role="MANAGER";
    const view=render(<AuthorizedJournalWorkspace/>);
    expect(screen.getByText(/Disabled outside an approved isolated-staging/)).toBeTruthy();
    expect(h.load).not.toHaveBeenCalled();
    h.role="OWNER";h.allowed.mockReturnValue(false);
    view.rerender(<AuthorizedJournalWorkspace/>);
    expect(screen.queryByRole("button",{name:"Post verified journal"})).toBeNull();
  });
  it("shows company-scoped active chart, balanced amounts and server receipt after confirmation",async()=>{
    render(<AuthorizedJournalWorkspace/>);
    await waitFor(()=>expect(h.load).toHaveBeenCalledOnce());
    await fillBalanced();
    expect(screen.getByRole("button",{name:"Post verified journal"})).toHaveProperty(
      "disabled",false);
    fireEvent.click(screen.getByRole("button",{name:"Post verified journal"}));
    await waitFor(()=>expect(h.post).toHaveBeenCalledOnce());
    expect(h.reserve.mock.calls[0]).toMatchObject([
      ORG,USER,"PKR","2026-11-20",
    ]);
    await waitFor(()=>expect(h.clear).toHaveBeenCalledWith(mockPending));
    expect(await screen.findByText(/Server-verified journal posted/)).toBeTruthy();
    expect(screen.getByText(/Journal:/)).toBeTruthy();
    expect(screen.getByText(/not proof of bank settlement/)).toBeTruthy();
    expect(h.post.mock.calls[0][1]).toEqual(mockPending);
  });
  it("blocks new posting after a lost acknowledgement and only recovers old intent",async()=>{
    h.post.mockRejectedValue(new Error("Network response lost"));
    render(<AuthorizedJournalWorkspace/>);
    await fillBalanced();
    fireEvent.click(screen.getByRole("button",{name:"Post verified journal"}));
    expect(await screen.findByText(/Original intent locked/)).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveProperty("textContent",
      expect.stringContaining("Original intent retained"));
    expect(screen.getByRole("button",{name:"Post verified journal"})).toHaveProperty(
      "disabled",true);
    expect(h.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Recover original receipt"}));
    await waitFor(()=>expect(h.recover).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:ORG}),mockPending));
    await waitFor(()=>expect(h.clear).toHaveBeenCalledWith(mockPending));
    expect(await screen.findByText(/Original receipt recovered/)).toBeTruthy();
    expect(h.post).toHaveBeenCalledTimes(1);
  });
  it("does not show a false success when the immutable recovery is missing",async()=>{
    h.read.mockReturnValue(mockPending);
    h.recover.mockRejectedValue(new Error("Original journal not found"));
    render(<AuthorizedJournalWorkspace/>);
    expect(await screen.findByText(/Original intent locked/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Recover original receipt"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent",
      expect.stringContaining("Original journal not found"));
    expect(h.clear).not.toHaveBeenCalled();
    expect(screen.queryByText(/Server-verified journal posted/)).toBeNull();
  });
  it("fails closed on corrupt original intent instead of resetting it",async()=>{
    h.read.mockImplementation(()=>{throw new Error("Recovery corrupt");});
    render(<AuthorizedJournalWorkspace/>);
    expect(await screen.findByText(/Recovery corrupt/)).toBeTruthy();
    expect(screen.getByText(/Corrupt recovery data blocks/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Post verified journal"})).toHaveProperty(
      "disabled",true);
    expect(h.post).not.toHaveBeenCalled();
  });
});
