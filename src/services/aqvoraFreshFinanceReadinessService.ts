/**
 * Read-only onboarding evidence for a NEW AQVORA V2 company.
 * A green checklist is NOT permission to activate the financial writer.
 * The trusted, atomic, new-company-only activation API in issue #99 is absent.
 */
import { getSupabaseClient, hasConfiguredCloudSession } from "../lib/supabase";
import { validateCurrencyUnitPolicy } from "../accounting/currencyReportEvidence";
import { isFreshFinanceSetupStagingEnabled, loadFreshFinanceSetup,
  type FreshFinanceSetupContext, type FreshFinanceSetupSnapshot,
} from "./aqvoraFreshFinanceSetupService";

export type ReadinessBlocker =
  | "NO_FISCAL_PERIOD" | "MULTIPLE_OPEN_PERIODS" | "OVERLAPPING_PERIODS"
  | "MISSING_ASSET" | "MISSING_EQUITY" | "MISSING_REVENUE"
  | "MISSING_EXPENSE" | "MISSING_LIABILITY" | "MISSING_COST_OF_SALES"
  | "CURRENCY_POLICY_UNCONFIGURED";

export interface FreshFinanceActivationReadiness {
  organizationId: string;
  currency: string;
  zeroFinancialHistoryCertified: true;
  sourceToken: string;
  currencyPolicyRevision: string | null;
  fiscalPeriods: number;
  postingAccounts: number;
  blockers: ReadinessBlocker[];
  checklistComplete: boolean;
  /** Always false until issue #99's independent server approval RPC exists. */
  activationPermitted: false;
  stage: "READ_ONLY_STAGING_PREFLIGHT";
}
const REQUIRED = [
  ["asset", "MISSING_ASSET"],
  ["equity", "MISSING_EQUITY"],
  ["liability", "MISSING_LIABILITY"],
  ["revenue", "MISSING_REVENUE"],
  ["expense", "MISSING_EXPENSE"],
  ["cost_of_sales", "MISSING_COST_OF_SALES"],
] as const;

function review(snapshot:FreshFinanceSetupSnapshot,
  ctx:FreshFinanceSetupContext,policyRevision:string|null,
):FreshFinanceActivationReadiness {
  if(!snapshot.certifiedZeroJournals || snapshot.currency!==ctx.currency ||
     !snapshot.sourceToken || snapshot.sourceToken.length!==64) {
    throw new Error("The fresh company zero-books source could not be certified.");
  }
  const blockers:ReadinessBlocker[]=[];
  if(snapshot.periods.length===0)blockers.push("NO_FISCAL_PERIOD");
  const ordered=[...snapshot.periods].sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
  if(ordered.some((p,index)=>index>0&&p.starts_on<=ordered[index-1].ends_on)) {
    blockers.push("OVERLAPPING_PERIODS");
  }
  if(snapshot.periods.filter(p=>p.state==="open").length!==1){
    blockers.push("MULTIPLE_OPEN_PERIODS");
  }
  const posting=snapshot.accounts.filter(a=>a.is_active&&a.is_posting);
  for(const [cls,code] of REQUIRED){
    if(!posting.some(a=>a.account_class===cls))blockers.push(code);
  }
  if(!policyRevision)blockers.push("CURRENCY_POLICY_UNCONFIGURED");
  return {
    organizationId:ctx.organizationId,currency:ctx.currency,
    zeroFinancialHistoryCertified:true,sourceToken:snapshot.sourceToken,
    currencyPolicyRevision:policyRevision,
    fiscalPeriods:snapshot.periods.length,postingAccounts:posting.length,
    blockers,checklistComplete:blockers.length===0,
    activationPermitted:false,stage:"READ_ONLY_STAGING_PREFLIGHT",
  };
}
async function currentOwner(ctx:FreshFinanceSetupContext){
  if(!isFreshFinanceSetupStagingEnabled() || ctx.ownerRole!=="OWNER" ||
      !ctx.isCloudAccount||ctx.isDemoMode || !ctx.organizationId||!ctx.userId ||
      !(await hasConfiguredCloudSession(ctx.userId))){
    throw new Error("Readiness check requires a verified isolated-staging company OWNER.");
  }
}
async function readPolicy(ctx:FreshFinanceSetupContext,atDate:string):Promise<string|null> {
  await currentOwner(ctx);
  const {data,error}=await getSupabaseClient().rpc("read_aqvora_currency_policy",{
    p_organization_id:ctx.organizationId,p_currency:ctx.currency,p_as_of_date:atDate,
  });
  if(error)throw error;
  await currentOwner(ctx);
  if(!data||typeof data!=="object"||Array.isArray(data)){
    throw new Error("Certified currency policy RPC returned no valid receipt.");
  }
  const p=data as Record<string,unknown>;
  if(p.contract_version!=="aqvora-currency-read-v1" ||
     p.organization_id!==ctx.organizationId ||
     p.transaction_currency!==ctx.currency ||
     p.ledger_currency!==ctx.currency || p.as_of_date!==atDate){
    throw new Error("Currency authority returned another company, currency or date.");
  }
  if(p.status==="unconfigured"&&p.display_complete===false&&p.policy===null){
    return null;
  }
  if(p.status!=="configured"||p.display_complete!==true){
    throw new Error("Currency authority returned an incomplete or contradictory policy.");
  }
  const policy=validateCurrencyUnitPolicy(p.policy,{
    organizationId:ctx.organizationId,currency:ctx.currency,asOfDate:atDate,
  });
  return policy.revision;
}

/** No mutation RPC, no direct access to enabled_companies, no guessed currency scale. */
export async function checkFreshFinanceActivationReadiness(
  ctx:FreshFinanceSetupContext,
):Promise<FreshFinanceActivationReadiness> {
  await currentOwner(ctx);
  const first=await loadFreshFinanceSetup(ctx); // independently certified zero V2 GL/TB
  // Every open period must be representable under the actual server currency
  // policy, or the checklist stays blocked; no invented unit exponent.
  const openPeriods=first.periods.filter(p=>p.state==="open");
  let revision:string|null=null;
  for(const period of openPeriods){
    const current=await readPolicy(ctx,period.starts_on);
    if(revision!==null&&current!==revision){
      throw new Error("Currency policy revisions changed across open fiscal periods.");
    }
    revision=current;
  }
  const second=await loadFreshFinanceSetup(ctx);
  if(JSON.stringify(second)!==JSON.stringify(first)){
    throw new Error("Finance setup changed during readiness check. Refresh and review.");
  }
  await currentOwner(ctx);
  return review(second,ctx,revision);
}
