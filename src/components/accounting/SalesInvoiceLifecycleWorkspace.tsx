import { useEffect, useRef, useState } from "react";
import type { SalesInvoice, SalesTransitionRequest } from "../../accounting/salesContracts";
import {
  clearPendingSalesIssue, loadPendingSalesIssue, reserveSalesIssue,
  type PendingSalesIssue,
} from "../../accounting/pendingSalesIssue";
import { useAuth } from "../../context/AuthContext";
import {
  isIsolatedInvoiceIssueEnabled, isIsolatedInvoiceLifecycleEnabled,
  issueIsolatedSalesInvoice, loadIsolatedSalesInvoice, lookupIsolatedSalesIssue,
  transitionIsolatedSalesInvoice,
} from "../../services/aqvoraSalesLifecycleService";
import type { IsolatedReceivablesContext } from "../../services/aqvoraReceivablesStagingGate";
import { SalesLifecycleActions } from "./SalesLifecycleActions";

const reviewKey=(org:string,user:string)=>`aqvora:invoice-review:${org}:${user}`;
function companyToday(timezone:string):string {
  try {
    const p=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",
      month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const get=(name:string)=>p.find(x=>x.type===name)?.value??"";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch { return ""; }
}

export function SalesInvoiceLifecycleWorkspace() {
  const { organization, user, isCloudAccount, isDemoMode }=useAuth();
  const userId=user?.id??"";
  const enabled=isIsolatedInvoiceLifecycleEnabled() && isCloudAccount && !isDemoMode &&
    Boolean(userId) && (user?.role==="OWNER" || user?.role==="MANAGER");
  const [invoiceInput,setInvoiceInput]=useState("");
  const [invoice,setInvoice]=useState<SalesInvoice|null>(null);
  const [pending,setPending]=useState<PendingSalesIssue|null>(null);
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const generation=useRef(0);
  const inFlight=useRef(false);
  const today=companyToday(organization.timezone);
  const context:IsolatedReceivablesContext={
    organizationId:organization.id,userId,isCloudAccount,
    currency:organization.currency,asOfDate:today,
  };

  useEffect(()=>{
    ++generation.current;
    setInvoice(null);setError("");setNotice("");setConfirmed(false);
    if (!enabled) { setInvoiceInput("");setPending(null); return; }
    try{
      const original=loadPendingSalesIssue(organization.id,userId);
      setPending(original);
      setInvoiceInput(original?.invoiceId ??
        sessionStorage.getItem(reviewKey(organization.id,userId)) ?? "");
    }catch(reason){
      setInvoiceInput("");setPending(null);
      setError(reason instanceof Error?reason.message:"Original issuance recovery is unsafe.");
    }
  },[enabled,organization.id,userId]);

  const load=async()=>{
    if(inFlight.current || !enabled)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");setInvoice(null);
    try{
      const verified=await loadIsolatedSalesInvoice(context,invoiceInput.trim());
      if(token===generation.current){
        if(pending && pending.invoiceId!==verified.id){
          throw new Error("Resolve original pending financial issuance before opening another invoice.");
        }
        setInvoice(verified);
        setConfirmed(false);
      }
    }catch(reason){
      if(token===generation.current)setError(reason instanceof Error
        ?reason.message:"Invoice could not be verified.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const transition=async(action:SalesTransitionRequest["p_action"])=>{
    if(!invoice||inFlight.current||pending)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    const snapshot=invoice;
    try{
      const result=await transitionIsolatedSalesInvoice(context,{
        p_organization_id:organization.id,p_invoice_id:snapshot.id,
        p_expected_revision:snapshot.revision,p_action:action,
        p_reason:action==="reject"||action==="cancel"?reason.trim():null,
      });
      if(token===generation.current){
        setInvoice(result);setReason("");setConfirmed(false);
        setNotice(`Server confirmed ${action}; revision ${result.revision}. No duplicate retry.`);
      }
    }catch(reason){
      if(token===generation.current){
        setInvoice(null);
        setError((reason instanceof Error?reason.message:"Transition status unknown.")+
          " Refresh the original invoice before any further action; never blindly retry.");
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const issue=async()=>{
    if(!invoice||pending||inFlight.current||!confirmed||!isIsolatedInvoiceIssueEnabled())return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      if(!invoice.fingerprint)throw new Error("Approved fingerprint missing.");
      const original=reserveSalesIssue(organization.id,userId,invoice.id,
        invoice.revision,invoice.fingerprint);
      setPending(original);
      const result=await issueIsolatedSalesInvoice(context,{
        p_organization_id:organization.id,p_invoice_id:invoice.id,
        p_expected_revision:original.revision,p_fingerprint:original.fingerprint,
        p_intent_key:original.intentKey,
      });
      clearPendingSalesIssue(original);
      if(token===generation.current){
        setPending(null);setInvoice(result.invoice);setConfirmed(false);
        setNotice("The server confirmed one issued journal. Verify AR / GL / TB separately.");
      }
    }catch(reason){
      if(token===generation.current){
        setError((reason instanceof Error?reason.message:"Issue response unknown.")+
          " Do not create a new posting intent; recover the original receipt.");
        setConfirmed(false);
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const recover=async()=>{
    if(!pending||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const result=await lookupIsolatedSalesIssue(context,pending.intentKey);
      if(result.status!=="found"){
        throw new Error("Original receipt remains unresolved. Escalate to finance admin; do not issue again.");
      }
      if(result.invoice.id!==pending.invoiceId ||
          result.receipt.fingerprint!==pending.fingerprint ||
          result.receipt.source_revision!==pending.revision) {
        throw new Error("Recovered receipt does not match original approved source.");
      }
      clearPendingSalesIssue(pending);
      if(token===generation.current){
        setPending(null);setInvoice(result.invoice);
        setNotice("Original issue receipt recovered; no second financial posting.");
      }
    }catch(reason){
      if(token===generation.current)setError(reason instanceof Error
        ?reason.message:"Receipt recovery failed; original intent remains locked.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  if(!enabled)return <div className="page-content space-y-3 p-5">
    <h1 className="text-xl font-semibold">Service invoice approvals</h1>
    <p role="status" className="text-sm text-text-muted">
      Lifecycle mutations are disabled. They require isolated staging, cloud OWNER/MANAGER,
      live AAL2 authorization and a separate explicit lifecycle flag.
    </p>
  </div>;

  return <div className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-1">
      <span className="text-xs font-bold text-primary">ISOLATED STAGING · VERIFIED SOURCE</span>
      <h1 className="text-2xl font-semibold">Service invoice approval & issuance</h1>
      <p className="text-sm text-text-muted">Maker submits; different OWNER approves.
        Issue posting remains separately disabled until verified finance policy and enrollment.</p>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border-standard p-3 text-sm">{notice}</p>}
    <form aria-label="Find verified invoice" className="flex flex-wrap items-end gap-3"
      onSubmit={event=>{event.preventDefault();void load();}}>
      <label className="min-w-52 flex-1 text-sm">Company invoice UUID
        <input aria-label="Company invoice UUID" required value={invoiceInput}
          disabled={busy||Boolean(pending)} onChange={event=>setInvoiceInput(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
      </label>
      <button type="submit" disabled={busy||Boolean(pending)}
        className="min-h-11 rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
        {busy?"Verifying…":"Load original source"}
      </button>
    </form>
    {pending&&(
      <div role="status" className="space-y-2 rounded-xl border border-border-standard p-4">
        <p className="font-semibold">Original financial issue intent is locked</p>
        <p className="text-xs break-all font-mono">{pending.invoiceId}</p>
        <p className="text-sm">If the reply was lost, only recover the durable issue.
          A missing receipt is not permission to create a new key.</p>
        <button type="button" disabled={busy} onClick={()=>void recover()}
          className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
          Recover original issuance receipt
        </button>
      </div>
    )}
    {invoice&&(
      <SalesLifecycleActions invoice={invoice} actorId={userId} actorRole={user?.role}
        issueEnabled={isIsolatedInvoiceIssueEnabled()} busy={busy}
        pendingRecovery={Boolean(pending)}
        reason={reason} confirmed={confirmed} onReason={setReason} onConfirmed={setConfirmed}
        onTransition={action=>void transition(action)}
        onIssue={()=>void issue()} onRecover={()=>void recover()}/>
    )}
  </div>;
}
