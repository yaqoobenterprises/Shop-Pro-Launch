import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, RefreshCw } from "lucide-react";
import type { AccountClass, AccountSide } from "../../accounting/types";
import { useAuth } from "../../context/AuthContext";
import {
  createFreshFinanceAccount, createFreshFinancePeriod,
  isFreshFinanceSetupStagingEnabled, loadFreshFinanceSetup,
  type FreshFinanceSetupSnapshot,
} from "../../services/aqvoraFreshFinanceSetupService";

const CLASSES: {name:string;value:AccountClass}[]=[
  {name:"Assets",value:"asset"},
  {name:"Liabilities",value:"liability"},
  {name:"Equity",value:"equity"},
  {name:"Revenue",value:"revenue"},
  {name:"Cost of Sales",value:"cost_of_sales"},
  {name:"Expenses",value:"expense"},
  {name:"Other Income",value:"other_income"},
  {name:"Other Expense",value:"other_expense"},
];
const normal=(cls:AccountClass):AccountSide=>
  ["asset","cost_of_sales","expense","other_expense"].includes(cls)
    ?"debit":"credit";

export function FreshFinanceSetupWorkspace() {
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const userId=user?.id??"";
  const ownerRole=user?.role;
  const enabled=isFreshFinanceSetupStagingEnabled()&&isCloudAccount&&
    !isDemoMode&&ownerRole==="OWNER"&&Boolean(userId)&&Boolean(organization.id);
  const ctx={
    organizationId:organization.id,userId,ownerRole,currency:organization.currency,
    isCloudAccount,isDemoMode,
  };
  const [snapshot,setSnapshot]=useState<FreshFinanceSetupSnapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [code,setCode]=useState("");
  const [name,setName]=useState("");
  const [accountClass,setClass]=useState<AccountClass>("asset");
  const [normalSide,setSide]=useState<AccountSide>("debit");
  const [periodStart,setPeriodStart]=useState("");
  const [periodEnd,setPeriodEnd]=useState("");
  const sequence=useRef(0);
  const lock=useRef(false);

  const refresh=useCallback(async()=>{
    const token=++sequence.current;
    setLoading(true);setError("");setNotice("");setSnapshot(null);
    try {
      const result=await loadFreshFinanceSetup(ctx);
      if(sequence.current===token) setSnapshot(result);
    } catch (reason) {
      if(sequence.current===token) setError(
        reason instanceof Error?reason.message:"Fresh books could not be certified.",
      );
    } finally {
      if(sequence.current===token)setLoading(false);
    }
  // Re-load when company, identity or explicit staging capability changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ctx.organizationId,ctx.userId,ctx.ownerRole,ctx.currency,
      ctx.isCloudAccount,ctx.isDemoMode,enabled]);

  useEffect(()=>{
    setSnapshot(null);setError("");setNotice("");
    if(enabled)void refresh();
    // Capture the ref object in the effect scope for safe async cleanup.
    const sequenceRef=sequence;
    return()=>{sequenceRef.current+=1;};
  },[enabled,refresh]);

  const execute=async(work:()=>Promise<unknown>,message:string)=>{
    if(!enabled||!snapshot||lock.current)return;
    const token=++sequence.current;
    lock.current=true;setBusy(true);setError("");setNotice("");
    setSnapshot(null);
    try {
      await work();
      // Never treat a successful mutation response as proof that the full
      // remote state is current: re-read all organization/account evidence.
      const latest=await loadFreshFinanceSetup(ctx);
      // Ignore responses from the previous account/company after a switch.
      if(sequence.current===token){
        setSnapshot(latest);
        setNotice(message);
      }
    }catch(reason){
      if(sequence.current===token){
        setError((reason instanceof Error?reason.message:"Server save could not be verified.")+
          " The action may have committed; refresh before attempting it again.");
      }
    }finally{lock.current=false;setBusy(false);}
  };

  if(!enabled)return <section className="page-content space-y-2 p-5" role="status">
    <h1 className="text-xl font-semibold">Fresh AQVORA Finance Setup</h1>
    <p className="text-sm text-text-muted">
      Only an authenticated company OWNER in approved isolated staging can create
      a verified new Chart of Accounts or fiscal period. Production remains disabled.
    </p>
  </section>;

  return <main className="page-content space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <span className="text-xs font-bold text-primary">FRESH V2 · ISOLATED STAGING</span>
        <h1 className="text-2xl font-semibold">New Company Finance Setup</h1>
        <p className="text-sm text-text-muted">
          Start with an empty ledger. Add account definitions and fiscal periods only.
          No opening money, journal, old Cashbook import or writer activation is created.
        </p>
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-standard px-4 py-2 disabled:opacity-40">
        <RefreshCw size={16} aria-hidden="true"/> Refresh verified source
      </button>
    </header>
    {loading&&<p role="status">Checking current owner permissions and certified zero books…</p>}
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
    {snapshot&&<section aria-label="Fresh company evidence"
      className="space-y-2 rounded-xl border border-border-standard bg-surface-bright p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} aria-hidden="true" className="text-primary"/>
        <strong>Certified 0 posted journals · {snapshot.currency}</strong>
      </div>
      <p className="text-xs text-text-muted">
        This source is explicitly company-scoped and excludes legacy Cashbook.
        Money remains zero until a separately authorized financial posting.
      </p>
      <p className="break-all font-mono text-xs text-text-muted">
        Source evidence: {snapshot.sourceToken}
      </p>
    </section>}
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="fresh-chart-heading"
        className="space-y-4 rounded-xl border border-border-standard bg-surface-bright p-4">
        <div>
          <h2 id="fresh-chart-heading" className="text-lg font-semibold">Chart of Accounts</h2>
          <p className="text-xs text-text-muted">Every account belongs to this company; amounts are never seeded.</p>
        </div>
        <form className="space-y-3" onSubmit={event=>{
          event.preventDefault();
          void execute(()=>createFreshFinanceAccount(ctx,{
            code,name,accountClass,normalSide,
          }),"Account created and independently re-read.");
        }}>
          <label className="block text-sm">Account code
            <input required maxLength={32} value={code} onChange={e=>setCode(e.target.value)}
              placeholder="1010" disabled={!snapshot||busy}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <label className="block text-sm">Account name
            <input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}
              placeholder="Operating Bank" disabled={!snapshot||busy}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <label className="block text-sm">Account class
            <select value={accountClass} disabled={!snapshot||busy}
              onChange={e=>{const cls=e.target.value as AccountClass;
                setClass(cls);setSide(normal(cls));}}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3">
              {CLASSES.map(a=><option key={a.value} value={a.value}>{a.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Normal balance side
            <select value={normalSide} disabled={!snapshot||busy}
              onChange={e=>setSide(e.target.value as AccountSide)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3">
              <option value="debit">Debit</option><option value="credit">Credit</option>
            </select>
          </label>
          <button type="submit" disabled={!snapshot||busy||!code.trim()||!name.trim()}
            className="min-h-11 rounded-lg bg-primary px-5 py-2 font-semibold text-white disabled:opacity-40">
            Create verified account
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="p-2 text-left text-xs text-text-muted">
              {snapshot?.accounts.length??0} source-confirmed accounts
            </caption>
            <thead><tr><th className="p-2" scope="col">Code</th>
              <th className="p-2" scope="col">Name</th>
              <th className="p-2" scope="col">Class</th></tr></thead>
            <tbody>{snapshot?.accounts.map(a=><tr key={a.id}
              className="border-t border-border-standard">
              <td className="p-2 font-mono">{a.code}</td>
              <td className="p-2">{a.name}</td>
              <td className="p-2">{a.account_class.replaceAll("_"," ")}</td>
            </tr>)}
              {snapshot&&snapshot.accounts.length===0&&
                <tr><td colSpan={3} className="p-3 text-text-muted">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="fresh-period-heading"
        className="space-y-4 rounded-xl border border-border-standard bg-surface-bright p-4">
        <div>
          <h2 id="fresh-period-heading" className="text-lg font-semibold">Fiscal Periods</h2>
          <p className="text-xs text-text-muted">
            Dates must not overlap. Only the server can certify and create periods.
          </p>
        </div>
        <form className="space-y-3" onSubmit={event=>{
          event.preventDefault();
          void execute(()=>createFreshFinancePeriod(ctx,{
            startsOn:periodStart,endsOn:periodEnd,
          }),"Fiscal period created and independently re-read.");
        }}>
          <label className="block text-sm">Period begins
            <input required type="date" value={periodStart} disabled={!snapshot||busy}
              onChange={e=>setPeriodStart(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <label className="block text-sm">Period ends
            <input required type="date" min={periodStart} value={periodEnd}
              disabled={!snapshot||busy} onChange={e=>setPeriodEnd(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <button type="submit" disabled={!snapshot||busy||!periodStart||!periodEnd||periodStart>periodEnd}
            className="min-h-11 rounded-lg bg-primary px-5 py-2 font-semibold text-white disabled:opacity-40">
            Create verified period
          </button>
        </form>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Fiscal calendar</h3>
          {snapshot?.periods.map(p=><div key={p.id}
            className="flex flex-wrap justify-between gap-2 rounded-lg border border-border-standard p-3 text-sm">
            <span>{p.starts_on} – {p.ends_on}</span>
            <span className="capitalize text-primary">{p.state}</span>
          </div>)}
          {snapshot&&snapshot.periods.length===0&&
            <p className="text-sm text-text-muted">No fiscal periods yet.</p>}
        </div>
      </section>
    </div>
    <p className="flex items-start gap-2 text-xs text-text-muted">
      <LockKeyhole size={15} aria-hidden="true" className="shrink-0"/>
      Creating accounts or periods does not activate the financial writer.
      All monetary transactions require a separate MFA-authorized server workflow.
      This is not a live production release.
    </p>
  </main>;
}
