import { uuid } from "./receiptReadPrimitives";

export interface PendingSalesIssue {
  organizationId: string;
  userId: string;
  invoiceId: string;
  revision: string;
  fingerprint: string;
  intentKey: string;
}
const HASH = /^[0-9a-f]{64}$/;
const REV = /^[1-9][0-9]*$/;
const STORE = "aqvora:v2:pending-sales-issue:";
function key(org:string,user:string):string {
  uuid(org,"pending company");
  uuid(user,"pending actor");
  return STORE+org+":"+user;
}
function valid(p:PendingSalesIssue, org:string,user:string):boolean {
  try {
    uuid(p.invoiceId,"pending invoice");
    uuid(p.intentKey,"original issue intent");
    return p.organizationId===org && p.userId===user &&
      REV.test(p.revision) && HASH.test(p.fingerprint);
  } catch { return false; }
}

/**
 * An original intent is retained across tab reloads. If browser storage is
 * blocked, ISSUANCE must not start: losing the key would risk duplicate intent.
 */
export function loadPendingSalesIssue(org:string,user:string):PendingSalesIssue|null {
  const raw=sessionStorage.getItem(key(org,user));
  if (!raw) return null;
  let decoded: unknown;
  try { decoded=JSON.parse(raw); }
  catch { throw new Error("Stored issuance recovery is corrupted; no new issue is safe."); }
  if (!decoded || typeof decoded!=="object" ||
      !valid(decoded as PendingSalesIssue,org,user)) {
    throw new Error("Stored issuance recovery is invalid; no new issue is safe.");
  }
  return decoded as PendingSalesIssue;
}
export function reserveSalesIssue(
  org:string,user:string,invoiceId:string,revision:string,fingerprint:string,
):PendingSalesIssue {
  const previous=loadPendingSalesIssue(org,user);
  if (previous) throw new Error("Resolve the original pending issue before another posting.");
  if (!crypto || typeof crypto.randomUUID!=="function") {
    throw new Error("Secure issuance intent generator is unavailable.");
  }
  const item:PendingSalesIssue={
    organizationId:org,userId:user,invoiceId,revision,fingerprint,intentKey:crypto.randomUUID(),
  };
  if (!valid(item,org,user)) throw new Error("Generated issuance recovery is invalid.");
  sessionStorage.setItem(key(org,user),JSON.stringify(item));
  if (sessionStorage.getItem(key(org,user))!==JSON.stringify(item)) {
    throw new Error("Cannot durably reserve the original issue intent.");
  }
  return item;
}
export function clearPendingSalesIssue(expected:PendingSalesIssue):void {
  const stored=loadPendingSalesIssue(expected.organizationId,expected.userId);
  if (!stored || stored.intentKey!==expected.intentKey) {
    throw new Error("Original issuance recovery changed; refusing to clear another intent.");
  }
  sessionStorage.removeItem(key(expected.organizationId,expected.userId));
}
