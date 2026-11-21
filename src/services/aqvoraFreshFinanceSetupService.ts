/**
 * AQVORA V2 new-company CoA/fiscal administration.
 * LIVE RPCs only in an approved, non-business isolated staging project.
 * The SQL RPCs own MFA, session, company role, row locks and audit writes.
 * Never edits legacy Cashbook, opening balances or financial writer enrollment.
 */
import type { AccountClass, AccountSide } from "../accounting/types";
import { validBusinessDate } from "../accounting/minorUnits";
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";
import {
  isIsolatedVerifiedFinancialReadEnabled, loadIsolatedVerifiedTrialBalance,
} from "./aqvoraVerifiedFinancialReadService";

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const ACCOUNT_CODE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const CLASSES=new Set<AccountClass>([
  "asset","liability","equity","revenue","cost_of_sales",
  "expense","other_income","other_expense",
]);
const MAX_PAGES=30;
const PAGE_SIZE=100;

export interface FreshFinanceSetupContext {
  organizationId:string;
  userId:string;
  ownerRole:string|undefined;
  currency:string;
  isCloudAccount:boolean;
  isDemoMode:boolean;
}
export interface ServerFinanceAccount {
  organization_id:string;
  id:string;
  code:string;
  name:string;
  account_class:AccountClass;
  normal_side:AccountSide;
  parent_id:string|null;
  is_posting:boolean;
  is_active:boolean;
}
export interface ServerFinancePeriod {
  organization_id:string;
  id:string;
  starts_on:string;
  ends_on:string;
  state:"open"|"closed";
}
export interface FreshFinanceSetupSnapshot {
  accounts:ServerFinanceAccount[];
  periods:ServerFinancePeriod[];
  certifiedZeroJournals:true;
  currency:string;
  sourceToken:string;
}

export const isFreshFinanceSetupStagingEnabled=():boolean=>
  isIsolatedVerifiedFinancialReadEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_FRESH_FINANCE_SETUP==="true";

async function owner(ctx:FreshFinanceSetupContext):Promise<void> {
  if (!isFreshFinanceSetupStagingEnabled() || !ctx.isCloudAccount ||
      ctx.isDemoMode || ctx.ownerRole!=="OWNER" ||
      !UUID.test(ctx.organizationId||"") || !UUID.test(ctx.userId||"") ||
      !/^[A-Z]{3}$/.test(ctx.currency||"")) {
    throw new Error("Fresh finance setup requires a verified staging company OWNER.");
  }
  if (!(await hasConfiguredCloudSession(ctx.userId))) {
    throw new Error("Fresh finance setup requires a current matching cloud session.");
  }
}
type AdminRpc =
  "list_aqvora_accounts"|"list_aqvora_periods"|
  "create_aqvora_account"|"get_aqvora_account"|
  "create_aqvora_period"|"get_aqvora_period";
