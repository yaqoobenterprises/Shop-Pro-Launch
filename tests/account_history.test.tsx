import React from "react";
import { describe,it,expect,vi,beforeEach } from "vitest";
import { render,screen,fireEvent,waitFor } from "@testing-library/react";
import { AccountHistory } from "../src/components/accounts/AccountHistory";
import { accountHistoryService } from "../src/services/accountHistoryService";
vi.mock("../src/services/accountHistoryService",()=>({accountHistoryService:{accounts:vi.fn(),entries:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
describe("posted account history",()=>{
  it("loads an inactive account and exact historical balances only when opened",async()=>{
    vi.mocked(accountHistoryService.accounts).mockResolvedValue([{id:"closed",name:"Old bank",is_active:false}]);
    vi.mocked(accountHistoryService.entries).mockResolvedValue({count:1,rows:[{id:"row",organization_id:"org",account_id:"closed",transaction_id:null,transfer_id:"transfer-reference",entry_type:"TRANSFER_OUT",amount_paisa:-1250,balance_after_paisa:0,business_date:"2026-10-01",created_at:"2026-10-01T10:00:00Z"}]});
    render(<AccountHistory/>);
    expect(accountHistoryService.accounts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Show history"}));
    expect(await screen.findByText("transfer-reference")).toBeTruthy();
    expect(screen.getByText("Rs -12.50")).toBeTruthy();
    expect(screen.getByText("Old bank (Inactive)")).toBeTruthy();
    expect(accountHistoryService.entries).toHaveBeenCalledWith("closed",0);
  });
  it("shows failed reads as unavailable, not an empty ledger",async()=>{
    vi.mocked(accountHistoryService.accounts).mockRejectedValue(new Error("network unavailable"));
    render(<AccountHistory/>);
    fireEvent.click(screen.getByRole("button",{name:"Show history"}));
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Posted account history is unavailable"));
    expect(screen.queryByText("No posted movements found for this account.")).toBeNull();
  });
});
