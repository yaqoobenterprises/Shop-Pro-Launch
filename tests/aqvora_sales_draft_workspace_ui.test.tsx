import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SalesDraftsWorkspace } from "../src/components/accounting/SalesDraftsWorkspace";

const mock=vi.hoisted(()=>({
  auth:vi.fn(), enabled:vi.fn(), customers:vi.fn(),createCustomer:vi.fn(),createDraft:vi.fn(),
}));
vi.mock("../src/context/AuthContext",()=>({useAuth:mock.auth}));
vi.mock("../src/services/aqvoraSalesCustomersReadService",()=>({
  loadIsolatedSalesCustomers:mock.customers,
}));
vi.mock("../src/services/aqvoraStagingSalesDraftService",()=>({
  isIsolatedSalesDraftCreationEnabled:mock.enabled,
  createIsolatedSalesCustomer:mock.createCustomer,
  createIsolatedServiceInvoiceDraft:mock.createDraft,
}));

const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const invoice="44444444-4444-4444-8444-444444444444";
const customerRecord={organization_id:org,id:customer,
  code:"C-1",name:"Acme Ltd",is_active:true,revision:"1",created_by:actor};
const invoiceRecord={organization_id:org,id:invoice,creation_intent:"original",
  customer_id:customer,business_date:"2026-11-20",due_date:"2026-11-30",
  currency:"PKR",state:"draft",revision:"1",created_by:actor,
  face_minor:"150",lines:[]};

beforeEach(()=>{
  mock.enabled.mockReturnValue(true);
  mock.auth.mockReturnValue({
    organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
    user:{id:actor,role:"OWNER"},isCloudAccount:true,isDemoMode:false,
  });
  mock.customers.mockResolvedValue({
    customers:[customerRecord],sourceComplete:false,endReached:true,
  });
  mock.createCustomer.mockResolvedValue(customerRecord);
  mock.createDraft.mockResolvedValue(invoiceRecord);
  vi.stubGlobal("crypto",{randomUUID:()=> "intent-unique-uuid-0001"});
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});

async function setupDraftForm(){
  render(<SalesDraftsWorkspace/>);
  await waitFor(()=>expect(screen.getByRole("option",{name:/Acme Ltd/})).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Draft customer"),{target:{value:customer}});
  fireEvent.change(screen.getByLabelText("Invoice business date"),{target:{value:"2026-11-20"}});
  fireEvent.change(screen.getByLabelText("Invoice due date"),{target:{value:"2026-11-30"}});
  fireEvent.change(screen.getByLabelText("Service description"),{target:{value:"Service"}});
  fireEvent.change(screen.getByLabelText("Quantity (millionths)"),{target:{value:"1500000"}});
  fireEvent.change(screen.getByLabelText("Unit price (minor units)"),{target:{value:"101"}});
  fireEvent.change(screen.getByLabelText("Discount (minor units)"),{target:{value:"2"}});
}

describe("AQVORA staging-only customer and service-draft forms",()=>{
  it("never exposes drafting controls without the isolated staging mutation gate",()=>{
    mock.enabled.mockReturnValue(false);
    render(<SalesDraftsWorkspace/>);
    expect(screen.getByText(/draft mutations are disabled/)).toBeTruthy();
    expect(mock.customers).not.toHaveBeenCalled();
    expect(mock.createDraft).not.toHaveBeenCalled();
  });
  it("never allows demo/cashier to operate mutation screens",()=>{
    mock.auth.mockReturnValue({
      organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:actor,role:"CASHIER"},isCloudAccount:true,isDemoMode:false,
    });
    render(<SalesDraftsWorkspace/>);
    expect(screen.getByText(/draft mutations are disabled/)).toBeTruthy();
    expect(mock.customers).not.toHaveBeenCalled();
  });
  it("creates a real, narrowly scoped customer from the guarded SQL service",async()=>{
    render(<SalesDraftsWorkspace/>);
    fireEvent.change(screen.getByLabelText("Customer code"),{target:{value:"C-1"}});
    fireEvent.change(screen.getByLabelText("Customer name"),{target:{value:"Acme Ltd"}});
    fireEvent.click(screen.getByRole("button",{name:"Save customer"}));
    await waitFor(()=>expect(mock.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:org,userId:actor}),
      {code:"C-1",name:"Acme Ltd"}));
    await waitFor(()=>expect(screen.getByText(/Customer C-1 saved/)).toBeTruthy());
  });
  it("saves a service draft with stable original intent and NO posting action",async()=>{
    await setupDraftForm();
    fireEvent.click(screen.getByRole("button",{name:"Save draft only"}));
    await waitFor(()=>expect(mock.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:org,userId:actor}),
      expect.objectContaining({
        p_organization_id:org,p_intent_key:"intent-unique-uuid-0001",
        p_customer_id:customer,p_currency:"PKR",
        p_lines:[{description:"Service",quantity_millionths:"1500000",
          unit_price_minor:"101",discount_minor:"2"}],
      })));
    await waitFor(()=>expect(screen.getByText("Saved source draft")).toBeTruthy());
    expect(screen.getByText("PKR 150 minor units")).toBeTruthy();
    expect(screen.queryByRole("button",{name:/post journal/i})).toBeNull();
    expect(screen.getByRole("button",{name:"Create another draft"})).toBeTruthy();
  });
  it("keeps same intent and exact payload after uncertain response",async()=>{
    mock.createDraft.mockRejectedValueOnce(new Error("Network response lost"));
    await setupDraftForm();
    fireEvent.click(screen.getByRole("button",{name:"Save draft only"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toContain("Network response lost"));
    expect((screen.getByLabelText("Unit price (minor units)") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Retry identical invoice intent"}));
    await waitFor(()=>expect(mock.createDraft).toHaveBeenCalledTimes(2));
    expect(mock.createDraft.mock.calls[1][1]).toEqual(mock.createDraft.mock.calls[0][1]);
  });
  it("does not freeze the form or contact Supabase after invalid local money",async()=>{
    await setupDraftForm();
    fireEvent.change(screen.getByLabelText("Discount (minor units)"),{target:{value:"999"}});
    fireEvent.click(screen.getByRole("button",{name:"Save draft only"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toMatch(/Discount must be below/));
    expect(mock.createDraft).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Unit price (minor units)") as HTMLInputElement).disabled).toBe(false);
  });
  it("holds same customer payload when reply is lost and safely retries",async()=>{
    mock.createCustomer.mockRejectedValueOnce(new Error("Customer confirmation lost"));
    render(<SalesDraftsWorkspace/>);
    fireEvent.change(screen.getByLabelText("Customer code"),{target:{value:"C-1"}});
    fireEvent.change(screen.getByLabelText("Customer name"),{target:{value:"Acme Ltd"}});
    fireEvent.click(screen.getByRole("button",{name:"Save customer"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toContain("Customer confirmation lost"));
    fireEvent.click(screen.getByRole("button",{name:"Retry identical customer request"}));
    await waitFor(()=>expect(mock.createCustomer).toHaveBeenCalledTimes(2));
    expect(mock.createCustomer.mock.calls[0][1]).toEqual(mock.createCustomer.mock.calls[1][1]);
  });
});
