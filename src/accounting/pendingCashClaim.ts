/** Durable-in-this-tab cash creation retry; no personal data or account secrets. */
import type { CreateCashCollectionRequest } from "./receiptContracts";
import { date, money, uuid } from "./receiptReadPrimitives";

export interface PendingCashClaim {
  userId:string;
  request:CreateCashCollectionRequest;
}
const namespace="aqvora:v2:cash-claim:";
const path=(org:string,user:string)=>{
  uuid(org,"claim organization");uuid(user,"claim actor");
  return namespace+org+":"+user;
};
function check(value:PendingCashClaim,org:string,user:string):void{
  const r=value.request;
  if(value.userId!==user||r.p_organization_id!==org||
      r.p_source_kind!=="controlled_cash"||
      typeof r.p_currency!=="string"|| !/^[A-Z]{3}$/.test(r.p_currency)||
      typeof r.p_intent_key!=="string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(r.p_intent_key)||
      money(r.p_amount_minor,"original cash",true)<=0n){
    throw new Error("Original cash creation intent is invalid; no new claim is safe.");
  }
  uuid(r.p_customer_id,"claim customer");date(r.p_business_date,"claim date");
}
export function readPendingCashClaim(org:string,user:string):PendingCashClaim|null{
  const raw=sessionStorage.getItem(path(org,user));
  if(!raw)return null;
  let data:unknown;
  try{data=JSON.parse(raw);}catch{
    throw new Error("Original cash creation recovery is corrupt; investigate before retry.");
  }
  if(!data||typeof data!=="object"||Array.isArray(data)) {
    throw new Error("Stored cash intent has invalid shape.");
  }
  const p=data as PendingCashClaim;
  check(p,org,user);
  return p;
}
export function reservePendingCashClaim(
  org:string,user:string, request:Omit<CreateCashCollectionRequest,"p_intent_key">,
):PendingCashClaim{
  const previous=readPendingCashClaim(org,user);
  if(previous)throw new Error("Resolve the original cash-claim intent before a new claim.");
  if(!crypto||typeof crypto.randomUUID!=="function") {
    throw new Error("Secure cash intent key generation is unavailable.");
  }
  const item:PendingCashClaim={userId:user,request:{...request,p_intent_key:crypto.randomUUID()}};
  check(item,org,user);
  const encoded=JSON.stringify(item);
  sessionStorage.setItem(path(org,user),encoded);
  if(sessionStorage.getItem(path(org,user))!==encoded){
    throw new Error("Failed to retain original cash creation intent.");
  }
  return item;
}
export function clearPendingCashClaim(expected:PendingCashClaim):void{
  const previous=readPendingCashClaim(expected.request.p_organization_id,expected.userId);
  if(!previous||previous.request.p_intent_key!==expected.request.p_intent_key){
    throw new Error("Cash claim intent changed; refusing to clear another pending source.");
  }
  sessionStorage.removeItem(path(expected.request.p_organization_id,expected.userId));
}
