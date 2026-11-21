import {useEffect,useRef,useState} from "react";
import type {InvoiceOpenBalance,CustomerReceipt} from "../../accounting/receiptContracts";
import type {VerifiedCashEvidence} from "../../accounting/verifiedCashCollection";
import type {VerifiedReceiptDetails} from "../../services/aqvoraCashReceiptReadService";
import {planCustomerReceiptAllocations} from "../../accounting/receiptDraftAllocations";
import {readPendingReceiptDraft,reservePendingReceiptDraft,clearPendingReceiptDraft,
  type PendingReceiptDraft} from "../../accounting/pendingReceiptDraft";
import {formatExactCurrencyMinor} from "../../accounting/formatExactCurrencyMinor";
import {useApp} from "../../context/AppContext";
import {useAuth} from "../../context/AuthContext";
import {loadIsolatedCashCollection,loadIsolatedCustomerReceipt} from "../../services/aqvoraCashReceiptReadService";
import {collectIsolatedOpenInvoices} from "../../services/aqvoraReceivablesReadService";
import {createIsolatedCustomerReceiptDraft,isIsolatedReceiptDraftEnabled,
  transitionIsolatedCustomerReceipt} from "../../services/aqvoraReceiptDraftService";
import type {IsolatedReceivablesContext} from "../../services/aqvoraReceivablesStagingGate";
import {enteredAllocations,ReceiptAllocationForm} from "./ReceiptAllocationForm";
import {ReceiptPostingPanel} from "./ReceiptPostingPanel";
import {CashReceiptWorkQueue} from "./CashReceiptWorkQueue";
import {isIsolatedReceiptQueueEnabled} from "../../services/aqvoraReceiptWorkQueues";

function businessToday(zone:string):string {
  try{
    const p=new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",
      month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const field=(name:string)=>p.find(a=>a.type===name)?.value??"";
    return `${field("year")}-${field("month")}-${field("day")}`;
  }catch{return "";}
}

