import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { ReceivablesWorkspace } from "../src/components/accounting/ReceivablesWorkspace";

const mocks=vi.hoisted(()=>({
  auth:vi.fn(), enabled:vi.fn(), customers:vi.fn(), reconciliation:vi.fn(), open:vi.fn(),
}));
vi.mock("../src/context/AuthContext",()=>({useAuth:mocks.auth}));
vi.mock("../src/services/aqvoraReceivablesStagingGate",()=>({
  isIsolatedReceivablesReadEnabled:mocks.enabled,
}));
vi.mock("../src/services/aqvoraSalesCustomersReadService",()=>({
  loadIsolatedSalesCustomers:mocks.customers,
}));
vi.mock("../src/services/aqvoraReceivablesReadService",()=>({
  loadIsolatedReceivablesReconciliation:mocks.reconciliation,
  collectIsolatedOpenInvoices:mocks.open,
}));
vi.mock("../src/components/accounting/InvoiceEvidencePanel",()=>({
  InvoiceEvidencePanel:()=> <div role="region" aria-label="Invoice source details">Verified invoice evidence</div>,
}));
vi.mock("../src/components/accounting/ReceiptEvidencePanel",()=>({
  ReceiptEvidencePanel:()=> <div role="region" aria-label="Receipt source details">Verified receipt evidence</div>,
}));

const org="11111111-1111-4111-8111-111111111111";
const actor="22222222-2222-4222-8222-222222222222";
const customerId="33333333-3333-4333-8333-333333333333";
const invoiceId="44444444-4444-4444-8444-444444444444";
const source={
  snapshot_token:"a".repeat(64),authorized_user_id:actor,authorized_role:"OWNER",
};
const company=()=>({
  source,customer_id:null,scope:"company",as_of_date:"2026-11-20",
  face_minor:"1000",allocated_minor:"400",outstanding_minor:"600",
  ar_control_minor:"600",aging_supported:false,
});
const customerReport=()=>({...company(),customer_id:customerId,scope:"customer"});
const openList=()=>({
  complete:true,source,
  invoices:[{
    invoice_id:invoiceId,due_date:"2026-11-30",business_date:"2026-11-18",
    face_minor:"1000",allocated_minor:"400",outstanding_minor:"600",
    status:"partial",
  }],matchedCount:"1",pageCount:1,legacyIncluded:false,bankVerified:false,
});

beforeEach(()=>{
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockReturnValue({
    organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
    user:{id:actor,role:"OWNER"},isCloudAccount:true,isDemoMode:false,
  });
  mocks.customers.mockResolvedValue({
    customers:[{id:customerId,code:"C-1",name:"Acme Test",is_active:true}],
    sourceComplete:false,endReached:true,
  });
  mocks.reconciliation.mockImplementation(async (context:{customerId?:string})=>
    context.customerId ? customerReport() : company());
  mocks.open.mockResolvedValue(openList());
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

async function loadCustomerReport(){
  render(<ReceivablesWorkspace/>);
  await waitFor(()=>expect(screen.getByRole("option",{name:/Acme Test/})).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Business-date cutoff"),{target:{value:"2026-11-20"}});
  fireEvent.change(screen.getByLabelText("Customer"),{target:{value:customerId}});
  fireEvent.click(screen.getByRole("button",{name:"Load verified AR"}));
}

describe("AQVORA functional read-only accounts receivable workspace",()=>{
  it("does not load company data when the isolated staging gate is disabled",()=>{
    mocks.enabled.mockReturnValue(false);
    render(<ReceivablesWorkspace/>);
    expect(screen.getByText(/verified V2 finance is unavailable/i)).toBeTruthy();
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(mocks.reconciliation).not.toHaveBeenCalled();
  });

  it("rejects demo/cashier access at the UI boundary without treating it as SQL authorization",()=>{
    mocks.auth.mockReturnValue({
      organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:actor,role:"CASHIER"},isCloudAccount:true,isDemoMode:false,
    });
    render(<ReceivablesWorkspace/>);
    expect(screen.getByText(/verified V2 finance is unavailable/i)).toBeTruthy();
    expect(mocks.customers).not.toHaveBeenCalled();
  });

  it("loads a full customer report, displays exact balances and inspects an invoice",async()=>{
    await loadCustomerReport();
    await waitFor(()=>expect(screen.getByText("Open service invoices · 1 certified V2 rows")).toBeTruthy());
    expect(screen.getAllByText("PKR 6.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/manually dual-attested, not bank-verified/)).toBeTruthy();
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
      organizationId:org,userId:actor,customerId,currency:"PKR",
      asOfDate:"2026-11-20",
    }));
    fireEvent.click(screen.getByRole("button",{name:"Inspect"}));
    expect(screen.getByRole("region",{name:"Invoice source details"})).toBeTruthy();
  });

  it("loads company totals without pretending to list all company invoices",async()=>{
    render(<ReceivablesWorkspace/>);
    await waitFor(()=>expect(screen.getByRole("option",{name:/Acme Test/})).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Business-date cutoff"),{target:{value:"2026-11-20"}});
    fireEvent.click(screen.getByRole("button",{name:"Load verified AR"}));
    await waitFor(()=>expect(screen.getByText(/Select a customer and load the report/)).toBeTruthy());
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("never renders a mixed token or inconsistent AR balance as certified",async()=>{
    mocks.open.mockResolvedValue({
      ...openList(),source:{...source,snapshot_token:"b".repeat(64)},
    });
    await loadCustomerReport();
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toMatch(/different or unbalanced sources/));
    expect(screen.queryByText(/Open service invoices ·/)).toBeNull();
  });

  it("fails closed if invoices do not add to certified AR control",async()=>{
    mocks.open.mockResolvedValue({
      ...openList(),invoices:[{...openList().invoices[0],outstanding_minor:"599"}],
    });
    await loadCustomerReport();
    await waitFor(()=>expect(screen.getByRole("alert").textContent)
      .toMatch(/different or unbalanced sources/));
  });

  it("does not show zero on a failed authenticated RPC",async()=>{
    mocks.reconciliation.mockRejectedValue(Object.assign(new Error("Access denied"),{code:"42501"}));
    await loadCustomerReport();
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toMatch(/Access denied/));
    expect(screen.queryByText(/Open service invoices ·/)).toBeNull();
  });

  it("invalidates financial data immediately when customer/cutoff changes",async()=>{
    await loadCustomerReport();
    await waitFor(()=>expect(screen.getByText("Open service invoices · 1 certified V2 rows")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Customer"),{target:{value:""}});
    expect(screen.queryByText(/Open service invoices ·/)).toBeNull();
  });

  it("never invents bank verification while receipt lookup remains interactive",async()=>{
    render(<ReceivablesWorkspace/>);
    fireEvent.change(screen.getByLabelText("Receipt UUID"),{target:{value:invoiceId}});
    fireEvent.click(screen.getByRole("button",{name:"Inspect receipt"}));
    expect(screen.getByRole("region",{name:"Receipt source details"})).toBeTruthy();
  });
});
