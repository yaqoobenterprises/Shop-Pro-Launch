/** One durable original posting intent per company/actor/browser tab.
 * Never regenerate an intent after an ambiguous RPC response.
 */
import type {PostCustomerReceiptRequest} from "./receiptContracts";
import {money,uuid} from "./receiptReadPrimitives";

const PREFIX="aqvora:v2:pending-receipt-post:";
const SHA=/^[0-9a-f]{64}$/;
const BIGINT_MAX=9223372036854775807n;

export interface PendingReceiptPosting {
  organizationId:string;
  userId:string;
  request:PostCustomerReceiptRequest;
}
function key(org:string,user:string):string {
  uuid(org,"posting company");uuid(user,"posting actor");
  return PREFIX+org+":"+user;
}
function isValid(value:unknown,org:string,user:string):value is PendingReceiptPosting {
  if(!value || typeof value!=="object" || Array.isArray(value))return false;
  const item=value as PendingReceiptPosting;
  if(item.organizationId!==org||item.userId!==user||
     !item.request||typeof item.request!=="object"||
     Object.keys(item.request).sort().join(",")!==
       "p_expected_revision,p_fingerprint,p_intent_key,p_organization_id,p_receipt_id")return false;
  try {
    uuid(item.request.p_receipt_id,"posting receipt");
    uuid(item.request.p_intent_key,"original posting intent");
    if(item.request.p_organization_id!==org||
       !SHA.test(item.request.p_fingerprint))return false;
    const n=money(item.request.p_expected_revision,"approved revision",true);
    return n>0n && n<=BIGINT_MAX;
  }catch{return false;}
}

export function readPendingReceiptPosting(org:string,user:string):PendingReceiptPosting|null {
  const raw=sessionStorage.getItem(key(org,user));
  if(raw===null)return null;
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{
    throw new Error("Original posting recovery is corrupt; financial writes blocked.");
  }
  if(!isValid(parsed,org,user)){
    throw new Error("Original posting recovery is invalid; financial writes blocked.");
  }
  return parsed;
}

export function reserveReceiptPosting(
  org:string,user:string,receiptId:string,revision:string,fingerprint:string,
):PendingReceiptPosting {
  if(readPendingReceiptPosting(org,user)){
    throw new Error("Resolve original financial posting before starting a second.");
  }
  if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function"){
    throw new Error("Secure posting-intent generator is unavailable.");
  }
  const pending:PendingReceiptPosting={organizationId:org,userId:user,
    request:{p_organization_id:org,p_receipt_id:receiptId,
      p_expected_revision:revision,p_fingerprint:fingerprint,
      p_intent_key:crypto.randomUUID()},
  };
  if(!isValid(pending,org,user)){
    throw new Error("Cannot reserve a valid original financial posting.");
  }
  const encoded=JSON.stringify(pending);
  sessionStorage.setItem(key(org,user),encoded);
  if(sessionStorage.getItem(key(org,user))!==encoded){
    throw new Error("Financial intent was not durably reserved; posting refused.");
  }
  return pending;
}

/** Clear ONLY a fully verified original source, not another tab/actor/intent. */
export function clearPendingReceiptPosting(expected:PendingReceiptPosting):void {
  const actual=readPendingReceiptPosting(expected.organizationId,expected.userId);
  if(!actual||JSON.stringify(actual)!==JSON.stringify(expected)){
    throw new Error("Pending financial intent changed; recovery must remain locked.");
  }
  sessionStorage.removeItem(key(expected.organizationId,expected.userId));
}
