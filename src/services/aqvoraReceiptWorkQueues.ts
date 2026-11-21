/**
 * Live operational cash/receipt lists, NOT a certified company cashbook or
 * immutable snapshot. A selected record is always re-read before any mutation.
 */
import type {CashCollection,CustomerReceipt} from "../accounting/receiptContracts";
import {verifyControlledCashCollection} from "../accounting/verifiedCashCollection";
import {verifyCustomerReceiptDetail} from "../accounting/verifiedCustomerReceipt";
import {uuid} from "../accounting/receiptReadPrimitives";
import {getSupabaseClient} from "../lib/supabase";
import {isIsolatedReceiptDraftEnabled} from "./aqvoraReceiptDraftService";
import {requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext} from "./aqvoraReceivablesStagingGate";

type QueueKind="cash"|"receipt";
export type LiveReceiptQueuePage<T>={
  rows:T[];nextAfterId:string|null;hasPossibleMore:boolean;
  liveNotSnapshot:true;bankVerified:false;legacyIncluded:false;
};
export const isIsolatedReceiptQueueEnabled=():boolean=>
  isIsolatedReceiptDraftEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_RECEIPT_INBOX==="true";

function validateOptions(afterId:string|null,limit:number):void{
  if(afterId!==null)uuid(afterId,"queue page cursor");
  if(!Number.isSafeInteger(limit)||limit<1||limit>100){
    throw new Error("AQVORA operational queue page size must be 1–100.");
  }
}

async function getPage<T extends {id:string}>(
  context:IsolatedReceivablesContext,kind:QueueKind,
  afterId:string|null,limit:number,verify:(value:unknown,id:string)=>T,
):Promise<LiveReceiptQueuePage<T>>{
  if(!isIsolatedReceiptQueueEnabled()){
    throw new Error("AQVORA cash/receipt inbox is disabled outside isolated staging.");
  }
  validateOptions(afterId,limit);
  await requireIsolatedReceivablesSession(context);
  const method=kind==="cash"
    ?"list_aqvora_cash_collections":"list_aqvora_customer_receipts";
  const {data,error}=await getSupabaseClient().rpc(method,{
    p_organization_id:context.organizationId,p_after_id:afterId,p_limit:limit,
  });
  if(error)throw error;
  await requireIsolatedReceivablesSession(context);
  if(!Array.isArray(data)||data.length>limit){
    throw new Error("AQVORA operational queue returned an invalid page.");
  }
  let previous=afterId??"";
  const rows:T[]=[];
  for(const raw of data){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)){
      throw new Error("AQVORA operational queue contains malformed source.");
    }
    const id=uuid((raw as {id?:unknown}).id,"operational source");
    if(id<=previous){
      throw new Error("AQVORA operational queue cursor is duplicate or out of order.");
    }
    rows.push(verify(raw,id));
    previous=id;
  }
  return {rows,nextAfterId:rows.at(-1)?.id??null,
    hasPossibleMore:rows.length===limit,liveNotSnapshot:true,
    bankVerified:false,legacyIncluded:false};
}

/** Each source row is server-owned, with current scope, cutoff and evidence. */
export async function loadIsolatedCashQueuePage(
  context:IsolatedReceivablesContext,afterId:string|null=null,limit=20,
):Promise<LiveReceiptQueuePage<CashCollection>>{
  return getPage(context,"cash",afterId,limit,(raw,id)=>
    verifyControlledCashCollection(raw,{...context,collectionId:id}).collection);
}

/** Receipt list rows are inspected as full source records; open detail on click. */
export async function loadIsolatedReceiptQueuePage(
  context:IsolatedReceivablesContext,afterId:string|null=null,limit=20,
):Promise<LiveReceiptQueuePage<CustomerReceipt>>{
  return getPage(context,"receipt",afterId,limit,(raw,id)=>
    verifyCustomerReceiptDetail(raw,{...context,receiptId:id}));
}
