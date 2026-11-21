import { useEffect, useRef, useState } from "react";
import type { CashCollection } from "../../accounting/receiptContracts";
import type { SalesCustomer } from "../../accounting/salesContracts";
import { validBusinessDate } from "../../accounting/minorUnits";
import {
  readPendingCashClaim, reservePendingCashClaim, clearPendingCashClaim,
  type PendingCashClaim,
} from "../../accounting/pendingCashClaim";
import { useAuth } from "../../context/AuthContext";
import { loadIsolatedSalesCustomers } from "../../services/aqvoraSalesCustomersReadService";
import {
  cancelIsolatedCashCollection, confirmIsolatedCashCollection,
  createIsolatedCashCollection, isIsolatedCashCollectionEnabled,
  loadCurrentIsolatedCash,
} from "../../services/aqvoraCashCollectionOperations";
import type { IsolatedReceivablesContext } from "../../services/aqvoraReceivablesStagingGate";
import { CashClaimCreateForm, CashClaimReviewPanel } from "./CashCollectionForms";

function businessToday(timezone:string):string {
  try {
    const p=new Intl.DateTimeFormat("en-US",{timeZone:timezone,
      year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const read=(key:string)=>p.find(x=>x.type===key)?.value??"";
    return `${read("year")}-${read("month")}-${read("day")}`;
  }catch{return "";}
}
export function CashCollectionWorkspace() {
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const userId=user?.id??"";
  const enabled=isIsolatedCashCollectionEnabled() && isCloudAccount && !isDemoMode &&
    Boolean(userId) && (user?.role==="OWNER"||user?.role==="MANAGER");
  const today=businessToday(organization.timezone);
  const [customers,setCustomers]=useState<SalesCustomer[]>([]);
  const [customersLoading,setCustomersLoading]=useState(false);
  const [customersError,setCustomersError]=useState("");
  const [customerId,setCustomerId]=useState("");
  const [date,setDate]=useState(today);
  const [amount,setAmount]=useState("");
  const [pending,setPending]=useState<PendingCashClaim|null>(null);
  const [recoveryFault,setRecoveryFault]=useState(false);
  const [sourceInput,setSourceInput]=useState("");
  const [source,setSource]=useState<CashCollection|null>(null);
  const [counted,setCounted]=useState("");
  const [attest,setAttest]=useState(false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const generation=useRef(0);
  const inFlight=useRef(false);
  const context:IsolatedReceivablesContext={
    organizationId:organization.id,userId,currency:organization.currency,
    asOfDate:today,isCloudAccount,
  };

  useEffect(()=>{
    const current=++generation.current;
    let active=true;
    setCustomers([]);setSource(null);setSourceInput("");setError("");setNotice("");
    setPending(null);setRecoveryFault(false);setCustomersError("");
    setCounted("");setAttest(false);setReason("");setAmount("");
    setDate(businessToday(organization.timezone));setCustomerId("");
    if(!enabled)return()=>{active=false;};
    try {
      const remembered=readPendingCashClaim(organization.id,userId);
      if(remembered){
        setPending(remembered);setCustomerId(remembered.request.p_customer_id);
        setDate(remembered.request.p_business_date);
        setAmount(remembered.request.p_amount_minor);
      }
    }catch(cause){
      setRecoveryFault(true);
      setError(cause instanceof Error?cause.message:"Unsafe original cash intent.");
    }
    setCustomersLoading(true);
    void loadIsolatedSalesCustomers({
      organizationId:organization.id,userId,currency:organization.currency,
      asOfDate:businessToday(organization.timezone),isCloudAccount,
    }).then(r=>{
      if(active&&generation.current===current)setCustomers(r.customers);
    }).catch(cause=>{
      if(active&&generation.current===current)setCustomersError(
        cause instanceof Error?cause.message:"Customer directory unavailable.");
    }).finally(()=>{
      if(active&&generation.current===current)setCustomersLoading(false);
    });
    return()=>{active=false;};
  },[enabled,organization.id,organization.currency,organization.timezone,userId,isCloudAccount]);

  const clearSource=()=>{
    setSource(null);setCounted("");setAttest(false);setReason("");
  };

  const create=async()=>{
    if(!enabled||recoveryFault||inFlight.current||customersLoading||(!pending&&customersError))return;
    if(!pending && (
        !customers.some(c=>c.id===customerId&&c.is_active) ||
        !validBusinessDate(date) || date>today ||
        !/^[1-9][0-9]*$/.test(amount) || amount.length>19 ||
        BigInt(amount)>9223372036854775807n)) {
      setError("Choose an active customer, valid business date and positive exact minor-unit amount.");
      return;
    }
    const token=generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const original=pending??reservePendingCashClaim(organization.id,userId,{
        p_organization_id:organization.id,p_customer_id:customerId,
        p_business_date:date,p_currency:organization.currency,
        p_amount_minor:amount,p_source_kind:"controlled_cash",
      });
      setPending(original);
      const result=await createIsolatedCashCollection(context,original.request);
      clearPendingCashClaim(original);
      if(token===generation.current){
        setPending(null);setSource(result.collection);
        setSourceInput(result.collection.id);
        setNotice("Cash claim saved by server. This is NOT manual cash confirmation, a posted receipt or bank deposit.");
      }
    }catch(cause){
      if(token===generation.current)setError((cause instanceof Error?cause.message:"Cash claim outcome uncertain.")+
        " Retry the EXACT original creation intent, not a new claim.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const inspect=async()=>{
    if(!enabled||inFlight.current||pending||recoveryFault)return;
    const id=sourceInput.trim();
    const token=generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");clearSource();
    try{
      const result=await loadCurrentIsolatedCash(context,id);
      if(token===generation.current)setSource(result.collection);
    }catch(cause){
      if(token===generation.current)setError(cause instanceof Error?cause.message:"Cash source unavailable.");
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  const changeStatus=async(action:"confirm"|"cancel")=>{
    if(!enabled||!source||inFlight.current||pending)return;
    const token=generation.current;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    const currentSource=source;
    try{
      const latest=await loadCurrentIsolatedCash(context,currentSource.id);
      if(latest.collection.revision!==currentSource.revision ||
         latest.collection.state!==currentSource.state) {
        throw new Error("Cash source changed; inspect the original claim again.");
      }
      const result=action==="confirm"?
        await confirmIsolatedCashCollection(context,latest.collection,{
          p_organization_id:organization.id,p_collection_id:latest.collection.id,
          p_expected_revision:latest.collection.revision,
          p_counted_minor:counted,p_attestation:"cash_counted_in_person",
        },user?.role??"")
        :await cancelIsolatedCashCollection(context,latest.collection,reason.trim(),user?.role??"");
      if(token===generation.current){
        setSource(result.collection);setAttest(false);setCounted("");setReason("");
        setNotice(action==="confirm"?
          "Different OWNER manually confirmed the cash count. No accounting receipt posted.":
          "Unconfirmed claim cancelled with server audit reason.");
      }
    }catch(cause){
      if(token===generation.current){
        clearSource();
        setError((cause instanceof Error?cause.message:"Cash operation status uncertain.")+
          " Reload the authoritative claim before another action; never blindly retry.");
      }
    }finally{
      inFlight.current=false;
      if(token===generation.current)setBusy(false);
    }
  };

  if(!enabled)return <div className="page-content space-y-2 p-5">
    <h1 className="text-xl font-semibold">Controlled cash collections</h1>
    <p role="status" className="text-sm text-text-muted">
      Staging-only cash operations are disabled for this environment or role.
      No demo, legacy or existing company cash workflow is activated.
    </p>
  </div>;

  return <div className="page-content space-y-5 p-4 sm:p-6">
    <header className="space-y-1">
      <span className="text-xs font-bold text-primary">CONTROLLED CASH · ISOLATED STAGING</span>
      <h1 className="text-2xl font-semibold">Cash collections</h1>
      <p className="text-sm text-text-muted">
        Cash claims and independent OWNER cash-count attestation only.
        A customer invoice is NOT paid until a separately approved customer receipt is posted.
      </p>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border-standard p-3 text-sm">{notice}</p>}
    {customersLoading&&<p role="status">Loading authorized customers…</p>}
    {customersError&&<p role="alert">{customersError}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <CashClaimCreateForm customers={customers} selectedCustomer={customerId}
        amount={amount} date={date} currency={organization.currency}
        busy={busy||customersLoading} locked={Boolean(pending)||recoveryFault} blocked={recoveryFault}
        onCustomer={setCustomerId} onAmount={setAmount} onDate={setDate}
        onCreate={()=>void create()}/>
      <section className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
        <h2 className="text-lg font-semibold">Inspect or confirm a claim</h2>
        <p className="text-xs text-text-muted">A second OWNER can inspect the original ID from another authenticated device.
          No source/receipt amount is accepted from an untrusted draft form.</p>
        <form aria-label="Find existing cash claim" className="space-y-2"
          onSubmit={event=>{event.preventDefault();void inspect();}}>
          <label className="block text-sm">Original collection UUID
            <input aria-label="Cash collection UUID" required value={sourceInput}
              disabled={busy||Boolean(pending)||recoveryFault}
              onChange={e=>{setSourceInput(e.target.value);clearSource();}}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3" />
          </label>
          <button type="submit" disabled={busy||Boolean(pending)||recoveryFault}
            className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">
            Inspect server source
          </button>
        </form>
        {pending&&<p role="status" className="text-xs text-text-muted">
          An original cash creation intent is locked. Use Retry original cash claim before inspecting or creating another source.
        </p>}
        {recoveryFault&&<p role="alert" className="text-xs">
          Stored source recovery requires investigation. New claims are blocked.
        </p>}
        {source&&<CashClaimReviewPanel source={source} currency={organization.currency}
          actorId={userId} actorRole={user?.role} busy={busy}
          counted={counted} attest={attest} reason={reason}
          onCounted={setCounted} onAttest={setAttest} onReason={setReason}
          onConfirm={()=>void changeStatus("confirm")}
          onCancel={()=>void changeStatus("cancel")} />}
      </section>
    </div>
  </div>;
}
