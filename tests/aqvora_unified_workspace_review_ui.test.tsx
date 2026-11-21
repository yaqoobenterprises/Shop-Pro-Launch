import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {FinanceDesignPreview} from "../src/components/accounting/FinanceDesignPreview";

vi.mock("../src/components/chat/ChatView",()=>({
  ChatView:()=> <div role="region" aria-label="Existing Cashbook surface">
    Original account Cashbook records are loaded by the existing ledger service.
  </div>,
}));
vi.mock("../src/components/dashboard/LedgerDashboardView",()=>({
  LedgerDashboardView:()=> <div role="region" aria-label="Recorded Overview">
    Cashbook activity from the existing ledger service, not V2 posted books.
  </div>,
}));
vi.mock("../src/components/reports/LedgerReportsView",()=>({
  LedgerReportsView:()=> <div role="region" aria-label="Recorded Reports">
    Source-backed Cashbook report from existing transactions.
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
    expect(screen.getByText(/Existing Cashbook records and reports/)).toBeTruthy();
    expect(screen.queryByText(/Rs 23,000.00/)).toBeNull();
    expect(screen.queryByText(/Rs 17,000.00/)).toBeNull();
    expect(screen.queryByRole("dialog",{name:/sample preview/})).toBeNull();
  });
  it("opens source-backed Overview and Reports, never a fake ERP balance",async()=>{
    render(<FinanceDesignPreview onClose={vi.fn()} unifiedCashbook/>);
    const nav=screen.getByRole("complementary",{name:"AQVORA unified navigation"});
    fireEvent.click(within(nav).getByRole("button",{name:"Business Overview"}));
    expect(await screen.findByRole("region",{name:"Recorded Overview"})).toBeTruthy();
    expect(screen.queryByText(/Rs 23,000.00/)).toBeNull();
    expect(screen.getByText(/not certified V2 journals or accrual P&L/)).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button",{name:"Cashbook Reports"}));
    expect(await screen.findByRole("region",{name:"Recorded Reports"})).toBeTruthy();
    expect(screen.queryByText(/Rs 17,000.00/)).toBeNull();
    fireEvent.click(within(nav).getByRole("button",{name:/Cashbook/}));
    expect(await screen.findByRole("region",{name:"Existing Cashbook surface"}))
      .toBeTruthy();
  });
  it("keeps synthetic ERP Chart of Accounts separate from the recorded Cashbook",async()=>{
    render(<FinanceDesignPreview onClose={vi.fn()} unifiedCashbook/>);
    const nav=screen.getByRole("complementary",{name:"AQVORA unified navigation"});
    fireEvent.click(within(nav).getByRole("button",{name:"Chart of Accounts"}));
    expect(screen.getByRole("heading",{name:"Chart of Accounts"})).toBeTruthy();
    expect(screen.getByText(/Sample ERP company/)).toBeTruthy();
    expect(screen.queryByRole("region",{name:"Existing Cashbook surface"})).toBeNull();
  });
  it("offers safe return to classic Cashbook without deleting legacy modules",()=>{
    const onClose=vi.fn();
    render(<FinanceDesignPreview onClose={onClose} unifiedCashbook/>);
    fireEvent.click(screen.getByRole("button",{name:/Return to classic Cashbook/}));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