export function CustomerReceiptDraftWorkspace(){
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const {setCurrentView}=useApp();
  const userId=user?.id??"";
  const enabled=isIsolatedReceiptDraftEnabled()&&isCloudAccount&&!isDemoMode&&
    Boolean(userId)&&(user?.role==="OWNER"||user?.role==="MANAGER");
  const today=businessToday(organization.timezone);
  const context:IsolatedReceivablesContext={
    organizationId:organization.id,userId,isCloudAccount,
    currency:organization.currency,asOfDate:today,
  };
  const [cashInput,setCashInput]=useState("");
  const [cash,setCash]=useState<VerifiedCashEvidence|null>(null);
  const [invoices,setInvoices]=useState<InvoiceOpenBalance[]>([]);
  const [allocations,setAllocations]=useState<Record<string,string>>({});
  const [receiptInput,setReceiptInput]=useState("");
  const [receipt,setReceipt]=useState<VerifiedReceiptDetails|null>(null);
  const [pending,setPending]=useState<PendingReceiptDraft|null>(null);
  const [recoveryFault,setRecoveryFault]=useState(false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [showQueue,setShowQueue]=useState(false);
  const generation=useRef(0);
  const inFlight=useRef(false);

  useEffect(()=>{
    ++generation.current;
    setCashInput("");setCash(null);setInvoices([]);setAllocations({});
    setReceiptInput("");setReceipt(null);setPending(null);setShowQueue(false);
    setRecoveryFault(false);setReason("");setError("");setNotice("");
    if(!enabled)return;
    try{
      const original=readPendingReceiptDraft(organization.id,userId);
      setPending(original);
      if(original)setCashInput(original.request.p_collection_id);
    }catch(cause){
      setRecoveryFault(true);
      setError(cause instanceof Error?cause.message:"Unsafe receipt draft recovery.");
    }
  },[enabled,organization.id,organization.currency,organization.timezone,userId,isCloudAccount]);

  const begin=()=>{
    setCash(null);setInvoices([]);setAllocations({});setReceipt(null);
    setError("");setNotice("");setReason("");
  };
  const inspectCash=async(selectedId?:string)=>{
    if(!enabled||inFlight.current||pending||recoveryFault)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);begin();
    try{
      const original=await loadIsolatedCashCollection(context,(selectedId??cashInput).trim());
      if(original.attestation!=="dual_control" || original.linkedPostedReceiptId!==null){
        throw new Error("Select confirmed, not-yet-posted manual cash evidence.");
      }
      const complete=await collectIsolatedOpenInvoices({
        ...context,customerId:original.collection.customer_id,
        asOfDate:original.collection.business_date,
      });
      if(!complete.complete||complete.source.authorized_user_id!==userId){
        throw new Error("Could not verify complete company/customer open invoices.");
      }
      if(token===generation.current){
        setCash(original);setInvoices(complete.invoices);
      }
    }catch(cause){
      if(token===generation.current)setError(cause instanceof Error?cause.message:"Cash source not verified.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const create=async()=>{
    if(!enabled||recoveryFault||inFlight.current)return;
    const token=generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const recovering=Boolean(pending);
      const original=pending??(()=>{
        if(!cash || cash.collection.created_by!==userId){
          throw new Error("Only the original cash maker can create a receipt draft.");
        }
        const request=planCustomerReceiptAllocations(
          cash.collection,invoices,enteredAllocations(allocations));
        return reservePendingReceiptDraft(
          organization.id,userId,cash.collection.id,request);
      })();
      setPending(original);
      const result=await createIsolatedCustomerReceiptDraft(context,original.request,{recoverExisting:recovering});
      clearPendingReceiptDraft(original);
      if(token===generation.current){
        setPending(null);setReceipt(result);setReceiptInput(result.receipt.id);
        setNotice(`Server confirmed original receipt source in ${result.receipt.state} state. This action did not post a journal.`);
      }
    }catch(cause){
      if(token===generation.current)setError((cause instanceof Error?cause.message:"Draft status unknown.")+
        " Resolve or retry the SAME stored creation intent; do not create another.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const inspectReceipt=async(selectedId?:string)=>{
    if(!enabled||pending||recoveryFault||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");setReceipt(null);
    try{
      const verified=await loadIsolatedCustomerReceipt(context,(selectedId??receiptInput).trim());
      if(token===generation.current)setReceipt(verified);
    }catch(cause){
      if(token===generation.current)setError(cause instanceof Error?cause.message:"Receipt source not verified.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const transition=async(action:"submit"|"approve"|"reject"|"cancel")=>{
    if(!receipt||pending||recoveryFault||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    const before=receipt.receipt;
    try{
      const result=await transitionIsolatedCustomerReceipt(context,{
        p_organization_id:organization.id,p_receipt_id:before.id,
        p_expected_revision:before.revision,p_action:action,
        p_reason:action==="reject"||action==="cancel"?reason.trim():null,
      });
      if(token===generation.current){
        setReceipt(result);setReason("");
        setNotice(`Server confirmed receipt ${action} at revision ${result.receipt.revision}. No Cash/AR posting.`);
      }
    }catch(cause){
      if(token===generation.current){
        setReceipt(null);
        setError((cause instanceof Error?cause.message:"Receipt transition outcome unknown.")+
          " Re-read this exact server receipt before any action. Never blindly retry.");
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  if(!enabled)return <div className="page-content space-y-3 p-5">
    <h1 className="text-xl font-semibold">Customer receipt drafts</h1>
    <p role="status" className="text-sm text-text-muted">
      Real V2 receipt creation and approval are disabled outside explicitly authorized isolated staging.
      Demo and existing Shop Pro books are not connected.
    </p>
  </div>;

  const record:CustomerReceipt|null=receipt?.receipt??null;
  const canSubmit=record?.state==="draft"&&record.created_by===userId;
  const canApprove=record?.state==="submitted"&&user?.role==="OWNER"&&record.created_by!==userId;
  const canReject=record?.state==="submitted"&&user?.role==="OWNER";
  const canCancel=record!==null&&record.state!=="posted"&&record.state!=="cancelled";
  return <div className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-1">
      <span className="text-xs font-bold text-primary">AQVORA V2 · ISOLATED STAGING ONLY</span>
      <h1 className="text-2xl font-semibold">Customer receipt allocation & approvals</h1>
      <p className="text-sm text-text-muted">Confirmed manual cash → complete open invoices → receipt draft →
        independent OWNER approval. No bank verification or financial posting on this route.</p>
      <button type="button" className="text-sm underline" onClick={()=>setCurrentView("aqvora-cash-collections")}>
        Open cash collection workspace
      </button>
      {isIsolatedReceiptQueueEnabled()&&<button type="button"
        aria-expanded={showQueue} onClick={()=>setShowQueue(v=>!v)}
        className="ml-3 rounded-lg border border-border-standard px-3 py-2 text-sm">
        {showQueue?"Hide work queue":"Browse company cash & receipts"}
      </button>}
    </header>
    {showQueue&&<CashReceiptWorkQueue mode="both" context={context}
      disabled={busy||Boolean(pending)||recoveryFault}
      onCashSelected={id=>{setCashInput(id);void inspectCash(id);}}
      onReceiptSelected={id=>{setReceiptInput(id);void inspectReceipt(id);}}/>}
    {error&&<p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border-standard p-3 text-sm">{notice}</p>}
    {recoveryFault&&<p role="alert" className="text-sm">Corrupt or unavailable original recovery data. New draft creation blocked.</p>}
    {pending&&<section role="status" className="space-y-2 rounded-xl border border-border-standard bg-surface-bright p-4">
      <h2 className="font-semibold">Original receipt draft intent is locked</h2>
      <p className="break-all font-mono text-xs">Cash collection {pending.request.p_collection_id}</p>
      <p className="text-xs text-text-muted">Network uncertainty is NOT permission for another receipt. Retry only the original stored UUID and amounts.</p>
      <button disabled={busy} type="button" onClick={()=>void create()}
        className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">Retry original receipt draft</button>
    </section>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
        <h2 className="font-semibold">1. Find independently confirmed cash</h2>
        <form onSubmit={event=>{event.preventDefault();void inspectCash();}} className="space-y-2">
          <label className="block text-sm">Original cash collection UUID
            <input aria-label="Original cash collection UUID" required value={cashInput}
              disabled={busy||Boolean(pending)||recoveryFault}
              onChange={event=>{setCashInput(event.target.value);begin();}}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <button disabled={busy||Boolean(pending)||recoveryFault} type="submit"
            className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">
            {busy?"Verifying…":"Load cash & complete open invoices"}
          </button>
        </form>
        {cash&&!receipt&&!pending&&cash.collection.created_by===userId&&
          <ReceiptAllocationForm cash={cash.collection} invoices={invoices}
            values={allocations} busy={busy} onAmount={(id,value)=>
              setAllocations(v=>({...v,[id]:value}))} onCreate={()=>void create()}/>}
        {cash&&cash.collection.created_by!==userId&&<p role="status" className="text-sm">
          Only the original cash maker may create this receipt draft. Another OWNER can approve later.
        </p>}
      </section>
      <section className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
        <h2 className="font-semibold">2. Review existing receipt</h2>
        <p className="text-xs text-text-muted">The independent checker can open the same receipt ID on another signed-in device.</p>
        <form onSubmit={event=>{event.preventDefault();void inspectReceipt();}} className="space-y-2">
          <label className="block text-sm">Customer receipt UUID
            <input aria-label="Customer receipt UUID" required value={receiptInput}
              disabled={busy||Boolean(pending)||recoveryFault}
              onChange={event=>{setReceiptInput(event.target.value);setReceipt(null);}}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
          </label>
          <button disabled={busy||Boolean(pending)||recoveryFault} type="submit"
            className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">Refresh SQL receipt</button>
        </form>
        {record&&<div className="space-y-3 border-t border-border-standard pt-3">
          <p className="text-sm">Status <strong>{record.state}</strong> · Revision {record.revision}</p>
          <p className="break-all font-mono text-xs">{record.id}</p>
          <p className="text-sm">{formatExactCurrencyMinor(record.amount_minor,organization.currency)} across {record.allocations.length} invoices</p>
          <p className="text-xs text-text-muted">Manual cash count only. Bank verified: NO. Approved is not posted or settled.</p>
          <ul className="space-y-1 text-xs">
            {record.allocations.map(a=><li key={a.invoice_id} className="break-all">
              {a.invoice_id} · {formatExactCurrencyMinor(a.amount_minor,organization.currency)}
            </li>)}
          </ul>
          {(canReject||canCancel)&&<label className="block text-sm">Required reason for reject/cancel
            <textarea aria-label="Receipt audit reason" maxLength={500} value={reason}
              onChange={event=>setReason(event.target.value)}
              className="mt-1 min-h-20 w-full rounded-lg border border-border-standard bg-surface-bright px-3 py-2"/>
          </label>}
          <div className="flex flex-wrap gap-2">
            {canSubmit&&<button disabled={busy} type="button" onClick={()=>void transition("submit")}
              className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">Submit for approval</button>}
            {canApprove&&<button disabled={busy} type="button" onClick={()=>void transition("approve")}
              className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">Approve as distinct OWNER</button>}
            {canReject&&<button disabled={busy||!reason.trim()} type="button" onClick={()=>void transition("reject")}
              className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">Reject to draft</button>}
            {canCancel&&<button disabled={busy||!reason.trim()} type="button" onClick={()=>void transition("cancel")}
              className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">Cancel unposted</button>}
          </div>
          {record.state==="approved"&&<p role="status" className="text-sm text-text-muted">
            Independently approved, but NOT posted. Posting remains separately locked behind staging, policy and financial authorization gates.
          </p>}
        </div>}
      </section>
    </div>
    <ReceiptPostingPanel context={context} actorRole={user?.role} sourceReceipt={record}/>
  </div>;
}
