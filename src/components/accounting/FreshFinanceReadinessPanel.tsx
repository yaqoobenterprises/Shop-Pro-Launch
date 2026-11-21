import {useEffect,useRef,useState} from "react";
import {ClipboardCheck,LockKeyhole,RefreshCw} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {
  checkFreshFinanceActivationReadiness,
  type FreshFinanceActivationReadiness,type ReadinessBlocker,
} from "../../services/aqvoraFreshFinanceReadinessService";
import {isFreshFinanceSetupStagingEnabled} from "../../services/aqvoraFreshFinanceSetupService";

const LABELS:Record<ReadinessBlocker,string>={
  NO_FISCAL_PERIOD:"Create a fiscal period",
  MULTIPLE_OPEN_PERIODS:"Exactly one open fiscal period is required for this review",
  OVERLAPPING_PERIODS:"Resolve overlapping company fiscal periods",
  MISSING_ASSET:"Create an active posting asset account",
  MISSING_EQUITY:"Create an active posting equity account",
  MISSING_LIABILITY:"Create an active posting liability account",
  MISSING_REVENUE:"Create an active posting revenue account",
  MISSING_EXPENSE:"Create an active posting expense account",
  MISSING_COST_OF_SALES:"Create an active posting cost-of-sales account",
  CURRENCY_POLICY_UNCONFIGURED:"Backend-approved currency unit policy is missing",
};

export function FreshFinanceReadinessPanel(){
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const ctx={
    organizationId:organization.id,userId:user?.id??"",
    ownerRole:user?.role,currency:organization.currency,
    isCloudAccount,isDemoMode,
  };
  const enabled=isFreshFinanceSetupStagingEnabled()&&isCloudAccount&&
    !isDemoMode&&ctx.ownerRole==="OWNER";
  const [state,setState]=useState<FreshFinanceActivationReadiness|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const serial=useRef(0);
  const identity=[ctx.organizationId,ctx.userId,ctx.currency,enabled].join("|");
  useEffect(()=>{
    const ref=serial;
    ++ref.current;
    setState(null);setError("");setBusy(false);
    return()=>{++ref.current;};
  },[identity]);
  const verify=async()=>{
    if(!enabled||busy)return;
    const generation=++serial.current;
    setBusy(true);setState(null);setError("");
    try {
      const result=await checkFreshFinanceActivationReadiness(ctx);
      if(serial.current===generation)setState(result);
    }catch(reason){
      if(serial.current===generation)setError(
        reason instanceof Error?reason.message:"Readiness cannot be certified.");
    }finally{
      if(serial.current===generation)setBusy(false);
    }
  };
  if(!enabled)return null;
  return <section className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4"
    aria-labelledby="fresh-readiness-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 id="fresh-readiness-heading" className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck size={18} aria-hidden="true"/> Finance readiness
        </h2>
        <p className="text-sm text-text-muted">
          Read-only verification of clean books, fiscal calendar,
          Chart of Accounts and backend-owned currency unit policy.
        </p>
      </div>
      <button type="button" disabled={busy} onClick={()=>void verify()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-standard px-4 text-sm disabled:opacity-40">
        <RefreshCw size={16} aria-hidden="true"/>
        {busy?"Verifying…":"Check readiness"}
      </button>
    </header>
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}
      {" "}A denied or incomplete source is never reported as zero.</p>}
    {state&&<div role="status" className="space-y-3">
      <p className="text-sm font-semibold">
        {state.checklistComplete?"Preflight checklist passed":"Setup needs attention"}
        {" "}· {state.postingAccounts} posting accounts · {state.fiscalPeriods} fiscal periods
      </p>
      <p className="text-xs text-text-muted">
        Exact company zero-financial-history source certified:
        <code className="ml-1 break-all">{state.sourceToken}</code>
      </p>
      <p className="text-sm text-text-muted">
        Approved currency policy: {state.currencyPolicyRevision
          ?"Revision "+state.currencyPolicyRevision:"Unavailable"}
      </p>
      {state.blockers.length>0&&<ul className="list-disc space-y-1 pl-5 text-sm">
        {state.blockers.map(code=><li key={code}>{LABELS[code]}</li>)}
      </ul>}
    </div>}
    <p className="flex items-start gap-2 text-xs text-text-muted">
      <LockKeyhole size={16} aria-hidden="true" className="shrink-0"/>
      Writer activation stays BLOCKED even when this checklist passes.
      Only the separate, audited backend enrollment in issue #99 can
      authorize a genuinely new company. This screen cannot activate posting.
    </p>
  </section>;
}
