/** Isolated, default-OFF Customer Receipt posting; SQL remains the ONLY writer.
 * A network failure leaves the original durable intent locked for read recovery.
 */
import type {CustomerReceipt,CustomerReceiptIssue,PostCustomerReceiptRequest}
  from "../accounting/receiptContracts";
import {readPendingReceiptPosting} from "../accounting/pendingReceiptPosting";
import {money,object,uuid} from "../accounting/receiptReadPrimitives";
import {getSupabaseClient} from "../lib/supabase";
import {isIsolatedReceiptDraftEnabled} from "./aqvoraReceiptDraftService";
import {loadIsolatedCustomerReceipt,lookupIsolatedCustomerReceiptIssue,
  type VerifiedReceiptDetails} from "./aqvoraCashReceiptReadService";
import {requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext} from "./aqvoraReceivablesStagingGate";

const SHA=/^[0-9a-f]{64}$/;
export const isIsolatedReceiptPostingEnabled=():boolean=>
  isIsolatedReceiptDraftEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE==="true" &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_RECEIPT_POSTING==="true";

function same(actual:unknown,expected:unknown,label:string):void{
  if(actual!==expected)throw new Error("Original receipt posting "+label+" did not reconcile.");
}
function checkOriginal(
  context:IsolatedReceivablesContext,request:PostCustomerReceiptRequest,
):void{
  same(request.p_organization_id,context.organizationId,"company");
  uuid(request.p_receipt_id,"receipt ID");
  uuid(request.p_intent_key,"posting intent UUID");
  if(!SHA.test(request.p_fingerprint)||money(request.p_expected_revision,
    "posting revision",true)<1n){
    throw new Error("Invalid approved receipt fingerprint or revision.");
  }
  const pending=readPendingReceiptPosting(context.organizationId,context.userId);
  if(!pending||JSON.stringify(pending.request)!==JSON.stringify(request)){
    throw new Error("Financial posting requires the original securely retained intent.");
  }
}

function verifyAgainstOriginal(
  result:VerifiedReceiptDetails,request:PostCustomerReceiptRequest,
  context:IsolatedReceivablesContext,
):CustomerReceiptIssue{
  const source=result.receipt;
  if(source.state!=="posted"||!source.issue_receipt||!source.reconciliation||
    result.bankVerified!==false||result.cash.attestation!=="dual_control"){
    throw new Error("Posting has no independently verified immutable Cash/AR receipt.");
  }
  const issue=source.issue_receipt;
  for(const [field,expected] of Object.entries({
    organization_id:context.organizationId,receipt_id:request.p_receipt_id,
    source_revision:request.p_expected_revision,fingerprint:request.p_fingerprint,
    intent_key:request.p_intent_key,posted_by:context.userId,
    amount_minor:source.amount_minor,customer_id:source.customer_id,
    collection_id:source.collection_id,currency:context.currency,
  })){
    same((issue as unknown as Record<string,unknown>)[field],expected,field);
  }
  if(source.created_by===source.approved_by||
     result.cash.collection.posted_receipt_id!==source.id||
     result.cash.collection.fingerprint!==source.collection_fingerprint||
     result.cash.collection.amount_minor!==source.amount_minor||
     result.cash.collection.confirmed_by===source.created_by){
    throw new Error("Receipt cash count, maker/checker or journal source is inconsistent.");
  }
  return issue;
}

/** Caller must reserve request in session storage BEFORE the network call. */
export async function postIsolatedCustomerReceipt(
  context:IsolatedReceivablesContext,request:PostCustomerReceiptRequest,
):Promise<{receipt:CustomerReceipt;issue:CustomerReceiptIssue}> {
  if(!isIsolatedReceiptPostingEnabled()){
    throw new Error("Receipt financial posting is disabled outside approved isolated staging.");
  }
  checkOriginal(context,request);
  const before=await loadIsolatedCustomerReceipt(context,request.p_receipt_id);
  if(before.receipt.state!=="approved"||
     before.receipt.revision!==request.p_expected_revision||
     before.receipt.fingerprint!==request.p_fingerprint||
     before.receipt.created_by===before.receipt.approved_by||
     before.cash.attestation!=="dual_control"||
     before.cash.linkedPostedReceiptId!==null){
    throw new Error("Receipt is not currently independently approved and unposted.");
  }
  await requireIsolatedReceivablesSession(context);
  const {data,error}=await getSupabaseClient().rpc("post_aqvora_customer_receipt",{
    ...request,
  });
  if(error)throw error; // Never assume this means no journal was committed.
  await requireIsolatedReceivablesSession(context);
  const response=object(data,"durable SQL posting receipt");
  for(const [field,expected] of Object.entries({
    organization_id:context.organizationId,receipt_id:request.p_receipt_id,
    intent_key:request.p_intent_key,source_revision:request.p_expected_revision,
    fingerprint:request.p_fingerprint,posted_by:context.userId,
    amount_minor:before.receipt.amount_minor,
  }))same(response[field],expected,field);
  uuid(response.journal_id,"immutable posted journal");
  // Independently re-fetch exact durable issue, Cash evidence and receipt.
  const recovered=await recoverOriginalCustomerReceiptPosting(context,request);
  for(const [field,expected] of Object.entries(response)){
    if(field==="allocations")continue;
    same((recovered.issue as unknown as Record<string,unknown>)[field],
      expected,"SQL issue "+field);
  }
  return recovered;
}

/** Missing lookup is never permission to use another key, even after timeout. */
export async function recoverOriginalCustomerReceiptPosting(
  context:IsolatedReceivablesContext,request:PostCustomerReceiptRequest,
):Promise<{receipt:CustomerReceipt;issue:CustomerReceiptIssue}> {
  if(!isIsolatedReceiptPostingEnabled()){
    throw new Error("Receipt recovery is disabled outside isolated staging.");
  }
  checkOriginal(context,request);
  const result=await lookupIsolatedCustomerReceiptIssue(context,request.p_intent_key);
  if(result.status!=="found"){
    throw new Error("Original financial issue unresolved. Keep the posting intent locked; contact finance administrator.");
  }
  const issue=verifyAgainstOriginal(result.original,request,context);
  return {receipt:result.original.receipt,issue};
}
