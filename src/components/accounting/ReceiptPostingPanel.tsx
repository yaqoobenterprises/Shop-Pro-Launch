import {useEffect,useRef,useState} from "react";
import type {CustomerReceipt,CustomerReceiptIssue} from "../../accounting/receiptContracts";
import {formatExactCurrencyMinor} from "../../accounting/formatExactCurrencyMinor";
import {
  clearPendingReceiptPosting,readPendingReceiptPosting,reserveReceiptPosting,
  type PendingReceiptPosting,
} from "../../accounting/pendingReceiptPosting";
import {loadIsolatedCustomerReceipt} from "../../services/aqvoraCashReceiptReadService";
import {
  isIsolatedReceiptPostingEnabled,postIsolatedCustomerReceipt,
  recoverOriginalCustomerReceiptPosting,
} from "../../services/aqvoraReceiptPostingService";
import type {IsolatedReceivablesContext} from "../../services/aqvoraReceivablesStagingGate";

export function ReceiptPostingPanel({context,actorRole,sourceReceipt}:{
  context:IsolatedReceivablesContext;
  actorRole:string|undefined;
  sourceReceipt:CustomerReceipt|null;
}){
  const {organizationId,userId,currency}=context;
  const enabled=isIsolatedReceiptPostingEnabled()&&context.isCloudAccount&&
    (actorRole==="OWNER"||actorRole==="MANAGER");
  const [receiptId,setReceiptId]=useState("");
  const [source,setSource]=useState<CustomerReceipt|null>(null);
  const [pending,setPending]=useState<PendingReceiptPosting|null>(null);
  const [acknowledged,setAcknowledged]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [posted,setPosted]=useState<CustomerReceiptIssue|null>(null);
  const [recoveryFault,setRecoveryFault]=useState(false);
  const generation=useRef(0);
  const inFlight=useRef(false);

  useEffect(()=>{
    ++generation.current;
    setSource(null);setPosted(null);setAcknowledged(false);setError("");
    setNotice("");setPending(null);setRecoveryFault(false);
    setReceiptId(sourceReceipt?.id??"");
    if(!enabled)return;
    try{
      const original=readPendingReceiptPosting(organizationId,userId);
      setPending(original);
      if(original)setReceiptId(original.request.p_receipt_id);
    }catch(cause){
      setRecoveryFault(true);
      setError(cause instanceof Error?cause.message:"Posting recovery data is corrupt.");
    }
  },[enabled,organizationId,userId,sourceReceipt?.id]);

  useEffect(()=>{
    if(pending||busy||!sourceReceipt?.id)return;
    // A successful immutable posting must not be overwritten by a stale
    // approved parent source when the original pending key is cleared.
    if(posted?.receipt_id===sourceReceipt.id)return;
    setReceiptId(sourceReceipt.id);
    setSource(sourceReceipt);
    setPosted(null);
  },[sourceReceipt,pending,busy,posted?.receipt_id]);

  const load=async()=>{
    if(!enabled||pending||recoveryFault||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setSource(null);setPosted(null);
    setError("");setNotice("");setAcknowledged(false);
    try{
      const verified=await loadIsolatedCustomerReceipt(context,receiptId.trim());
      if(token===generation.current)setSource(verified.receipt);
    }catch(cause){
      if(token===generation.current)setError(cause instanceof Error
        ?cause.message:"Could not verify approved receipt.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };
  const post=async()=>{
    if(!enabled||!source||!acknowledged||pending||recoveryFault||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      // Source is re-read a second time in the service before the SQL mutation.
      if(source.state!=="approved"||!source.fingerprint||
         source.created_by===source.approved_by){
        throw new Error("Receipt requires original independent OWNER approval.");
      }
      const original=reserveReceiptPosting(
        organizationId,userId,source.id,source.revision,source.fingerprint);
      setPending(original);
      const result=await postIsolatedCustomerReceipt(context,original.request);
      clearPendingReceiptPosting(original);
      if(token===generation.current){
        setPending(null);setSource(result.receipt);setPosted(result.issue);
        setAcknowledged(false);
        setNotice("Server-certified Cash/AR journal posted once. Bank verification is NOT available.");
      }
    }catch(cause){
      if(token===generation.current){
        setError((cause instanceof Error?cause.message:"Financial posting status uncertain.")+
          " Keep original intent locked. Recover its source receipt; never create another intent.");
        setAcknowledged(false);
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };
  const recover=async()=>{
    if(!enabled||!pending||recoveryFault||inFlight.current)return;
    const token=++generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const result=await recoverOriginalCustomerReceiptPosting(context,pending.request);
      clearPendingReceiptPosting(pending);
      if(token===generation.current){
        setPending(null);setSource(result.receipt);setPosted(result.issue);
        setNotice("Original immutable Cash/AR receipt recovered. No second posting attempted.");
      }
    }catch(cause){
      if(token===generation.current)setError(cause instanceof Error
        ?cause.message:"Original posting receipt unresolved.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  if(!enabled)return null;
  const canPost=source?.state==="approved"&&Boolean(source.fingerprint)&&
    source.created_by!==source.approved_by&&!pending&&!busy&&!recoveryFault;
  return <section aria-label="Customer receipt financial posting"
    className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">3. Post approved Cash / AR</h2>
      <p className="text-xs text-text-muted">
        Isolated staging only. Creates an immutable journal from a separately OWNER-approved
        controlled-cash source. NOT bank-cleared, not legacy, not a general payment gateway.
      </p>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {recoveryFault&&<p role="alert" className="text-sm">Recovery storage is invalid. No new posting permitted.</p>}
    {pending?<div role="status" className="space-y-2">
      <p className="font-semibold">Original financial intent locked</p>
      <p className="break-all font-mono text-xs">{pending.request.p_receipt_id}</p>
      <p className="text-sm">If acknowledgement was lost, only retrieve original posted receipt.
        A missing lookup is not permission to create a new key.</p>
      <button type="button" onClick={()=>void recover()} disabled={busy||recoveryFault}
        className="min-h-11 rounded-lg border border-border-standard px-4 py-2 disabled:opacity-50">
        Recover original posting
      </button>
    </div>:<form className="flex flex-wrap items-end gap-2" onSubmit={event=>{
      event.preventDefault();void load();
    }}>
      <label className="min-w-56 flex-1 text-sm">Approved receipt UUID
        <input required aria-label="Receipt to post" value={receiptId}
          disabled={busy||recoveryFault} onChange={event=>{
            setReceiptId(event.target.value);setSource(null);setAcknowledged(false);
          }} className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3"/>
      </label>
      <button type="submit" disabled={busy||recoveryFault}
        className="min-h-11 rounded-lg border border-border-standard px-4 py-2 disabled:opacity-50">
        Verify current source
      </button>
    </form>}
    {source&&<div className="space-y-2 border-t border-border-standard pt-3 text-sm">
      <p>Receipt {source.state} · revision {source.revision}</p>
      <p className="font-semibold">
        {formatExactCurrencyMinor(source.amount_minor,currency)}
      </p>
      <p>{source.allocations.length} invoice allocations · distinct OWNER checker required</p>
      {canPost&&<label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={acknowledged}
          onChange={event=>setAcknowledged(event.target.checked)} className="mt-1"/>
        <span>I understand this posts one immutable Dr Cash / Cr Accounts Receivable journal.
          Cash was manually attested; no bank deposit has been independently verified.</span>
      </label>}
      {canPost&&<button type="button" disabled={!acknowledged||busy}
        onClick={()=>void post()} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">
        Post verified receipt once
      </button>}
    </div>}
    {posted&&<div role="status" className="space-y-1 border-t border-border-standard pt-3 text-sm">
      <p className="font-semibold">Posted receipt: {posted.receipt_number}</p>
      <p className="break-all font-mono text-xs">Journal {posted.journal_id}</p>
      <p>Exact Dr Cash / Cr AR: {formatExactCurrencyMinor(posted.amount_minor,currency)}</p>
      <p className="text-xs text-text-muted">Bank verified: NO. Verify GL / Trial Balance separately.</p>
    </div>}
  </section>;
}
