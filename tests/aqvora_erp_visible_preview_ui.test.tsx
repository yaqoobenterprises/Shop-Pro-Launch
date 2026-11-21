import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {FinanceDesignPreview} from "../src/components/accounting/FinanceDesignPreview";

afterEach(()=>{cleanup();vi.clearAllMocks();});
const pick=(name:string)=>{
  const button=screen.getAllByRole("button",{name})[0];
  expect(button).toBeTruthy();
  fireEvent.click(button);
};
describe("AQVORA visible ERP demo",()=>{
  it("starts on a new unified ERP overview instead of the legacy Cashbook",()=>{
    render(<FinanceDesignPreview onClose={vi.fn()}/>);
    expect(screen.getByRole("dialog",{
      name:"AQVORA interactive ERP sample preview",
    })).toBeTruthy();
    expect(screen.getByText("Business overview")).toBeTruthy();
    expect(screen.getByText(/Rs 23,000.00/)).toBeTruthy();
    expect(screen.getByText(/Rs 17,000.00/)).toBeTruthy();
    expect(screen.getByText(/Sample company/)).toBeTruthy();
  });
  it("navigates real chart/journal/GL/TB sample React screens",()=>{
    render(<FinanceDesignPreview onClose={vi.fn()}/>);
    pick("Chart of Accounts");
    expect(screen.getByRole("heading",{name:"Chart of Accounts"})).toBeTruthy();
    pick("Journal Entry");
    expect(screen.getByRole("button",{name:/Post journal/i})).toHaveProperty("disabled",true);
    pick("General Ledger");
    expect(screen.getByText(/Cash in hand/)).toBeTruthy();
    pick("Trial Balance");
    expect(screen.getByText(/Arithmetic reconciliation/)).toBeTruthy();
  });
  it("navigates invoice, receipt, AR, and planned pages without real writes",()=>{
    render(<FinanceDesignPreview onClose={vi.fn()}/>);
    pick("Sales Invoices");
    expect(screen.getByText("INV-S001")).toBeTruthy();
    pick("Customer Receipts");
    expect(screen.getByText("RC-S001")).toBeTruthy();
    expect(screen.getByText(/Bank verified: NO/)).toBeTruthy();
    pick("Accounts Receivable");
    expect(screen.getByText(/Rs 17,000.00/)).toBeTruthy();
    pick("Purchases & Payables");
    expect(screen.getByText(/Not included in this tested ERP workflow/)).toBeTruthy();
  });
  it("has a clear safe way back to legacy UI",()=>{
    const onClose=vi.fn();
    render(<FinanceDesignPreview onClose={onClose}/>);
    fireEvent.click(screen.getByRole("button",{name:/Exit to legacy Cashbook/}));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
