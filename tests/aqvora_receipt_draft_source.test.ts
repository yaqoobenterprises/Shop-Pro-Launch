import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {CashCollection,InvoiceOpenBalance} from "../src/accounting/receiptContracts";
import {planCustomerReceiptAllocations} from "../src/accounting/receiptDraftAllocations";
import {reservePendingReceiptDraft,readPendingReceiptDraft,clearPendingReceiptDraft}
  from "../src/accounting/pendingReceiptDraft";

const org="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const customer="33333333-3333-4333-8333-333333333333";
const collection="44444444-4444-4444-8444-444444444444";
const invoice1="55555555-5555-4555-8555-555555555555";
const invoice2="66666666-6666-4666-8666-666666666666";
const originalIntent="77777777-7777-4777-8777-777777777777";
const cash={
  organization_id:org,id:collection,customer_id:customer,created_by:user,
  currency:"PKR",business_date:"2026-11-20",amount_minor:"150",
  state:"confirmed",fingerprint:"a".repeat(64),posted_receipt_id:null,
} as unknown as CashCollection;
const makeInvoice=(invoice_id:string,outstanding_minor:string):InvoiceOpenBalance=>({
  organization_id:org,invoice_id,customer_id:customer,currency:"PKR",
  business_date:"2026-11-18",as_of_date:"2026-11-20",
  outstanding_minor,status:"unpaid",source_complete:true,
  legacy_included:false,opening_migration_verified:false,
  scope:"v2_invoice_allocations",
} as unknown as InvoiceOpenBalance);
const rows=[makeInvoice(invoice1,"200"),makeInvoice(invoice2,"70")];
const allocations=[{invoice_id:invoice1,amount_minor:"100"},
  {invoice_id:invoice2,amount_minor:"50"}];
describe("AQVORA receipt allocation safety",()=>{
  it("requires exact full cash allocation and sorts 1–99 unique IDs",()=>{
    expect(planCustomerReceiptAllocations(cash,rows,[...allocations].reverse()))
      .toEqual(allocations);
  });
  it("rejects duplicate invoices, over-allocation and mismatch",()=>{
    expect(()=>planCustomerReceiptAllocations(cash,rows,[
      {invoice_id:invoice1,amount_minor:"100"},
      {invoice_id:invoice1,amount_minor:"50"},
    ])).toThrow(/same invoice/);
    expect(()=>planCustomerReceiptAllocations(cash,rows,[
      {invoice_id:invoice2,amount_minor:"150"},
    ])).toThrow(/outstanding/);
    expect(()=>planCustomerReceiptAllocations(cash,rows,[
      {invoice_id:invoice1,amount_minor:"149"},
    ])).toThrow(/entire confirmed/);
  });
  it("rejects malformed, float, negative and noncanonical money",()=>{
    for(const wrong of ["01","1.5","-1","0","9223372036854775808"]){
      expect(()=>planCustomerReceiptAllocations(cash,rows,[
        {invoice_id:invoice1,amount_minor:wrong},
      ])).toThrow();
    }
  });
  it("rejects wrong tenant, changed date or unverified legacy source",()=>{
    for(const altered of [
      {...rows[0],organization_id:customer},
      {...rows[0],as_of_date:"2026-11-19"},
      {...rows[0],legacy_included:true},
    ]){
      expect(()=>planCustomerReceiptAllocations(cash,[altered,rows[1]],allocations))
        .toThrow(/scope\/cutoff/);
    }
  });
  it("cannot create draft from unconfirmed or already posted cash",()=>{
    expect(()=>planCustomerReceiptAllocations(
      {...cash,state:"draft"},rows,allocations)).toThrow(/Only confirmed/);
    expect(()=>planCustomerReceiptAllocations(
      {...cash,posted_receipt_id:collection},rows,allocations)).toThrow(/Only confirmed/);
  });
});
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>originalIntent});
});
afterEach(()=>{
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe("AQVORA original customer receipt draft recovery",()=>{
  it("persists exact original allocations and blocks a second key",()=>{
    const pending=reservePendingReceiptDraft(org,user,collection,allocations);
    expect(pending.request.p_intent_key).toBe(originalIntent);
    expect(readPendingReceiptDraft(org,user)).toEqual(pending);
    expect(()=>reservePendingReceiptDraft(org,user,collection,[
      {invoice_id:invoice1,amount_minor:"150"},
    ])).toThrow(/Resolve original/);
    clearPendingReceiptDraft(pending);
    expect(readPendingReceiptDraft(org,user)).toBeNull();
  });
  it("fails closed on corruption or changed original recovery",()=>{
    const pending=reservePendingReceiptDraft(org,user,collection,allocations);
    expect(()=>clearPendingReceiptDraft({
      ...pending,request:{...pending.request,p_intent_key:invoice1},
    })).toThrow(/changed/);
    const key=`aqvora:v2:pending-receipt-draft:${org}:${user}`;
    sessionStorage.setItem(key,"corrupt");
    expect(()=>readPendingReceiptDraft(org,user)).toThrow(/corrupt/);
  });
  it("refuses to start a request if browser intent storage is unavailable",()=>{
    vi.stubGlobal("sessionStorage",{getItem:()=>null,
      setItem:()=>{throw new Error("Storage denied");}});
    expect(()=>reservePendingReceiptDraft(org,user,collection,allocations))
      .toThrow(/Storage denied/);
  });
});
