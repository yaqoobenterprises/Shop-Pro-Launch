import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import type {CustomerReceipt} from "../src/accounting/receiptContracts";
import {ReceiptPostingPanel} from "../src/components/accounting/ReceiptPostingPanel";
import {reserveReceiptPosting,readPendingReceiptPosting}
  from "../src/accounting/pendingReceiptPosting";

const mock=vi.hoisted(()=>({enabled:vi.fn(),load:vi.fn(),post:vi.fn(),recover:vi.fn()}));
vi.mock("../src/services/aqvoraReceiptPostingService",()=>({
  isIsolatedReceiptPostingEnabled:mock.enabled,
  postIsolatedCustomerReceipt:mock.post,
  recoverOriginalCustomerReceiptPosting:mock.recover,
}));
vi.mock("../src/services/aqvoraCashReceiptReadService",()=>({
  loadIsolatedCustomerReceipt:mock.load,
}));
const org="11111111-1111-4111-8111-111111111111";
const maker="22222222-2222-4222-8222-222222222222";
const checker="33333333-3333-4333-8333-333333333333";
const id="44444444-4444-4444-8444-444444444444";
const intent="55555555-5555-4555-8555-555555555555";
const journal="66666666-6666-4666-8666-666666666666";
const fp="a".repeat(64);
const context={organizationId:org,userId:maker,isCloudAccount:true,
  currency:"PKR",asOfDate:"2026-11-21"};
const approved={
  id,organization_id:org,amount_minor:"150",currency:"PKR",revision:"3",
  state:"approved",fingerprint:fp,created_by:maker,approved_by:checker,
  allocations:[{invoice_id:id,amount_minor:"150"}],
} as unknown as CustomerReceipt;
const issued={
  receipt_id:id,receipt_number:"CR-1",journal_id:journal,amount_minor:"150",
  fingerprint:fp,source_revision:"3",intent_key:intent,
};
const result={receipt:{...approved,state:"posted",revision:"4"},
  issue:issued};
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>intent});
  mock.enabled.mockReturnValue(true);
  mock.load.mockResolvedValue({receipt:approved});
  mock.post.mockResolvedValue(result);
  mock.recover.mockResolvedValue(result);
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});

describe("AQVORA receipt posting confirmation UI",()=>{
  it("renders no controls while posting is default-OFF",()=>{
    mock.enabled.mockReturnValue(false);
    const {container}=render(<ReceiptPostingPanel context={context}
      actorRole="MANAGER" sourceReceipt={approved}/>);
    expect(container.textContent).toBe("");
    expect(mock.post).not.toHaveBeenCalled();
  });
  it("requires explicit acknowledgement, then displays source-certified journal not bank status",async()=>{
    render(<ReceiptPostingPanel context={context} actorRole="MANAGER"
      sourceReceipt={approved}/>);
    const postButton=await waitFor(()=>screen.getByRole("button",{
      name:"Post verified receipt once",
    })) as HTMLButtonElement;
    expect(postButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(postButton.disabled).toBe(false);
    fireEvent.click(postButton);
    await waitFor(()=>expect(mock.post).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(screen.getByText(/Posted receipt: CR-1/)).toBeTruthy());
    expect(screen.queryByRole("button",{name:"Post verified receipt once"})).toBeNull();
    expect(screen.getByText(/Bank verified: NO/)).toBeTruthy();
    expect(readPendingReceiptPosting(org,maker)).toBeNull();
  });
  it("unknown network outcome locks original intent and offers recovery instead of a second post",async()=>{
    mock.post.mockRejectedValueOnce(new Error("ACK lost"));
    render(<ReceiptPostingPanel context={context} actorRole="OWNER"
      sourceReceipt={approved}/>);
    fireEvent.click(await waitFor(()=>screen.getByRole("checkbox")));
    fireEvent.click(screen.getByRole("button",{name:"Post verified receipt once"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("ACK lost"));
    const original=readPendingReceiptPosting(org,maker);
    expect(original?.request.p_intent_key).toBe(intent);
    expect(screen.queryByRole("button",{name:"Post verified receipt once"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Recover original posting"}));
    await waitFor(()=>expect(mock.recover).toHaveBeenCalledWith(
      expect.objectContaining({organizationId:org,userId:maker}),original?.request));
    await waitFor(()=>expect(readPendingReceiptPosting(org,maker)).toBeNull());
    expect(mock.post).toHaveBeenCalledTimes(1);
  });
  it("resumes a persisted original intent without offering fresh posting",async()=>{
    const pending=reserveReceiptPosting(org,maker,id,"3",fp);
    render(<ReceiptPostingPanel context={context} actorRole="OWNER"
      sourceReceipt={null}/>);
    const button=await waitFor(()=>screen.getByRole("button",{
      name:"Recover original posting",
    }));
    expect(screen.queryByRole("button",{name:"Post verified receipt once"})).toBeNull();
    fireEvent.click(button);
    await waitFor(()=>expect(mock.recover).toHaveBeenCalledWith(
      expect.anything(),pending.request));
    expect(mock.post).not.toHaveBeenCalled();
  });
  it("refuses corrupted pending intent instead of starting another financial write",()=>{
    sessionStorage.setItem(`aqvora:v2:pending-receipt-post:${org}:${maker}`,"not-json");
    render(<ReceiptPostingPanel context={context} actorRole="OWNER"
      sourceReceipt={approved}/>);
    expect(screen.getByText(/Recovery storage is invalid/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Post verified receipt once"})).toBeNull();
    expect(mock.post).not.toHaveBeenCalled();
  });
});
