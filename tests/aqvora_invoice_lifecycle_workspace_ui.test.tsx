import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {SalesInvoiceLifecycleWorkspace} from "../src/components/accounting/SalesInvoiceLifecycleWorkspace";

const mock=vi.hoisted(()=>({
  auth:vi.fn(),enabled:vi.fn(),issueEnabled:vi.fn(),load:vi.fn(),transition:vi.fn(),
  issue:vi.fn(),lookup:vi.fn(),loadPending:vi.fn(),reserve:vi.fn(),clear:vi.fn(),
}));
vi.mock("../src/context/AuthContext",()=>({useAuth:mock.auth}));
vi.mock("../src/services/aqvoraSalesLifecycleService",()=>({
  isIsolatedInvoiceLifecycleEnabled:mock.enabled,
  isIsolatedInvoiceIssueEnabled:mock.issueEnabled,
  loadIsolatedSalesInvoice:mock.load,
  transitionIsolatedSalesInvoice:mock.transition,
  issueIsolatedSalesInvoice:mock.issue,
  lookupIsolatedSalesIssue:mock.lookup,
}));
vi.mock("../src/accounting/pendingSalesIssue",()=>({
  loadPendingSalesIssue:mock.loadPending,
  reserveSalesIssue:mock.reserve,
  clearPendingSalesIssue:mock.clear,
}));
const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const invoiceId="44444444-4444-4444-8444-444444444444";
const key="55555555-5555-4555-8555-555555555555";
const fp="a".repeat(64);
const invoice=(state:"draft"|"submitted"|"approved"|"issued"="draft")=>({
  organization_id:org,id:invoiceId,customer_id:checker,
  created_by:maker,revision:state==="draft"?"1":state==="submitted"?"2":state==="approved"?"3":"4",
  currency:"PKR",face_minor:"150",gross_minor:"152",discount_minor:"2",
  state,approved_by:state==="approved"||state==="issued"?checker:null,
  fingerprint:state==="draft"?null:fp,
  document_number:state==="issued"?"SI-1":null,
  journal_id:state==="issued"?invoiceId:null,
  ...(state==="issued"?{reconciliation:{allocated_minor:"0",outstanding_minor:"150"}}:{}),
});
const pending={organizationId:org,userId:checker,invoiceId,revision:"3",fingerprint:fp,intentKey:key};
beforeEach(()=>{
  mock.enabled.mockReturnValue(true);
  mock.issueEnabled.mockReturnValue(false);
  mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
    user:{id:maker,role:"MANAGER"},isCloudAccount:true,isDemoMode:false});
  mock.loadPending.mockReturnValue(null);
  mock.load.mockResolvedValue(invoice("draft"));
  mock.transition.mockResolvedValue(invoice("submitted"));
  mock.reserve.mockReturnValue({...pending,userId:maker});
  mock.issue.mockResolvedValue({receipt:{journal_id:invoiceId},invoice:invoice("issued")});
  mock.lookup.mockResolvedValue({status:"found",receipt:{source_revision:"3",fingerprint:fp},
    invoice:invoice("issued")});
  sessionStorage.clear();
  sessionStorage.setItem(`aqvora:invoice-review:${org}:${maker}`,invoiceId);
  sessionStorage.setItem(`aqvora:invoice-review:${org}:${checker}`,invoiceId);
});
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();});

async function openInvoice(){
  render(<SalesInvoiceLifecycleWorkspace/>);
  await waitFor(()=>expect((screen.getByLabelText("Company invoice UUID") as HTMLInputElement).value)
    .toBe(invoiceId));
  fireEvent.click(screen.getByRole("button",{name:"Load original source"}));
  await waitFor(()=>expect(screen.getByRole("region",{name:"Invoice workflow actions"})).toBeTruthy());
}

