/**
 * Fresh V2 manual journal — isolated staging transport ONLY.
 * The existing audited PostgreSQL post_aqvora_journal owns authorization,
 * MFA/session checks, fiscal locks, journal writes and immutable receipts.
 * This adapter never inserts journal rows, enables a writer or uses service_role.
 */
import type { AccountingReadAccount } from "../accounting/readContracts";
import { validBusinessDate } from "../accounting/minorUnits";
import {
  readPendingManualJournal, validateManualJournalLines,
  type PendingManualJournal, type ManualJournalLine,
} from "../accounting/pendingManualJournal";
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";
import { listIsolatedPostingAccounts } from "./aqvoraPostingAccountsReadService";
import { isIsolatedVerifiedFinancialReadEnabled } from "./aqvoraVerifiedFinancialReadService";

const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const EXACT=/^[1-9][0-9]*$/;
const FORBIDDEN=new Set(["receivable","payable","inventory","tax"]);

export interface ManualJournalContext {
  organizationId:string;
  userId:string;
  currency:string;
  isCloudAccount:boolean;
  isDemoMode:boolean;
  actorRole:string|undefined;
}
export interface JournalFiscalPeriod {
  id:string;
  organization_id:string;
  starts_on:string;
  ends_on:string;
  state:"open"|"closed"|"reopened";
}
export interface ManualJournalSetup {
  accounts:AccountingReadAccount[];
  periods:JournalFiscalPeriod[];
}
export interface ManualJournalReceipt {
  organization_id:string;
  intent_key:string;
  journal_id:string;
  total_minor:string;
  posted_at:string;
  posted_by:string;
}

export function isIsolatedManualJournalEnabled():boolean {
  return isIsolatedVerifiedFinancialReadEnabled() &&
    import.meta.env.VITE_ENABLE_AQVORA_STAGING_MANUAL_JOURNALS==="true";
}
async function requireSession(ctx:ManualJournalContext):Promise<void> {
  if(!isIsolatedManualJournalEnabled() || !ctx.isCloudAccount ||
     ctx.isDemoMode || ctx.actorRole!=="OWNER" ||
     !UUID.test(ctx.organizationId||"")||!UUID.test(ctx.userId||"")||
     !/^[A-Z]{3}$/.test(ctx.currency||"")) {
    throw new Error("Manual journal posting is limited to approved isolated-staging company OWNER.");
  }
  if(!(await hasConfiguredCloudSession(ctx.userId))){
    throw new Error("Manual journal requires an active matching cloud session and server MFA.");
  }
}
function validPeriod(value:unknown,ctx:ManualJournalContext):JournalFiscalPeriod {
  if(!value||typeof value!=="object"||Array.isArray(value)){
    throw new Error("Malformed fiscal period from server.");
  }
  const p=value as Record<string,unknown>;
  if(p.organization_id!==ctx.organizationId||typeof p.id!=="string"||!UUID.test(p.id)||
     typeof p.starts_on!=="string"||!validBusinessDate(p.starts_on)||
     typeof p.ends_on!=="string"||!validBusinessDate(p.ends_on)||
     p.starts_on>p.ends_on||!["open","closed","reopened"].includes(String(p.state))){
    throw new Error("Foreign or invalid fiscal period from server.");
  }
  return p as unknown as JournalFiscalPeriod;
}
async function fetchPeriods(ctx:ManualJournalContext):Promise<JournalFiscalPeriod[]> {
  const periods:JournalFiscalPeriod[]=[];
  const seen=new Set<string>();
  let before:string|null=null;
  const perPage=100;
  for(let page=0;page<20;page++){
    await requireSession(ctx);
    const {data,error}=await getSupabaseClient().rpc("list_aqvora_periods",{
      p_organization_id:ctx.organizationId,p_before_start:before,p_limit:perPage,
    });
    if(error)throw error;
    await requireSession(ctx);
    if(!Array.isArray(data)||data.length>perPage){
      throw new Error("Fiscal period listing is incomplete.");
    }
    for(const raw of data){
      const period=validPeriod(raw,ctx);
      if(seen.has(period.id)||before!==null&&period.starts_on>=before){
        throw new Error("Duplicated or unordered fiscal period from server.");
      }
      seen.add(period.id);before=period.starts_on;
      periods.push(period);
    }
    if(data.length<perPage)return periods;
  }
  throw new Error("Fiscal period count exceeds staging safety limit.");
}
export async function loadIsolatedManualJournalSetup(
  ctx:ManualJournalContext,
):Promise<ManualJournalSetup>{
  await requireSession(ctx);
  const accounts=await listIsolatedPostingAccounts({
    organizationId:ctx.organizationId,userId:ctx.userId,
    isCloudAccount:ctx.isCloudAccount,
  });
  const periods=await fetchPeriods(ctx);
  await requireSession(ctx);
  // Generic manual journals MUST NOT touch source-controlled AR, AP, tax or
  // inventory accounts. Cash is still a book balance, NOT bank-cleared proof.
  const available=accounts.filter(a=>
    a.control_role===null||a.control_role==="cash");
  return {accounts:available,periods};
}
function assertOriginal(ctx:ManualJournalContext,
  pending:PendingManualJournal):string {
  if(pending.organizationId!==ctx.organizationId||pending.userId!==ctx.userId||
     pending.currency!==ctx.currency||pending.request.organization_id!==ctx.organizationId){
    throw new Error("Original journal actor, company or currency changed.");
  }
  const stored=readPendingManualJournal(ctx.organizationId,ctx.userId);
  if(!stored||JSON.stringify(stored)!==JSON.stringify(pending)){
    throw new Error("Server posting requires its original securely retained journal intent.");
  }
  return validateManualJournalLines(pending.request.lines);
}
function assertPostable(pending:PendingManualJournal,setup:ManualJournalSetup):void{
  const date=pending.request.business_date;
  const matching=setup.periods.filter(p=>date>=p.starts_on&&date<=p.ends_on);
  if(matching.length!==1||matching[0].state!=="open"){
    throw new Error("Posting date needs exactly one open fiscal period.");
  }
  const available=new Set(setup.accounts.map(a=>a.id));
  for(const line of pending.request.lines){
    if(!available.has(line.account_id)){
      throw new Error("Journal includes an unverified/controlled or foreign posting account.");
    }
  }
}
function receipt(raw:unknown,ctx:ManualJournalContext,
  pending:PendingManualJournal,expectedTotal:string):ManualJournalReceipt{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)){
    throw new Error("Original journal receipt missing.");
  }
  const r=raw as Record<string,unknown>;
  if(r.organization_id!==ctx.organizationId ||
     r.intent_key!==pending.request.intent_key ||
     r.posted_by!==ctx.userId ||
     typeof r.journal_id!=="string"||!UUID.test(r.journal_id)||
     r.total_minor!==expectedTotal||
     typeof r.posted_at!=="string"||!r.posted_at.trim()) {
    throw new Error("Server posting receipt disagrees with original journal.");
  }
  return r as unknown as ManualJournalReceipt;
}

