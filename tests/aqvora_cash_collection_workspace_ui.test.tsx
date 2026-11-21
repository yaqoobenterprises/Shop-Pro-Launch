import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CashCollectionWorkspace } from "../src/components/accounting/CashCollectionWorkspace";

const mock=vi.hoisted(()=>({
  auth:vi.fn(),enabled:vi.fn(),customers:vi.fn(),load:vi.fn(),create:vi.fn(),
  confirm:vi.fn(),cancel:vi.fn(),
}));
vi.mock("../src/context/AuthContext",()=>({useAuth:mock.auth}));
vi.mock("../src/services/aqvoraSalesCustomersReadService",()=>({
  loadIsolatedSalesCustomers:mock.customers,
}));
vi.mock("../src/services/aqvoraCashCollectionOperations",()=>({
  isIsolatedCashCollectionEnabled:mock.enabled,
  loadCurrentIsolatedCash:mock.load,
  createIsolatedCashCollection:mock.create,
  confirmIsolatedCashCollection:mock.confirm,
  cancelIsolatedCashCollection:mock.cancel,
}));

const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const customer="44444444-4444-4444-8444-444444444444";
const cashId="55555555-5555-4555-8555-555555555555";
const key="66666666-6666-4666-8666-666666666666";
const cash=()=>({
  organization_id:org,id:cashId,creation_intent:key,collection_number:"CC-1",
  source_kind:"controlled_cash",customer_id:customer,business_date:"2026-11-20",
  currency:"PKR",amount_minor:"150",state:"draft",revision:"1",
  created_by:maker,confirmed_by:null,posted_receipt_id:null,cancel_reason:null,
});
const verified=(state:"draft"|"confirmed"|"cancelled"="draft")=>({
  collection:{...cash(),state},attestation:state==="confirmed"?"dual_control":"unconfirmed",
  bankVerified:false,linkedPostedReceiptId:null,
});
beforeEach(()=>{
  mock.enabled.mockReturnValue(true);
  mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
    user:{id:maker,role:"MANAGER"},isCloudAccount:true,isDemoMode:false});
  mock.customers.mockResolvedValue({
    customers:[{id:customer,code:"C-1",name:"Acme",is_active:true}],
    sourceComplete:false,endReached:true,
  });
  mock.create.mockResolvedValue(verified());
  mock.load.mockResolvedValue(verified());
  mock.confirm.mockResolvedValue(verified("confirmed"));
  mock.cancel.mockResolvedValue(verified("cancelled"));
  vi.stubGlobal("crypto",{randomUUID:()=>key});
  sessionStorage.clear();
});
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();vi.clearAllMocks();});

async function loadCreateForm(){
  render(<CashCollectionWorkspace/>);
  await waitFor(()=>expect(screen.getByRole("option",{name:/C-1 · Acme/})).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Cash customer"),{target:{value:customer}});
  fireEvent.change(screen.getByLabelText("Cash business date"),{target:{value:"2026-11-20"}});
  fireEvent.change(screen.getByLabelText("Cash amount in minor units"),{target:{value:"150"}});
}

describe("AQVORA real controlled-cash workflow UI",()=>{
  it("is disabled by default and hidden for cashier/demo",()=>{
    mock.enabled.mockReturnValue(false);
    render(<CashCollectionWorkspace/>);
    expect(screen.getByText(/Staging-only cash operations are disabled/)).toBeTruthy();
    expect(mock.customers).not.toHaveBeenCalled();
  });
  it("records a genuine unconfirmed claim without saying customer invoice paid",async()=>{
    await loadCreateForm();
    fireEvent.click(screen.getByRole("button",{name:"Save unconfirmed cash claim"}));
    await waitFor(()=>expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:org,userId:maker}),
      expect.objectContaining({
        p_intent_key:key,p_customer_id:customer,p_amount_minor:"150",
        p_source_kind:"controlled_cash",
      })));
    expect(screen.getByText(/Cash collection CC-1/)).toBeTruthy();
    expect(screen.getAllByText(/Bank verification is NOT available/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button",{name:"Confirm manual cash count"})).toBeNull();
    expect(screen.queryByRole("button",{name:/Post receipt/})).toBeNull();
  });
  it("keeps exactly the original payload after lost ACK instead of new cash intent",async()=>{
    mock.create.mockRejectedValueOnce(new Error("Lost network response"));
    await loadCreateForm();
    fireEvent.click(screen.getByRole("button",{name:"Save unconfirmed cash claim"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toContain("Lost network response"));
    expect((screen.getByLabelText("Cash amount in minor units") as HTMLInputElement).disabled).toBe(true);
    expect(sessionStorage.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button",{name:"Retry original cash claim"}));
    await waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));
    expect(mock.create.mock.calls[0][1]).toEqual(mock.create.mock.calls[1][1]);
  });
  it("allows a distinct OWNER to inspect and manually confirm exact cash count",async()=>{
    mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:checker,role:"OWNER"},isCloudAccount:true,isDemoMode:false});
    render(<CashCollectionWorkspace/>);
    fireEvent.change(screen.getByLabelText("Cash collection UUID"),{target:{value:cashId}});
    fireEvent.click(screen.getByRole("button",{name:"Inspect server source"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Confirm manual cash count"})).toBeTruthy());
    expect((screen.getByRole("button",{name:"Confirm manual cash count"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Personally counted amount"),{target:{value:"150"}});
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"Confirm manual cash count"}));
    await waitFor(()=>expect(mock.confirm).toHaveBeenCalledWith(
      expect.objectContaining({userId:checker}),
      expect.objectContaining({id:cashId}),
      expect.objectContaining({p_counted_minor:"150",p_attestation:"cash_counted_in_person"}),"OWNER"));
    expect(screen.getByText(/No accounting receipt posted/)).toBeTruthy();
  });
  it("cancels draft only with a reason and no deletion",async()=>{
    render(<CashCollectionWorkspace/>);
    fireEvent.change(screen.getByLabelText("Cash collection UUID"),{target:{value:cashId}});
    fireEvent.click(screen.getByRole("button",{name:"Inspect server source"}));
    await waitFor(()=>expect(screen.getByLabelText("Cash cancellation reason")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Cash cancellation reason"),
      {target:{value:"Entered in error"}});
    fireEvent.click(screen.getByRole("button",{name:"Cancel unconfirmed cash claim"}));
    await waitFor(()=>expect(mock.cancel).toHaveBeenCalledWith(
      expect.objectContaining({userId:maker}),expect.objectContaining({id:cashId}),
      "Entered in error","MANAGER"));
  });
  it("stale source or server rejection clears cached claim and never displays fake confirmation",async()=>{
    mock.load.mockRejectedValueOnce(Object.assign(new Error("Permission denied"),{code:"42501"}));
    render(<CashCollectionWorkspace/>);
    fireEvent.change(screen.getByLabelText("Cash collection UUID"),{target:{value:cashId}});
    fireEvent.click(screen.getByRole("button",{name:"Inspect server source"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Permission denied"));
    expect(screen.queryByText(/Cash collection CC-1/)).toBeNull();
    expect(mock.confirm).not.toHaveBeenCalled();
  });
  it("rejects invalid local money without reserving a claim intent",async()=>{
    await loadCreateForm();
    fireEvent.change(screen.getByLabelText("Cash amount in minor units"),
      {target:{value:"9223372036854775808"}});
    fireEvent.click(screen.getByRole("button",{name:"Save unconfirmed cash claim"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toContain("positive exact minor-unit amount"));
    expect(mock.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
});
