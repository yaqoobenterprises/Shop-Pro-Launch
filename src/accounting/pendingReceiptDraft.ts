/** Durable original receipt-draft creation intent, scoped to one company/actor/tab. */
import type {ReceiptAllocationInput,CreateCustomerReceiptRequest} from "./receiptContracts";
import {money,uuid} from "./receiptReadPrimitives";

export interface PendingReceiptDraft {
  organizationId:string;
  userId:string;
  request:CreateCustomerReceiptRequest;
}
const PREFIX="aqvora:v2:pending-receipt-draft:";
const key=(org:string,user:string):string=>{
  uuid(org,"receipt company");uuid(user,"receipt actor");
  return PREFIX+org+":"+user;
};
function valid(item:PendingReceiptDraft,org:string,user:string):boolean {
  try {
    if(item.organizationId!==org||item.userId!==user||
       item.request.p_organization_id!==org||
       typeof item.request.p_intent_key!=="string"||
       item.request.p_intent_key.length>100){
      return false;
    }
    uuid(item.request.p_intent_key,"original draft intent");
    uuid(item.request.p_collection_id,"cash collection");
    if(!Array.isArray(item.request.p_allocations) ||
       item.request.p_allocations.length<1 ||
       item.request.p_allocations.length>99)return false;
    let last="";
    for(const a of item.request.p_allocations){
      if(!a || Object.keys(a).some(k=>k!=="invoice_id"&&k!=="amount_minor"))return false;
      uuid(a.invoice_id,"receipt invoice");
      if(a.invoice_id<=last)return false;
      last=a.invoice_id;
      if(money(a.amount_minor,"pending allocation",true)===0n)return false;
    }
    return true;
  }catch{return false;}
}
export function readPendingReceiptDraft(org:string,user:string):PendingReceiptDraft|null {
  const raw=sessionStorage.getItem(key(org,user));
  if(raw===null)return null;
  let item:unknown;
  try{item=JSON.parse(raw);}catch{
    throw new Error("Original receipt draft recovery is corrupt; new creation blocked.");
  }
  if(!item || typeof item!=="object" || !valid(item as PendingReceiptDraft,org,user)){
    throw new Error("Original receipt draft recovery is invalid; new creation blocked.");
  }
  return item as PendingReceiptDraft;
}
export function reservePendingReceiptDraft(
  org:string,user:string,collectionId:string,allocations:ReceiptAllocationInput[],
):PendingReceiptDraft {
  if(readPendingReceiptDraft(org,user)){
    throw new Error("Resolve original receipt draft creation before another request.");
  }
  if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function"){
    throw new Error("Secure original intent generator unavailable.");
  }
  const item:PendingReceiptDraft={
    organizationId:org,userId:user,
    request:{p_organization_id:org,p_intent_key:crypto.randomUUID(),
      p_collection_id:collectionId,p_allocations:allocations},
  };
  if(!valid(item,org,user))throw new Error("Invalid exact receipt draft creation intent.");
  const encoded=JSON.stringify(item);
  sessionStorage.setItem(key(org,user),encoded);
  if(sessionStorage.getItem(key(org,user))!==encoded){
    throw new Error("Cannot durably retain original receipt draft request.");
  }
  return item;
}
export function clearPendingReceiptDraft(expected:PendingReceiptDraft):void {
  const stored=readPendingReceiptDraft(expected.organizationId,expected.userId);
  if(!stored || JSON.stringify(stored)!==JSON.stringify(expected)){
    throw new Error("Original receipt draft intent changed; refusing to clear recovery.");
  }
  sessionStorage.removeItem(key(expected.organizationId,expected.userId));
}
