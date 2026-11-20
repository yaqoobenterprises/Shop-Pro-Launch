import { useEffect, useRef, useState } from "react";
import type {
  CreateSalesDraftRequest, SalesCustomer, SalesInvoice,
} from "../../accounting/salesContracts";
import { formatExactCurrencyMinor } from "../../accounting/formatExactCurrencyMinor";
import { validBusinessDate } from "../../accounting/minorUnits";
import { useAuth } from "../../context/AuthContext";
import { loadIsolatedSalesCustomers } from "../../services/aqvoraSalesCustomersReadService";
import {
  createIsolatedSalesCustomer, createIsolatedServiceInvoiceDraft,
  isIsolatedSalesDraftCreationEnabled,
} from "../../services/aqvoraStagingSalesDraftService";
import type { IsolatedReceivablesContext } from "../../services/aqvoraReceivablesStagingGate";
import {
  SalesCustomerCreateForm, ServiceInvoiceDraftCreateForm,
  type ServiceDraftFormValues,
} from "./SalesDraftForms";

function todayInZone(zone:string):string {
  try {
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:zone,
      year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const find=(type:string)=>parts.find(x=>x.type===type)?.value??"";
    return `${find("year")}-${find("month")}-${find("day")}`;
  } catch { return ""; }
}

export function SalesDraftsWorkspace() {
  const {organization,user,isCloudAccount,isDemoMode}=useAuth();
  const enabled=isIsolatedSalesDraftCreationEnabled() &&
    isCloudAccount && !isDemoMode && Boolean(user?.id) &&
    (user?.role==="OWNER" || user?.role==="MANAGER");
  const userId=user?.id??"";
  const [customers,setCustomers]=useState<SalesCustomer[]>([]);
  const [directoryError,setDirectoryError]=useState("");
  const [loadingCustomers,setLoadingCustomers]=useState(false);
  const [pendingCustomer,setPendingCustomer]=useState<{code:string;name:string}|null>(null);
  const [pendingDraft,setPendingDraft]=useState<CreateSalesDraftRequest|null>(null);
  const [customerBusy,setCustomerBusy]=useState(false);
  const [draftBusy,setDraftBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [savedDraft,setSavedDraft]=useState<SalesInvoice|null>(null);
  const [formVersion,setFormVersion]=useState(0);
  const generation=useRef(0);
  const operationInFlight=useRef(false);

  const context:IsolatedReceivablesContext={
    organizationId:organization.id,userId,
    currency:organization.currency,asOfDate:todayInZone(organization.timezone),
    isCloudAccount,
  };

  useEffect(()=>{
    const current=++generation.current;
    let active=true;
    setCustomers([]);setSavedDraft(null);setPendingCustomer(null);
    setPendingDraft(null);setError("");setNotice("");setDirectoryError("");
    setFormVersion(v=>v+1);
    if(!enabled)return()=>{active=false;};
    setLoadingCustomers(true);
    void loadIsolatedSalesCustomers({
      organizationId:organization.id,userId,
      currency:organization.currency,asOfDate:todayInZone(organization.timezone),
      isCloudAccount,
    }).then(result=>{
      if(active&&generation.current===current)setCustomers(result.customers);
    }).catch(reason=>{
      if(active&&generation.current===current){
        setDirectoryError(reason instanceof Error?reason.message:"Customer directory is unavailable.");
      }
    }).finally(()=>{
      if(active&&generation.current===current)setLoadingCustomers(false);
    });
    return()=>{active=false;};
  },[enabled,organization.id,organization.currency,organization.timezone,userId,isCloudAccount]);

  const createCustomer=async(code:string,name:string)=>{
    if(operationInFlight.current)return;
    const previous=pendingCustomer;
    const request=previous??{code:code.trim(),name:name.trim()};
    if (!previous && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(request.code) ||
        !request.name || request.name.length>160)) {
      setError("Enter a valid code and customer name.");return;
    }
    const identity=generation.current;
    operationInFlight.current=true;
    setPendingCustomer(request);setCustomerBusy(true);setError("");setNotice("");
    try {
      const saved=await createIsolatedSalesCustomer(context,request);
      if(identity!==generation.current)return;
      setPendingCustomer(null);
      setCustomers(existing=>[...existing.filter(c=>c.id!==saved.id),saved]
        .sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0));
      setNotice(`Customer ${saved.code} saved in isolated staging.`);
    }catch(reason) {
      if(identity===generation.current)setError(reason instanceof Error
        ? reason.message:"Customer save was not confirmed; retry identical request.");
    }finally {
      operationInFlight.current=false;
      if(identity===generation.current)setCustomerBusy(false);
    }
  };

  const createDraft=async(values:ServiceDraftFormValues)=>{
    if(operationInFlight.current)return;
    let request=pendingDraft;
    if(!request) {
      const canonical=/^(0|[1-9][0-9]*)$/;
      if(!validBusinessDate(values.businessDate) ||
          !validBusinessDate(values.dueDate) ||
          values.dueDate<values.businessDate ||
          !/^[1-9][0-9]*$/.test(values.quantityMillionths) ||
          !/^[1-9][0-9]*$/.test(values.unitPriceMinor) ||
          !canonical.test(values.discountMinor) ||
          !values.description || values.description.length>500) {
        setError("Correct invoice dates, description, quantities and exact minor-unit amounts.");
        return;
      }
      const gross=(BigInt(values.quantityMillionths)*BigInt(values.unitPriceMinor)+500000n)/1000000n;
      if(gross<=0n || gross>9223372036854775807n ||
         BigInt(values.discountMinor)>=gross) {
        setError("Discount must be below line gross, and amount within signed BIGINT.");
        return;
      }
      if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function") {
        setError("Secure idempotency-key generation is unavailable.");return;
      }
      request={
        p_organization_id:organization.id,p_intent_key:crypto.randomUUID(),
        p_customer_id:values.customerId,p_business_date:values.businessDate,
        p_due_date:values.dueDate,p_currency:organization.currency,
        p_lines:[{
          description:values.description,quantity_millionths:values.quantityMillionths,
          unit_price_minor:values.unitPriceMinor,discount_minor:values.discountMinor,
        }],
      };
    }
    const identity=generation.current;
    operationInFlight.current=true;
    setPendingDraft(request);setDraftBusy(true);setError("");setNotice("");
    try {
      const saved=await createIsolatedServiceInvoiceDraft(context,request);
      if(identity!==generation.current)return;
      setPendingDraft(null);
      setSavedDraft(saved);
      setNotice(`Source returned in ${saved.state} state. The draft creation RPC does not post journals.`);
    }catch(reason) {
      if(identity===generation.current)setError(reason instanceof Error
        ? reason.message:"Draft request uncertain; retry original intent.");
    }finally {
      operationInFlight.current=false;
      if(identity===generation.current)setDraftBusy(false);
    }
  };

  if(!enabled)return (
    <div className="page-content p-5 space-y-3">
      <h1 className="text-xl font-semibold">Service invoice drafts</h1>
      <p role="status" className="text-text-muted text-sm">
        Staging-only draft mutations are disabled. This route is unavailable in demo,
        existing business projects, and without a cloud OWNER/MANAGER session.
      </p>
    </div>
  );

  return (
    <div className="page-content space-y-5 p-4 sm:p-6">
      <header className="space-y-1">
        <span className="text-xs font-bold text-primary">AQVORA V2 · ISOLATED STAGING</span>
        <h1 className="text-2xl font-semibold text-on-surface">Customers & service invoice drafts</h1>
        <p className="text-sm text-text-muted">Source-backed draft workflows only. Journal posting,
          tax, inventory and payments are not available on this page.</p>
      </header>
      {error&&<p role="alert" className="rounded-lg border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">
        {error} {pendingDraft||pendingCustomer?"The original request is retained for safe exact retry.":""}
      </p>}
      {notice&&<p role="status" className="rounded-lg border border-border-standard p-3 text-sm">{notice}</p>}
      {directoryError&&<p role="alert">{directoryError} — no cached customer fallback.</p>}
      {loadingCustomers&&<p role="status">Loading authorized customers…</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border-standard bg-surface-bright p-4">
          <SalesCustomerCreateForm busy={customerBusy||draftBusy}
            locked={Boolean(pendingCustomer)} onCreate={(code,name)=>void createCustomer(code,name)}/>
        </section>
        <section className="rounded-xl border border-border-standard bg-surface-bright p-4">
          {savedDraft?(
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Saved source draft</h2>
              <p className="break-all font-mono text-xs">{savedDraft.id}</p>
              <p>Server state: {savedDraft.state} · Revision: {savedDraft.revision}</p>
              <p>Face: {formatExactCurrencyMinor(savedDraft.face_minor,organization.currency)}</p>
              <p className="text-xs text-text-muted">No AR, cash or revenue posting was triggered by draft creation.</p>
              <button type="button" onClick={()=>{
                setSavedDraft(null);setFormVersion(v=>v+1);
              }} className="rounded-lg border border-border-standard px-4 py-3">
                Create another draft
              </button>
            </div>
          ):(
            <ServiceInvoiceDraftCreateForm key={formVersion} customers={customers}
              initialDate={todayInZone(organization.timezone)}
              busy={customerBusy||draftBusy} locked={Boolean(pendingDraft)}
              onCreate={values=>void createDraft(values)}/>
          )}
        </section>
      </div>
    </div>
  );
}
