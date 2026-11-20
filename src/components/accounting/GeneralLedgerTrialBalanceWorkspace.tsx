import { useEffect, useRef, useState } from "react";
import type { AccountingReadAccount } from "../../accounting/readContracts";
import type { GeneralLedgerRead } from "../../accounting/verifiedGeneralLedger";
import type { VerifiedTrialBalance } from "../../accounting/verifiedTrialBalance";
import { useAuth } from "../../context/AuthContext";
import {
  isIsolatedVerifiedFinancialReadEnabled,
  loadIsolatedVerifiedGeneralLedger, loadIsolatedVerifiedTrialBalance,
} from "../../services/aqvoraVerifiedFinancialReadService";
import { listIsolatedPostingAccounts } from "../../services/aqvoraPostingAccountsReadService";
import { GLTBReportPanel } from "./GLTBReportPanel";

type Mode="gl"|"tb";
interface Result{
  key:string; mode:Mode; data:GeneralLedgerRead|VerifiedTrialBalance;
}

function companyToday(zone:string){
  try {
    const parts=new Intl.DateTimeFormat("en-US",{
      timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",
    }).formatToParts(new Date());
    const get=(name:string)=>parts.find(x=>x.type===name)?.value??"";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }catch{return "";}
}

export function GeneralLedgerTrialBalanceWorkspace(){
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const userId=user?.id??"";
  const enabled=isIsolatedVerifiedFinancialReadEnabled() &&
    isCloudAccount && !isDemoMode && Boolean(userId) &&
    (user?.role==="OWNER"||user?.role==="MANAGER");
  const [mode,setMode]=useState<Mode>("tb");
  const [from,setFrom]=useState(()=>companyToday(organization.timezone).slice(0,7)+"-01");
  const [to,setTo]=useState(()=>companyToday(organization.timezone));
  const [accountId,setAccountId]=useState("");
  const [accounts,setAccounts]=useState<AccountingReadAccount[]>([]);
  const [accountsLoading,setAccountsLoading]=useState(false);
  const [accountsError,setAccountsError]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const accountGeneration=useRef(0);
  const reportGeneration=useRef(0);
  const requestKey=[organization.id,userId,organization.currency,from,to,mode,accountId].join("|");
  const displayed=result?.key===requestKey?result:null;

  useEffect(()=>{
    let alive=true;
    setAccounts([]);setAccountId("");setAccountsError("");setError("");
    setResult(null);setFrom(companyToday(organization.timezone).slice(0,7)+"-01");
    setTo(companyToday(organization.timezone));
    const token=++accountGeneration.current;
    ++reportGeneration.current;
    if(!enabled)return()=>{alive=false;};
    setAccountsLoading(true);
    void listIsolatedPostingAccounts({
      organizationId:organization.id,userId,isCloudAccount,
    }).then(value=>{
      if(alive&&accountGeneration.current===token)setAccounts(value);
    }).catch(reason=>{
      if(alive&&accountGeneration.current===token) {
        setAccountsError(reason instanceof Error?reason.message:"Chart of Accounts unavailable.");
      }
    }).finally(()=>{
      if(alive&&accountGeneration.current===token)setAccountsLoading(false);
    });
    return()=>{alive=false;};
  },[enabled,organization.id,organization.currency,organization.timezone,userId,isCloudAccount]);

  const invalidate=()=>{
    ++reportGeneration.current;
    setResult(null);setError("");setLoading(false);
  };

  const run=async()=>{
    if(!enabled||!userId)return;
    const current=++reportGeneration.current;
    setResult(null);setError("");setLoading(true);
    const key=requestKey;
    const context={
      organizationId:organization.id,userId,isCloudAccount,
      currency:organization.currency,fromDate:from,toDate:to,
    };
    try{
      const data=mode==="tb"
        ?await loadIsolatedVerifiedTrialBalance(context,{pageSize:100,maxPages:100})
        :await loadIsolatedVerifiedGeneralLedger({
          ...context,accountId,
        },{pageSize:100,maxPages:100});
      if(current===reportGeneration.current)setResult({key,mode,data});
    }catch(reason){
      if(current===reportGeneration.current)setError(reason instanceof Error
        ?reason.message:"Verified finance source unavailable.");
    }finally{
      if(current===reportGeneration.current)setLoading(false);
    }
  };

  if(!enabled)return <div className="page-content space-y-2 p-5">
    <h1 className="text-xl font-semibold">Certified V2 financial reads</h1>
    <p role="status" className="text-sm text-text-muted">
      Disabled outside an explicitly approved isolated staging environment and
      authenticated OWNER/MANAGER cloud session. No legacy or sample finance fallback.
    </p>
  </div>;

  return <div className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-2">
      <span className="text-xs font-bold text-primary">CERTIFIED V2 · ISOLATED STAGING</span>
      <h1 className="text-2xl font-semibold">General Ledger & Trial Balance</h1>
      <p className="text-sm text-text-muted">
        Real source-backed journal reads. Exact integer minor units; legacy openings excluded.
        No financial posting from these screens.
      </p>
    </header>
    <div role="group" aria-label="Financial report type" className="flex flex-wrap gap-2">
      {([
        ["tb","Trial Balance"],["gl","General Ledger"],
      ] as const).map(([id,label])=>(
        <button key={id} type="button" aria-pressed={mode===id}
          onClick={()=>{invalidate();setMode(id);}}
          className={`rounded-lg border px-4 py-3 text-sm font-semibold
            ${mode===id?"bg-primary text-white":"border-border-standard bg-surface-bright"}`}>
          {label}
        </button>
      ))}
    </div>
    <form aria-label="V2 financial report filters" onSubmit={event=>{
      event.preventDefault();void run();
    }} className="flex flex-wrap items-end gap-3 rounded-xl border border-border-standard bg-surface-bright p-4">
      {mode==="gl"&&(
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Posting account
          <select aria-label="Posting account" required value={accountId}
            disabled={accountsLoading||Boolean(accountsError)}
            onChange={e=>{invalidate();setAccountId(e.target.value);}}
            className="min-h-11 rounded-md border border-border-standard bg-surface-bright px-3">
            <option value="">Select posting account</option>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        From
        <input type="date" aria-label="From" required value={from}
          onChange={e=>{invalidate();setFrom(e.target.value);}}
          className="min-h-11 rounded-md border border-border-standard bg-surface-bright px-3"/>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        To
        <input type="date" aria-label="To" required value={to}
          min={from} onChange={e=>{invalidate();setTo(e.target.value);}}
          className="min-h-11 rounded-md border border-border-standard bg-surface-bright px-3"/>
      </label>
      <button type="submit" disabled={loading||accountsLoading||Boolean(accountsError)||
          (mode==="gl"&&!accountId)||!from||!to||from>to}
        className="min-h-11 rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">
        {loading?"Certifying…":"Load certified report"}
      </button>
    </form>
    {accountsLoading&&<p role="status">Loading authorized posting accounts…</p>}
    {accountsError&&<p role="alert">{accountsError}</p>}
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {displayed&&<GLTBReportPanel currency={organization.currency}
      mode={displayed.mode} report={displayed.data}/>}
  </div>;
}
