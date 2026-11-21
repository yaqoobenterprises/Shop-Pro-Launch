/** Exact, read-only draft allocation planner. SQL is the only settlement authority. */
import type {CashCollection,InvoiceOpenBalance,ReceiptAllocationInput} from "./receiptContracts";
import {money,uuid} from "./receiptReadPrimitives";

const MAX=9223372036854775807n;

/** Reject partial, stale, foreign, settled or mismatched inputs BEFORE requesting a receipt draft. */
export function planCustomerReceiptAllocations(
  cash:CashCollection,
  invoices:InvoiceOpenBalance[],
  requested:ReceiptAllocationInput[],
):ReceiptAllocationInput[] {
  uuid(cash.organization_id,"cash organization");
  uuid(cash.customer_id,"cash customer");
  if (cash.state!=="confirmed" || !cash.fingerprint ||
      (cash.posted_receipt_id!==null && cash.posted_receipt_id!==undefined)) {
    throw new Error("Only confirmed, unposted cash can fund a customer receipt.");
  }
  const cashAmount=money(cash.amount_minor,"cash source amount",true);
  if(cashAmount===0n || !Array.isArray(requested) ||
     requested.length<1 || requested.length>99 || !Array.isArray(invoices)){
    throw new Error("Receipt must allocate one confirmed amount to 1–99 invoices.");
  }
  const available=new Map<string,InvoiceOpenBalance>();
  for(const invoice of invoices){
    const id=uuid(invoice.invoice_id,"open invoice");
    if(available.has(id))throw new Error("Duplicate open invoice in certified source.");
    if(invoice.organization_id!==cash.organization_id ||
       invoice.customer_id!==cash.customer_id ||
       invoice.currency!==cash.currency ||
       invoice.as_of_date!==cash.business_date ||
       invoice.business_date>cash.business_date ||
       invoice.source_complete!==true ||
       invoice.legacy_included!==false ||
       invoice.opening_migration_verified!==false ||
       invoice.scope!=="v2_invoice_allocations"){
      throw new Error("Open invoice source scope/cutoff disagrees with cash evidence.");
    }
    available.set(id,invoice);
  }
  const result=[...requested].sort((a,b)=>a.invoice_id.localeCompare(b.invoice_id,"en"));
  let total=0n;
  let previous="";
  for(const allocation of result){
    if(Object.keys(allocation).some(key=>key!=="invoice_id"&&key!=="amount_minor")){
      throw new Error("Unsupported receipt allocation field.");
    }
    const id=uuid(allocation.invoice_id,"allocated invoice");
    if(id===previous)throw new Error("A receipt cannot allocate the same invoice twice.");
    previous=id;
    const invoice=available.get(id);
    if(!invoice || invoice.status==="settled"){
      throw new Error("Selected invoice is not in the complete open-invoice source.");
    }
    const amount=money(allocation.amount_minor,"invoice allocation",true);
    const outstanding=money(invoice.outstanding_minor,"invoice outstanding",true);
    if(amount===0n || amount>MAX || amount>outstanding){
      throw new Error("Allocation must be positive and within verified outstanding balance.");
    }
    total+=amount;
    if(total>MAX)throw new Error("Receipt allocation total exceeds signed BIGINT.");
  }
  if(total!==cashAmount){
    throw new Error("The entire confirmed cash amount must equal invoice allocations.");
  }
  return result;
}
