import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {FinanceDesignPreview} from "../src/components/accounting/FinanceDesignPreview";

vi.mock("../src/components/chat/ChatView",()=>({
  ChatView:()=> <div role="region" aria-label="Existing Cashbook surface">
    Original account Cashbook records are loaded by the existing ledger service.
  </div>,
}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe("Founder-approved ONE AQVORA workspace review",()=>{
  it("starts on the existing Cashbook, not fictitious ERP financial totals",async()=>{
    render(<FinanceDesignPreview onClose={vi.fn()} unifiedCashbook/>);
    expect(screen.getByRole("region",{name:"AQVORA unified workspace review"}))
      .toBeTruthy();
    expect(await screen.findByRole("region",{name:"Existing Cashbook surface"}))
      .toBeTruthy();
    expect(screen.getByText(/Existing Cashbook records and fast entry/)).toBeTruthy();
    expect(screen.queryByText(/Rs 23,000.00/)).toBeNull();
    expect(screen.queryByText(/Rs 17,000.00/)).toBeNull();
    expect(screen.queryByRole("dialog",{name:/sample preview/})).toBeNull();
  });
  it("visibly separates Cashbook account records from illustrative V2 reports",async()=>{
    render(<FinanceDesignPreview onClose={vi.fn()} unifiedCashbook/>);
    const nav=screen.getByRole("complementary",{name:"AQVORA unified navigation"});
    fireEvent.click(within(nav).getByRole("button",{name:"Business Overview"}));
    expect(screen.getByText("Business overview")).toBeTruthy();
    expect(screen.getAllByText(/Rs 23,000.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sample ERP company/)).toBeTruthy();
    expect(screen.queryByRole("region",{name:"Existing Cashbook surface"})).toBeNull();
    fireEvent.click(within(nav).getByRole("button",{name:/Cashbook/}));
    expect(await screen.findByRole("region",{name:"Existing Cashbook surface"}))
      .toBeTruthy();
    expect(screen.queryByText(/Rs 23,000.00/)).toBeNull();
  });
  it("offers safe return to classic Cashbook without deleting legacy modules",()=>{
    const onClose=vi.fn();
    render(<FinanceDesignPreview onClose={onClose} unifiedCashbook/>);
    fireEvent.click(screen.getByRole("button",{name:/Return to classic Cashbook/}));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
