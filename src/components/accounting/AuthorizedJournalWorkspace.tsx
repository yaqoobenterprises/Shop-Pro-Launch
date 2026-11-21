import {useEffect,useMemo,useRef,useState} from "react";
import {CheckCircle2,LockKeyhole,Plus,Trash2} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {formatExactCurrencyMinor} from "../../accounting/formatExactCurrencyMinor";
import {validBusinessDate} from "../../accounting/minorUnits";
import {
  clearPendingManualJournal,readPendingManualJournal,reserveManualJournal,
  validateManualJournalLines,type PendingManualJournal,
} from "../../accounting/pendingManualJournal";
import {
  isIsolatedManualJournalEnabled,loadIsolatedManualJournalSetup,
  makeManualJournalLine,postIsolatedManualJournal,recoverIsolatedManualJournal,
  type ManualJournalReceipt,type ManualJournalSetup,
} from "../../services/aqvoraManualJournalService";

type Row={id:number;account:string;side:"debit"|"credit";amount:string};
const blank=(id:number):Row=>({id,account:"",side:"debit",amount:""});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function AuthorizedJournalWorkspace(){
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const userId=user?.id??"";
  const role=user?.role;
  const enabled=isIsolatedManualJournalEnabled() && isCloudAccount &&
    !isDemoMode && role==="OWNER" && UUID.test(userId) &&
    UUID.test(organization.id);
  const ctx={organizationId:organization.id,userId,currency:organization.currency,
    isCloudAccount,isDemoMode,actorRole:role};
  const [setup,setSetup]=useState<ManualJournalSetup|null>(null);
  const [rows,setRows]=useState<Row[]>([blank(1),{...blank(2),side:"credit"}]);
  const nextId=useRef(2);
  const [date,setDate]=useState("");
  const [acknowledged,setAcknowledged]=useState(false);
  const [pending,setPending]=useState<PendingManualJournal|null>(null);
  const [posted,setPosted]=useState<ManualJournalReceipt|null>(null);
  const [recoveryFault,setRecoveryFault]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const inFlight=useRef(false);
  const generation=useRef(0);
  const identity=[organization.id,userId,organization.currency,role,enabled].join("|");

  const resetRows=()=>{
    nextId.current=2;
    setRows([blank(1),{...blank(2),side:"credit"}]);
    setAcknowledged(false);setDate("");
  };
  const refresh=async()=>{
    if(!enabled||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setLoading(true);setSetup(null);setError("");setNotice("");
    try{
      const result=await loadIsolatedManualJournalSetup(ctx);
      if(token===generation.current)setSetup(result);
    }catch(e){
      if(token===generation.current)setError(
        e instanceof Error?e.message:"Could not verify the chart and fiscal periods.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setLoading(false);
    }
  };
  useEffect(()=>{
    const ref=generation;
    ++ref.current;inFlight.current=false;
    setSetup(null);setPending(null);setPosted(null);setNotice("");
    setError("");setRecoveryFault(false);resetRows();
    if(enabled){
      let recoveryValid=true;
      try{setPending(readPendingManualJournal(organization.id,userId));}
      catch(e){
        recoveryValid=false;setRecoveryFault(true);
        setError(e instanceof Error?e.message:"Original journal recovery is invalid.");
      }
      if(recoveryValid)void refresh();
    }
    return()=>{++ref.current;};
  // Identity changes invalidate all prior company/actor asynchronous results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[identity]);

  const preview=useMemo(()=>{
    try{
      if(!validBusinessDate(date))throw new Error("Select a valid business date.");
      const lines=rows.map(row=>makeManualJournalLine(row.account,row.side,row.amount));
      const debit=lines.reduce((sum,row)=>sum+BigInt(row.debit_minor),0n);
      const credit=lines.reduce((sum,row)=>sum+BigInt(row.credit_minor),0n);
      validateManualJournalLines(lines);
      return {lines,error:"",debit:debit.toString(),credit:credit.toString()};
    }catch(e){
      return {lines:null,error:e instanceof Error?e.message:"Invalid journal.",
        debit:"0",credit:"0"};
    }
  },[rows,date]);
  const edit=(id:number,field:keyof Omit<Row,"id">,value:string)=>{
    if(pending||busy)return;
    setRows(current=>current.map(row=>row.id===id?{...row,[field]:value}:row));
    setAcknowledged(false);setNotice("");setPosted(null);
  };
  const post=async()=>{
    if(!enabled||inFlight.current||pending||recoveryFault||!acknowledged||
       !setup||!preview.lines)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    let original:PendingManualJournal|undefined;
    try{
      original=reserveManualJournal(organization.id,userId,organization.currency,
        date,preview.lines);
      if(token===generation.current)setPending(original);
      const result=await postIsolatedManualJournal(ctx,original);
      clearPendingManualJournal(original);
      if(token===generation.current){
        setPending(null);setPosted(result);
        setNotice("Immutable server journal and original posting receipt verified.");
        resetRows();
      }
    }catch(e){
      if(token===generation.current){
        setError((e instanceof Error?e.message:"Posting confirmation is uncertain.")+
          (original
            ?" Original intent retained. Recover the same receipt; never create another voucher."
            :" No journal submitted."));
        setAcknowledged(false);
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };
  const recover=async()=>{
    if(!enabled||!pending||inFlight.current||recoveryFault)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const recovered=await recoverIsolatedManualJournal(ctx,pending);
      clearPendingManualJournal(pending);
      if(token===generation.current){
        setPending(null);setPosted(recovered);
        setNotice("Original receipt recovered. No second posting attempted.");
        resetRows();
      }
    }catch(e){
      if(token===generation.current)setError(e instanceof Error?e.message:
        "Original journal cannot yet be confirmed. Keep this intent locked.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  if(!enabled)return <section role="status" className="page-content space-y-2 p-5">
    <h1 className="text-xl font-semibold">Manual journal posting</h1>
    <p className="text-sm text-text-muted">
      Disabled outside an approved isolated-staging OWNER MFA session.
      No legacy Cashbook or production posting.
    </p>
  </section>;
  const disabled=busy||loading||Boolean(pending)||recoveryFault||!setup;
  return <main className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-2">
      <span className="text-xs font-semibold text-primary">FRESH V2 · CONTROLLED STAGING</span>
      <h1 className="text-2xl font-semibold">Manual Journal Entry</h1>
      <p className="max-w-3xl text-sm text-text-muted">
        Record real accounting activity in exact integer minor units.
        No automatic openings or Cashbook import. Bank clearing is not verified.
        AR, AP, inventory and tax require separate source-controlled workflows.
      </p>
    </header>
    {loading&&<p role="status">Verifying chart and fiscal periods…</p>}
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
    {recoveryFault&&<p role="alert">Corrupt recovery data blocks financial posting.
      Contact the finance administrator; do not clear storage to bypass it.</p>}
    {pending&&<section role="status"
      className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <LockKeyhole size={18} aria-hidden="true"/> Original intent locked
      </h2>
      <p className="text-sm text-text-muted">
        An acknowledgement may have been lost. Recover only the original server
        receipt, never create a new key for this voucher.
      </p>
      <p className="break-all font-mono text-xs">{pending.request.intent_key}</p>
      <button type="button" disabled={busy||recoveryFault} onClick={()=>void recover()}
        className="min-h-11 rounded-lg border border-border-standard px-4 py-2 disabled:opacity-40">
        {busy?"Checking…":"Recover original receipt"}
      </button>
    </section>}
    {posted&&<section role="status" aria-label="Verified journal receipt"
      className="space-y-1 rounded-xl border border-border-standard bg-surface-bright p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="text-primary" size={18} aria-hidden="true"/>
        Server-verified journal posted
      </h2>
      <p className="break-all text-sm">Journal: <code>{posted.journal_id}</code></p>
      <p className="text-sm">Total: {formatExactCurrencyMinor(
        posted.total_minor,organization.currency)}</p>
      <p className="text-xs text-text-muted">Posted at {posted.posted_at}.
        Accounting receipt only; not proof of bank settlement.</p>
    </section>}
    <form aria-label="Manual journal posting" className="space-y-4"
      onSubmit={e=>{e.preventDefault();void post();}}>
      <section className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block min-w-48 text-sm">Business date
            <input type="date" required value={date} disabled={disabled}
              onChange={e=>{setDate(e.target.value);setAcknowledged(false);}}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <button type="button" onClick={()=>void refresh()}
            disabled={busy||loading||Boolean(pending)}
            className="min-h-11 rounded-lg border border-border-standard px-4 text-sm disabled:opacity-40">
            Refresh verified accounts
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <caption className="p-2 text-left text-xs text-text-muted">
              Each line uses one side in {organization.currency} minor units.
            </caption>
            <thead className="border-b border-border-standard"><tr>
              <th className="p-2" scope="col">Account</th>
              <th className="p-2" scope="col">Side</th>
              <th className="p-2" scope="col">Amount (minor units)</th>
              <th className="p-2" scope="col">Remove</th>
            </tr></thead>
            <tbody>{rows.map((row,index)=><tr key={row.id}
              className="border-b border-border-standard">
              <td className="p-2"><label className="sr-only"
                htmlFor={"acct-"+row.id}>Line {index+1} account</label>
                <select id={"acct-"+row.id} required value={row.account}
                  disabled={disabled} onChange={e=>edit(row.id,"account",e.target.value)}
                  className="min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-2">
                  <option value="">Select account</option>
                  {setup?.accounts.map(a=><option key={a.id} value={a.id}>
                    {a.code} · {a.name}</option>)}
                </select>
              </td>
              <td className="p-2"><label className="sr-only"
                htmlFor={"side-"+row.id}>Line {index+1} side</label>
                <select id={"side-"+row.id} value={row.side} disabled={disabled}
                  onChange={e=>edit(row.id,"side",e.target.value as Row["side"])}
                  className="min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-2">
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </td>
              <td className="p-2"><label className="sr-only"
                htmlFor={"minor-"+row.id}>Line {index+1} exact minor units</label>
                <input id={"minor-"+row.id} required inputMode="numeric"
                  pattern="[1-9][0-9]*" placeholder="10000"
                  value={row.amount} disabled={disabled}
                  onChange={e=>edit(row.id,"amount",e.target.value)}
                  className="min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3 tabular-nums"/>
              </td>
              <td className="p-2"><button type="button"
                aria-label={"Remove line "+(index+1)}
                disabled={disabled||rows.length<=2}
                onClick={()=>{setRows(old=>old.filter(r=>r.id!==row.id));
                  setAcknowledged(false);}}
                className="min-h-11 rounded-md border border-border-standard px-3 disabled:opacity-40">
                <Trash2 size={16} aria-hidden="true"/>
              </button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <button type="button" disabled={disabled||rows.length>=100}
          onClick={()=>{const id=++nextId.current;
            setRows(current=>[...current,blank(id)]);setAcknowledged(false);}}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-standard px-4 text-sm disabled:opacity-40">
          <Plus size={16} aria-hidden="true"/> Add journal line
        </button>
        <div aria-label="Journal balance" className="flex flex-wrap items-center gap-4 text-sm">
          <span>Debit: <strong>{preview.debit} minor</strong></span>
          <span>Credit: <strong>{preview.credit} minor</strong></span>
          {preview.lines?<span className="font-medium text-primary">Balanced</span>
            :<span role="status" className="text-text-muted">{preview.error}</span>}
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={acknowledged}
            disabled={disabled} onChange={e=>setAcknowledged(e.target.checked)}
            className="mt-1"/>
          I confirm this is a real business event with supporting evidence.
          Posting creates an immutable financial journal if the server permits it.
        </label>
        <button type="submit" disabled={disabled||!acknowledged||!preview.lines}
          className="min-h-11 rounded-lg bg-primary px-5 py-2 font-semibold text-white disabled:opacity-40">
          {busy?"Posting…":"Post verified journal"}
        </button>
      </section>
    </form>
    <p className="text-xs text-text-muted">
      Staging only. PostgreSQL enforces company membership, MFA, fiscal locks,
      currency, double entry and immutable receipts. No automatic retry or enrollment.
    </p>
  </main>;
}
