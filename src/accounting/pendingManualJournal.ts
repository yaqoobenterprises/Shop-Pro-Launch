/**
 * A manual journal is never fire-and-forget: persist the exact original
 * request BEFORE the RPC. An uncertain response locks this tab until its
 * immutable database receipt has been recovered by the SAME intent key.
 *
 * Session storage is deliberately tab-scoped. This is not an offline queue.
 */
import { validBusinessDate } from "./minorUnits";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const EXACT = /^(0|[1-9][0-9]{0,18})$/;
const MAX = 9223372036854775807n;
const PREFIX = "aqvora:v2:pending-manual-journal:";

export interface ManualJournalLine {
  account_id:string;
  debit_minor:string;
  credit_minor:string;
}
export interface ManualJournalRequest {
  organization_id:string;
  intent_key:string;
  business_date:string;
  lines:ManualJournalLine[];
}
export interface PendingManualJournal {
  organizationId:string;
  userId:string;
  currency:string;
  request:ManualJournalRequest;
}
function key(org:string,user:string):string {
  if(!UUID.test(org)||!UUID.test(user)) {
    throw new Error("Invalid original journal company or actor.");
  }
  return PREFIX+org+":"+user;
}
export function validateManualJournalLines(lines:unknown):string {
  if(!Array.isArray(lines)||lines.length<2||lines.length>100){
    throw new Error("A journal requires 2–100 balanced posting lines.");
  }
  let debit=0n,credit=0n;
  for(const raw of lines){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)){
      throw new Error("Invalid journal line object.");
    }
    const line=raw as Record<string,unknown>;
    if(Object.keys(line).sort().join(",")!=="account_id,credit_minor,debit_minor" ||
       typeof line.account_id!=="string"||!UUID.test(line.account_id)||
       typeof line.debit_minor!=="string"||!EXACT.test(line.debit_minor)||
       typeof line.credit_minor!=="string"||!EXACT.test(line.credit_minor)){
      throw new Error("Journal lines require exact, source-free integer minor units.");
    }
    const dr=BigInt(line.debit_minor),cr=BigInt(line.credit_minor);
    if(dr>MAX||cr>MAX||(dr>0n)===(cr>0n)){
      throw new Error("Each journal line must have one positive side within bigint range.");
    }
    debit+=dr;credit+=cr;
  }
  if(debit===0n||debit!==credit||debit>MAX){
    throw new Error("Journal debits and credits must balance in exact minor units.");
  }
  return debit.toString();
}
function valid(value:unknown,org:string,user:string):value is PendingManualJournal {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const p=value as PendingManualJournal;
  if(Object.keys(p).sort().join(",")!==
     "currency,organizationId,request,userId"||
     p.organizationId!==org||p.userId!==user||
     typeof p.currency!=="string"||!/^[A-Z]{3}$/.test(p.currency)||
     !p.request||typeof p.request!=="object"||Array.isArray(p.request)||
     Object.keys(p.request).sort().join(",")!==
       "business_date,intent_key,lines,organization_id"||
     p.request.organization_id!==org||!UUID.test(p.request.intent_key)||
     !validBusinessDate(p.request.business_date))return false;
  try{validateManualJournalLines(p.request.lines);return true;}catch{return false;}
}
export function readPendingManualJournal(org:string,user:string):PendingManualJournal|null{
  const raw=sessionStorage.getItem(key(org,user));
  if(raw===null)return null;
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{
    throw new Error("Original journal recovery data is corrupt. Further posting blocked.");
  }
  if(!valid(parsed,org,user)){
    throw new Error("Original journal recovery is invalid. Further posting blocked.");
  }
  return parsed;
}
export function reserveManualJournal(org:string,user:string,currency:string,
  businessDate:string,lines:ManualJournalLine[]):PendingManualJournal{
  if(readPendingManualJournal(org,user)){
    throw new Error("Resolve the original pending journal before creating another.");
  }
  if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function"){
    throw new Error("Secure original journal intent generator unavailable.");
  }
  const pending:PendingManualJournal={
    organizationId:org,userId:user,currency,
    request:{
      organization_id:org,intent_key:crypto.randomUUID(),
      business_date:businessDate,
      lines:lines.map(x=>({...x})),
    },
  };
  if(!valid(pending,org,user))throw new Error("Invalid original journal request.");
  const encoded=JSON.stringify(pending);
  sessionStorage.setItem(key(org,user),encoded);
  if(sessionStorage.getItem(key(org,user))!==encoded){
    throw new Error("Cannot verify durable original journal intent. Posting refused.");
  }
  return pending;
}
/** Never clear the intent after a timeout, denial, or inconclusive recovery. */
export function clearPendingManualJournal(expected:PendingManualJournal):void {
  const stored=readPendingManualJournal(expected.organizationId,expected.userId);
  if(!stored||JSON.stringify(stored)!==JSON.stringify(expected)){
    throw new Error("Journal intent changed; original recovery must remain locked.");
  }
  sessionStorage.removeItem(key(expected.organizationId,expected.userId));
}
