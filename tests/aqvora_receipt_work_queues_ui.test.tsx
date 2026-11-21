import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {CashReceiptWorkQueue} from "../src/components/accounting/CashReceiptWorkQueue";

const mock=vi.hoisted(()=>({
  enabled:vi.fn(),cash:vi.fn(),receipts:vi.fn(),onCash:vi.fn(),onReceipt:vi.fn(),
}));
vi.mock("../src/services/aqvoraReceiptWorkQueues",()=>({
  isIsolatedReceiptQueueEnabled:mock.enabled,
  loadIsolatedCashQueuePage:mock.cash,
  loadIsolatedReceiptQueuePage:mock.receipts,
}));
const org="11111111-1111-4111-8111-111111111111";
const cashId="22222222-2222-4222-8222-222222222222";
const receiptId="33333333-3333-4333-8333-333333333333";
const ctx={organizationId:org,userId:"44444444-4444-4444-8444-444444444444",
  isCloudAccount:true,currency:"PKR",asOfDate:"2026-11-21"};
const cash=()=>({
  organization_id:org,id:cashId,collection_number:"CC-1",state:"draft",
  business_date:"2026-11-20",amount_minor:"150",
});
const receipt=()=>({
  organization_id:org,id:receiptId,receipt_number:null,state:"submitted",
  business_date:"2026-11-20",amount_minor:"150",
});
const page=(rows:unknown[],more=false)=>({
  rows,hasPossibleMore:more,nextAfterId:rows.length?
    (rows.at(-1) as {id:string}).id:null,
  liveNotSnapshot:true,bankVerified:false,legacyIncluded:false,
});
beforeEach(()=>{
  mock.enabled.mockReturnValue(true);
  mock.cash.mockResolvedValue(page([cash()]));
  mock.receipts.mockResolvedValue(page([receipt()]));
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("AQVORA source-backed cash/receipt queue UI",()=>{
  it("does not render in regular existing-business or disabled builds",()=>{
    mock.enabled.mockReturnValue(false);
    const {container}=render(<CashReceiptWorkQueue mode="both" context={ctx}
      disabled={false} onCashSelected={mock.onCash} onReceiptSelected={mock.onReceipt}/>);
    expect(container.textContent).toBe("");
    expect(mock.cash).not.toHaveBeenCalled();
  });
  it("lists user-requested live sources and selects IDs only, never posts",async()=>{
    render(<CashReceiptWorkQueue mode="both" context={ctx}
      disabled={false} onCashSelected={mock.onCash} onReceiptSelected={mock.onReceipt}/>);
    expect(mock.cash).not.toHaveBeenCalled();
    const buttons=screen.getAllByRole("button",{name:"Load / refresh"});
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    await waitFor(()=>expect(screen.getByText(/CC-1 · draft/)).toBeTruthy());
    await waitFor(()=>expect(screen.getByText(/Unposted receipt · submitted/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"Inspect source"}));
    fireEvent.click(screen.getByRole("button",{name:"Review source"}));
    expect(mock.onCash).toHaveBeenCalledWith(cashId);
    expect(mock.onReceipt).toHaveBeenCalledWith(receiptId);
    expect(screen.getByText(/not a fixed snapshot/)).toBeTruthy();
    expect(screen.getByText(/not posted/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/post.*receipt/i})).toBeNull();
  });
  it("keeps the current page and can retry a failed next page without fabricating records",async()=>{
    mock.cash.mockResolvedValueOnce(page([cash()],true))
      .mockRejectedValueOnce(new Error("Temporary read error"))
      .mockResolvedValueOnce(page([]));
    render(<CashReceiptWorkQueue mode="cash" context={ctx}
      disabled={false} onCashSelected={mock.onCash}/>);
    fireEvent.click(screen.getByRole("button",{name:"Load / refresh"}));
    const next=await waitFor(()=>screen.getByRole("button",{name:"Next live page"}));
    fireEvent.click(next);
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toContain("Temporary read error"));
    expect(screen.getByText(/CC-1 · draft/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Next live page"}));
    await waitFor(()=>expect(screen.getByText(/No cash claims on this live page/)).toBeTruthy());
    expect(mock.cash.mock.calls[1][1]).toBe(cashId);
    expect(mock.cash.mock.calls[2][1]).toBe(cashId);
  });
  it("shows server errors without stale data and blocks navigation when recovery is locked",async()=>{
    mock.receipts.mockRejectedValueOnce(new Error("AAL2 session revoked"));
    render(<CashReceiptWorkQueue mode="receipts" context={ctx}
      disabled={false} onReceiptSelected={mock.onReceipt}/>);
    fireEvent.click(screen.getByRole("button",{name:"Load / refresh"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("AAL2 session revoked"));
    expect(screen.queryByRole("button",{name:"Review source"})).toBeNull();
    cleanup();
    render(<CashReceiptWorkQueue mode="cash" context={ctx}
      disabled={true} onCashSelected={mock.onCash}/>);
    const disabled=screen.getByRole("button",{name:"Load / refresh"}) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(mock.cash).not.toHaveBeenCalled();
  });
});