describe("AQVORA isolated staging sales invoice review interface",()=>{
  it("never reads or posts when disabled or cashier-only",()=>{
    mock.enabled.mockReturnValue(false);
    render(<SalesInvoiceLifecycleWorkspace/>);
    expect(screen.getByText(/Lifecycle mutations are disabled/)).toBeTruthy();
    expect(mock.load).not.toHaveBeenCalled();
  });
  it("maker submits a draft using the verified revision, not a client-generated balance",async()=>{
    await openInvoice();
    fireEvent.click(screen.getByRole("button",{name:"Submit for independent approval"}));
    await waitFor(()=>expect(mock.transition).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:org,userId:maker}),
      expect.objectContaining({p_invoice_id:invoiceId,p_expected_revision:"1",p_action:"submit"}),
    ));
    await waitFor(()=>expect(screen.getByText(/Server confirmed submit/)).toBeTruthy());
    expect(screen.queryByRole("button",{name:/Issue source-backed/})).toBeNull();
  });
  it("different OWNER can approve but cannot self-approve",async()=>{
    mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:checker,role:"OWNER"},isCloudAccount:true,isDemoMode:false});
    mock.load.mockResolvedValue(invoice("submitted"));
    mock.transition.mockResolvedValue(invoice("approved"));
    await openInvoice();
    fireEvent.click(screen.getByRole("button",{name:"Approve (distinct OWNER)"}));
    await waitFor(()=>expect(mock.transition).toHaveBeenCalledWith(expect.any(Object),
      expect.objectContaining({p_action:"approve",p_expected_revision:"2"})));
    expect(screen.getByText(/Financial issue writer is locked/)).toBeTruthy();
  });
  it("issue button requires its own flag AND explicit irreversible posting acknowledgment",async()=>{
    mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:checker,role:"OWNER"},isCloudAccount:true,isDemoMode:false});
    mock.issueEnabled.mockReturnValue(true);
    mock.load.mockResolvedValue(invoice("approved"));
    mock.reserve.mockReturnValue(pending);
    await openInvoice();
    expect((screen.getByRole("button",{name:"Issue source-backed invoice"}) as HTMLButtonElement)
      .disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"Issue source-backed invoice"}));
    await waitFor(()=>expect(mock.issue).toHaveBeenCalledWith(expect.any(Object),
      expect.objectContaining({p_intent_key:key,p_expected_revision:"3",p_fingerprint:fp})));
    await waitFor(()=>expect(screen.getByText(/server confirmed one issued journal/i)).toBeTruthy());
    expect(mock.clear).toHaveBeenCalledTimes(1);
  });
  it("lost ACK locks the original key and allows only recovery, not a new issue",async()=>{
    mock.auth.mockReturnValue({organization:{id:org,currency:"PKR",timezone:"Asia/Karachi"},
      user:{id:checker,role:"OWNER"},isCloudAccount:true,isDemoMode:false});
    mock.issueEnabled.mockReturnValue(true);
    mock.load.mockResolvedValue(invoice("approved"));
    mock.reserve.mockReturnValue(pending);
    mock.issue.mockRejectedValueOnce(new Error("Network response lost"));
    await openInvoice();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"Issue source-backed invoice"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Network response lost"));
    expect((screen.getByRole("button",{name:"Load original source"}) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.reserve).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Recover original issuance receipt"}));
    await waitFor(()=>expect(mock.lookup).toHaveBeenCalledWith(expect.any(Object),key));
    await waitFor(()=>expect(screen.getByText(/Original issue receipt recovered/)).toBeTruthy());
    expect(mock.clear).toHaveBeenCalledTimes(1);
  });
  it("an unconfirmed policy/permission failure discards stale transitions and requires refresh",async()=>{
    mock.transition.mockRejectedValueOnce(Object.assign(new Error("Tax policy is missing"),{code:"42501"}));
    await openInvoice();
    fireEvent.click(screen.getByRole("button",{name:"Submit for independent approval"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Tax policy is missing"));
    expect(screen.queryByRole("button",{name:"Submit for independent approval"})).toBeNull();
  });
});
