/** Isolated staging ONLY: receipt draft and maker/checker transitions; NO posting RPC. */
import type {
  CreateCustomerReceiptRequest,CustomerReceipt,ReceiptTransitionRequest,
} from "../accounting/receiptContracts";
import {planCustomerReceiptAllocations} from "../accounting/receiptDraftAllocations";
import {money,object,uuid} from "../accounting/receiptReadPrimitives";
import {getSupabaseClient} from "../lib/supabase";
import {loadIsolatedCashCollection,loadIsolatedCustomerReceipt,
  type VerifiedReceiptDetails} from "./aqvoraCashReceiptReadService";
import {isIsolatedCashCollectionEnabled} from "./aqvoraCashCollectionOperations";
import {collectIsolatedOpenInvoices} from "./aqvoraReceivablesReadService";
import {requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext} from "./aqvoraReceivablesStagingGate";

export const isIsolatedReceiptDraftEnabled=():boolean=>
  isIsolatedCashCollectionEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS==="true";

async function receiptRpc(
  context:IsolatedReceivablesContext,
  method:"create_aqvora_customer_receipt_draft"|"transition_aqvora_customer_receipt",
  args:Record<string,unknown>,
):Promise<unknown> {
  if(!isIsolatedReceiptDraftEnabled()){
    throw new Error("Customer receipt draft operations are disabled outside isolated staging.");
  }
  await requireIsolatedReceivablesSession(context);
  const {data,error}=await getSupabaseClient().rpc(method,args);
  if(error)throw error;
  await requireIsolatedReceivablesSession(context);
  return data;
}
function exactRevision(value:string):bigint{
  const n=money(value,"receipt revision",true);
  if(n<1n)throw new Error("Invalid original receipt revision.");
  return n;
}
function same(actual:unknown,expected:unknown,label:string):void{
  if(actual!==expected)throw new Error("Customer receipt "+label+" differs from original SQL source.");
}

/** A failed or lost response must retry exactly the same stored intent and payload. */
export async function createIsolatedCustomerReceiptDraft(
  context:IsolatedReceivablesContext,request:CreateCustomerReceiptRequest,
):Promise<VerifiedReceiptDetails> {
  if(!isIsolatedReceiptDraftEnabled())throw new Error("Customer receipt drafts disabled.");
  same(request.p_organization_id,context.organizationId,"company");
  uuid(request.p_intent_key,"original receipt draft intent");
  uuid(request.p_collection_id,"controlled cash");
  const cash=await loadIsolatedCashCollection(context,request.p_collection_id);
  if(cash.collection.created_by!==context.userId || cash.attestation!=="dual_control" ||
     cash.linkedPostedReceiptId!==null){
    throw new Error("Only the cash claim maker may allocate independently confirmed, unposted cash.");
  }
  const invoiceContext={
    ...context,customerId:cash.collection.customer_id,
    asOfDate:cash.collection.business_date,
  };
  const page=await collectIsolatedOpenInvoices(invoiceContext);
  if(!page.complete||page.source.authorized_user_id!==context.userId){
    throw new Error("Complete authorized invoice source required.");
  }
  const allocations=planCustomerReceiptAllocations(
    cash.collection,page.invoices,request.p_allocations);
  // Request is canonical and immutable across an uncertain financial source response.
  if(JSON.stringify(allocations)!==JSON.stringify(request.p_allocations)){
    throw new Error("Original receipt allocations must be canonical UUID order.");
  }
  const raw=object(await receiptRpc(context,"create_aqvora_customer_receipt_draft",{
    ...request,
  }),"saved receipt draft");
  const id=uuid(raw.id,"receipt draft");
  const result=await loadIsolatedCustomerReceipt(
    {...context,customerId:cash.collection.customer_id},id);
  const saved=result.receipt;
  for(const [field,want] of Object.entries({
    organization_id:context.organizationId,creation_intent:request.p_intent_key,
    created_by:context.userId,collection_id:request.p_collection_id,
    customer_id:cash.collection.customer_id,currency:context.currency,
    business_date:cash.collection.business_date,amount_minor:cash.collection.amount_minor,
  })){
    same(saved[field as keyof CustomerReceipt],want,field);
  }
  if(saved.state!=="draft" || saved.allocations.length!==allocations.length){
    throw new Error("Original receipt draft did not return a complete unposted source.");
  }
  for(const [index,expected] of allocations.entries()){
    const actual=saved.allocations[index]!;
    same(actual.invoice_id,expected.invoice_id,"allocation invoice");
    same(actual.amount_minor,expected.amount_minor,"allocation amount");
  }
  return result;
}

/** Read current receipt before every action; on uncertainty, UI must force reload. */
export async function transitionIsolatedCustomerReceipt(
  context:IsolatedReceivablesContext,request:ReceiptTransitionRequest,
):Promise<VerifiedReceiptDetails>{
  if(!isIsolatedReceiptDraftEnabled())throw new Error("Receipt workflow disabled.");
  same(request.p_organization_id,context.organizationId,"company");
  uuid(request.p_receipt_id,"customer receipt");
  const expected=exactRevision(request.p_expected_revision);
  const action=request.p_action;
  const next:Record<ReceiptTransitionRequest["p_action"],CustomerReceipt["state"]>={
    submit:"submitted",approve:"approved",reject:"draft",cancel:"cancelled",
  };
  if(!(action in next))throw new Error("Unsupported customer receipt action.");
  const reason=request.p_reason??null;
  if((action==="reject"||action==="cancel")&&
     (typeof reason!=="string"||reason.trim()!==reason||
      !reason||reason.length>500)){
    throw new Error("Receipt rejection/cancellation requires a specific reason.");
  }
  if((action==="submit"||action==="approve")&&reason!==null){
    throw new Error("Receipt action must not invent an audit reason.");
  }
  const before=(await loadIsolatedCustomerReceipt(context,request.p_receipt_id)).receipt;
  same(before.revision,expected.toString(),"revision");
  if(before.state==="posted"||before.state==="cancelled"||
     action==="submit"&&(before.state!=="draft"||before.created_by!==context.userId)||
     (action==="approve"||action==="reject")&&before.state!=="submitted"||
     action==="approve"&&before.created_by===context.userId){
    throw new Error("Receipt current state or maker-checker rule denies this operation.");
  }
  await receiptRpc(context,"transition_aqvora_customer_receipt",{
    p_organization_id:context.organizationId,p_receipt_id:before.id,
    p_expected_revision:request.p_expected_revision,p_action:action,p_reason:reason,
  });
  const result=await loadIsolatedCustomerReceipt(context,before.id);
  const after=result.receipt;
  same(after.state,next[action],"new state");
  same(exactRevision(after.revision),expected+1n,"next revision");
  for(const field of ["id","organization_id","collection_id","collection_fingerprint",
    "created_by","customer_id","business_date","currency","amount_minor",
    "creation_intent"] as const){
    same(after[field],before[field],field);
  }
  if(action==="approve"){
    same(after.approved_by,context.userId,"independent approver");
    if(!after.fingerprint||after.created_by===after.approved_by){
      throw new Error("Approval returned no independent source fingerprint.");
    }
  }
  return result;
}