async function call(ctx:FreshFinanceSetupContext,name:AdminRpc,
  args:Record<string,unknown>):Promise<unknown> {
  await owner(ctx);
  const {data,error}=await getSupabaseClient().rpc(name,args);
  if(error)throw new Error(error.message);
  await owner(ctx);
  return data;
}
function obj(raw:unknown,label:string):Record<string,unknown>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) {
    throw new Error("Invalid server "+label+" receipt.");
  }
  return raw as Record<string,unknown>;
}
function account(raw:unknown,ctx:FreshFinanceSetupContext):ServerFinanceAccount{
  const a=obj(raw,"account");
  if(a.organization_id!==ctx.organizationId || !UUID.test(String(a.id||"")) ||
     typeof a.code!=="string" || !ACCOUNT_CODE.test(a.code) ||
     typeof a.name!=="string" || !a.name.trim() || a.name.length>160 ||
     !CLASSES.has(a.account_class as AccountClass) ||
     (a.normal_side!=="debit"&&a.normal_side!=="credit") ||
     (a.parent_id!==null&&!UUID.test(String(a.parent_id||""))) ||
     typeof a.is_posting!=="boolean" || typeof a.is_active!=="boolean"){
    throw new Error("Server returned a foreign or malformed financial account.");
  }
  return a as unknown as ServerFinanceAccount;
}
function period(raw:unknown,ctx:FreshFinanceSetupContext):ServerFinancePeriod{
  const p=obj(raw,"fiscal period");
  if(p.organization_id!==ctx.organizationId || !UUID.test(String(p.id||"")) ||
      typeof p.starts_on!=="string" || !validBusinessDate(p.starts_on) ||
      typeof p.ends_on!=="string" || !validBusinessDate(p.ends_on) ||
      p.starts_on>p.ends_on || (p.state!=="open"&&p.state!=="closed")){
    throw new Error("Server returned a foreign or invalid fiscal period.");
  }
  return p as unknown as ServerFinancePeriod;
}
async function certifiedZero(ctx:FreshFinanceSetupContext):Promise<string>{
  await owner(ctx);
  // V2 read certification explicitly includes ALL reportable historical dates;
  // never infer emptiness from an RLS-filtered SELECT count or a UI flag.
  const report=await loadIsolatedVerifiedTrialBalance({
    organizationId:ctx.organizationId,userId:ctx.userId,
    isCloudAccount:ctx.isCloudAccount,currency:ctx.currency,
    fromDate:"0001-01-01",toDate:"9999-12-31",
  },{pageSize:100,maxPages:MAX_PAGES,maxRows:MAX_PAGES*PAGE_SIZE});
  await owner(ctx);
  if(report.source.organization_id!==ctx.organizationId ||
     report.source.currency!==ctx.currency ||
     report.source.source_complete!==true ||
     report.source.legacy_included!==false ||
     report.source.source_journal_count!=="0" ||
     report.source.source_line_count!=="0" ||
     report.source.source_debit_minor!=="0" ||
     report.source.source_credit_minor!=="0" ||
     report.totals.debit_minor!=="0" || report.totals.credit_minor!=="0" ||
     report.totals.closing_debit_minor!=="0" ||
     report.totals.closing_credit_minor!=="0" ||
     !report.source.snapshot_token) {
    throw new Error("Existing financial activity or uncertified opening prevents fresh setup.");
  }
  return report.source.snapshot_token;
}
async function allAccounts(ctx:FreshFinanceSetupContext):Promise<ServerFinanceAccount[]>{
  const result:ServerFinanceAccount[]=[];
  const seen=new Set<string>();
  let after:string|null=null;
  for(let i=0;i<MAX_PAGES;i++){
    const raw=await call(ctx,"list_aqvora_accounts",{
      p_organization_id:ctx.organizationId,p_after_code:after,p_limit:PAGE_SIZE,
    });
    if(!Array.isArray(raw)||raw.length>PAGE_SIZE)throw new Error("Account list is incomplete.");
    for(const item of raw){
      const a=account(item,ctx);
      if(seen.has(a.code.toUpperCase())||
        (after!==null&&a.code.toUpperCase()<=after.toUpperCase())) {
        throw new Error("Account listing is duplicated or out of order.");
      }
      seen.add(a.code.toUpperCase());
      result.push(a);
      after=a.code;
    }
    if(raw.length<PAGE_SIZE)return result;
  }
  throw new Error("Account list exceeds staging safe page limit.");
}
async function allPeriods(ctx:FreshFinanceSetupContext):Promise<ServerFinancePeriod[]>{
  const result:ServerFinancePeriod[]=[];
  const seen=new Set<string>();
  let before:string|null=null;
  for(let i=0;i<MAX_PAGES;i++){
    const raw=await call(ctx,"list_aqvora_periods",{
      p_organization_id:ctx.organizationId,p_before_start:before,p_limit:PAGE_SIZE,
    });
    if(!Array.isArray(raw)||raw.length>PAGE_SIZE)throw new Error("Fiscal periods are incomplete.");
    for(const item of raw){
      const p=period(item,ctx);
      if(seen.has(p.id) || (before!==null&&p.starts_on>=before)){
        throw new Error("Period listing is duplicated or out of order.");
      }
      seen.add(p.id);
      result.push(p);
      before=p.starts_on;
    }
    if(raw.length<PAGE_SIZE)return result;
  }
  throw new Error("Fiscal periods exceed staging safe page limit.");
}
export async function loadFreshFinanceSetup(
  ctx:FreshFinanceSetupContext,
):Promise<FreshFinanceSetupSnapshot>{
  const sourceToken=await certifiedZero(ctx);
  const accounts=await allAccounts(ctx);
  const periods=await allPeriods(ctx);
  // Reload the certified source before displaying a "fresh" status. Between
  // page queries, another authorized user could post an entry.
  await certifiedZero(ctx);
  return {accounts,periods,certifiedZeroJournals:true,currency:ctx.currency,sourceToken};
}

export async function createFreshFinanceAccount(ctx:FreshFinanceSetupContext,
  input:{code:string;name:string;accountClass:AccountClass;normalSide:AccountSide},
):Promise<ServerFinanceAccount>{
  const code=input.code.trim(),name=input.name.trim();
  if(!ACCOUNT_CODE.test(code)||name.length<1||name.length>160||
      !CLASSES.has(input.accountClass)||
      !["debit","credit"].includes(input.normalSide)) {
    throw new Error("Enter a valid posting account code, name, class and normal side.");
  }
  await certifiedZero(ctx);
  // SQL owner-only RPC owns the insertion and immutable admin audit event.
  const saved=account(await call(ctx,"create_aqvora_account",{
    p_organization_id:ctx.organizationId,p_code:code,p_name:name,
    p_account_class:input.accountClass,p_normal_side:input.normalSide,
    p_parent_id:null,p_is_posting:true,
  }),ctx);
  if(saved.code!==code||saved.name!==name||
     saved.account_class!==input.accountClass||saved.normal_side!==input.normalSide||
     !saved.is_posting||!saved.is_active||saved.parent_id!==null) {
    throw new Error("Created financial account does not match the requested values.");
  }
  const durable=account(await call(ctx,"get_aqvora_account",{
    p_organization_id:ctx.organizationId,p_account_id:saved.id,
  }),ctx);
  if(JSON.stringify(durable)!==JSON.stringify(saved)) {
    throw new Error("Created financial account did not reconcile with its server receipt.");
  }
  return durable;
}
export async function createFreshFinancePeriod(ctx:FreshFinanceSetupContext,
  input:{startsOn:string;endsOn:string},
):Promise<ServerFinancePeriod>{
  if(!validBusinessDate(input.startsOn)||!validBusinessDate(input.endsOn)||
      input.startsOn>input.endsOn) {
    throw new Error("Select a valid non-reversed fiscal period.");
  }
  await certifiedZero(ctx);
  const saved=period(await call(ctx,"create_aqvora_period",{
    p_organization_id:ctx.organizationId,
    p_starts_on:input.startsOn,p_ends_on:input.endsOn,
  }),ctx);
  if(saved.starts_on!==input.startsOn||saved.ends_on!==input.endsOn||
     saved.state!=="open") {
    throw new Error("Created fiscal period does not match the requested dates.");
  }
  const durable=period(await call(ctx,"get_aqvora_period",{
    p_organization_id:ctx.organizationId,p_period_id:saved.id,
  }),ctx);
  if(JSON.stringify(durable)!==JSON.stringify(saved)) {
    throw new Error("Created fiscal period did not reconcile with its server receipt.");
  }
  return durable;
}