/** Read-only receipt lookup works even if the posting period subsequently closed. */
export async function recoverIsolatedManualJournal(
  ctx:ManualJournalContext,pending:PendingManualJournal,
):Promise<ManualJournalReceipt>{
  const expected=assertOriginal(ctx,pending);
  await requireSession(ctx);
  const {data,error}=await getSupabaseClient().rpc("lookup_aqvora_receipt",{
    organization_id:pending.request.organization_id,
    intent_key:pending.request.intent_key,
  });
  if(error)throw error;
  await requireSession(ctx);
  if(data===null){
    throw new Error("Original journal not confirmed; intent stays locked. Do not post another.");
  }
  return receipt(data,ctx,pending,expected);
}

/** Never retry after an uncertain network result; use same-key read recovery. */
export async function postIsolatedManualJournal(
  ctx:ManualJournalContext,pending:PendingManualJournal,
):Promise<ManualJournalReceipt>{
  const expected=assertOriginal(ctx,pending);
  const setup=await loadIsolatedManualJournalSetup(ctx);
  assertPostable(pending,setup);
  await requireSession(ctx);
  const {data,error}=await getSupabaseClient().rpc("post_aqvora_journal",{
    organization_id:pending.request.organization_id,
    intent_key:pending.request.intent_key,
    business_date:pending.request.business_date,
    lines:pending.request.lines,
  });
  if(error)throw error;
  await requireSession(ctx);
  const issued=receipt(data,ctx,pending,expected);
  const recovered=await recoverIsolatedManualJournal(ctx,pending);
  if(recovered.journal_id!==issued.journal_id||
     recovered.posted_at!==issued.posted_at||
     recovered.posted_by!==issued.posted_by||
     recovered.total_minor!==issued.total_minor){
    throw new Error("Independent journal receipt recovery did not match post acknowledgement.");
  }
  return recovered;
}
/** Helper for UI: exact minor unit input, no JS Number or guessed FX/exponent. */
export function makeManualJournalLine(accountId:string,side:"debit"|"credit",
  positiveMinor:string):ManualJournalLine{
  if(!UUID.test(accountId)||!EXACT.test(positiveMinor)){
    throw new Error("Choose an authorized account and exact positive minor-unit amount.");
  }
  const value=BigInt(positiveMinor);
  if(value>9223372036854775807n)throw new Error("Journal amount exceeds bigint.");
  return {account_id:accountId,
    debit_minor:side==="debit"?positiveMinor:"0",
    credit_minor:side==="credit"?positiveMinor:"0"};
}
