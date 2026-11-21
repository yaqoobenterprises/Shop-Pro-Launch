import {useEffect,useRef,useState} from "react";
import type {CashCollection,CustomerReceipt} from "../../accounting/receiptContracts";
import {formatExactCurrencyMinor} from "../../accounting/formatExactCurrencyMinor";
import type {IsolatedReceivablesContext} from "../../services/aqvoraReceivablesStagingGate";
import {
  isIsolatedReceiptQueueEnabled,loadIsolatedCashQueuePage,
  loadIsolatedReceiptQueuePage,type LiveReceiptQueuePage,
} from "../../services/aqvoraReceiptWorkQueues";

type Mode="cash"|"receipts"|"both";
type Props={
  mode:Mode;context:IsolatedReceivablesContext;
  disabled:boolean;
  onCashSelected?:(id:string)=>void;
  onReceiptSelected?:(id:string)=>void;
};
const errorText=(reason:unknown)=>reason instanceof Error
  ?reason.message:"Source list unavailable. Retry a fresh page.";

export function CashReceiptWorkQueue({
  mode,context,disabled,onCashSelected,onReceiptSelected,
}:Props){
  const {organizationId,userId,currency,asOfDate,isCloudAccount}=context;
  const enabled=isIsolatedReceiptQueueEnabled();
  const [cashPage,setCashPage]=useState<LiveReceiptQueuePage<CashCollection>|null>(null);
  const [receiptPage,setReceiptPage]=useState<LiveReceiptQueuePage<CustomerReceipt>|null>(null);
  const [cashLoading,setCashLoading]=useState(false);
  const [receiptLoading,setReceiptLoading]=useState(false);
  const [cashError,setCashError]=useState("");
  const [receiptError,setReceiptError]=useState("");
  const cashGeneration=useRef(0);
  const receiptGeneration=useRef(0);
  const cashFlight=useRef(false);
  const receiptFlight=useRef(false);

  useEffect(()=>{
    cashGeneration.current++;receiptGeneration.current++;
    setCashPage(null);setReceiptPage(null);
    setCashError("");setReceiptError("");
  },[enabled,organizationId,userId,currency,asOfDate,isCloudAccount]);

  const loadCash=async(next=false)=>{
    if(!enabled||disabled||cashFlight.current)return;
    const cursor=next&&cashPage?.hasPossibleMore?cashPage.nextAfterId:null;
    if(next&&!cursor)return;
    const serial=++cashGeneration.current;
    cashFlight.current=true;setCashLoading(true);setCashError("");
    setCashPage(null);
    try{
      const page=await loadIsolatedCashQueuePage(context,cursor);
      if(serial===cashGeneration.current)setCashPage(page);
    }catch(cause){
      if(serial===cashGeneration.current)setCashError(errorText(cause));
    }finally{
      cashFlight.current=false;
      if(serial===cashGeneration.current)setCashLoading(false);
    }
  };
  const loadReceipts=async(next=false)=>{
    if(!enabled||disabled||receiptFlight.current)return;
    const cursor=next&&receiptPage?.hasPossibleMore?receiptPage.nextAfterId:null;
    if(next&&!cursor)return;
    const serial=++receiptGeneration.current;
    receiptFlight.current=true;setReceiptLoading(true);setReceiptError("");
    setReceiptPage(null);
    try{
      const page=await loadIsolatedReceiptQueuePage(context,cursor);
      if(serial===receiptGeneration.current)setReceiptPage(page);
    }catch(cause){
      if(serial===receiptGeneration.current)setReceiptError(errorText(cause));
    }finally{
      receiptFlight.current=false;
      if(serial===receiptGeneration.current)setReceiptLoading(false);
    }
  };

  if(!enabled)return null;
  const fmt=(value:string)=>formatExactCurrencyMinor(value,currency);
  return <section aria-label="Authorized cash and customer receipt work queues"
    className="space-y-4 rounded-xl border border-border-standard bg-surface-bright p-4">
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">Finance work queue</h2>
      <p className="text-xs text-text-muted">
        Live company records only, not an accounting balance or fixed snapshot.
        Selecting a row always reloads authoritative source before any action.
      </p>
    </header>
    <div className="grid gap-4 lg:grid-cols-2">
      {(mode==="cash"||mode==="both")&&<div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Controlled cash claims</h3>
          <button type="button" disabled={disabled||cashLoading}
            className="min-h-10 rounded-lg border border-border-standard px-3 py-2 text-xs disabled:opacity-50"
            onClick={()=>void loadCash()}>Load / refresh</button>
        </div>
        {cashLoading&&<p role="status" className="text-sm">Loading company cash claims…</p>}
        {cashError&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{cashError}</p>}
        {cashPage&&<div className="space-y-2">
          {cashPage.rows.length===0&&<p role="status" className="text-sm text-text-muted">
            No cash claims on this live page.
          </p>}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {cashPage.rows.map(row=><div key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-standard p-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{row.collection_number} · {row.state}</p>
                <p className="text-xs text-text-muted">{row.business_date} · {fmt(row.amount_minor)}</p>
                <p className="break-all font-mono text-[11px] text-text-muted">{row.id}</p>
              </div>
              <button type="button" disabled={disabled||cashLoading||!onCashSelected}
                className="min-h-10 rounded-md border border-border-standard px-3 text-xs disabled:opacity-50"
                onClick={()=>onCashSelected?.(row.id)}>Inspect source</button>
            </div>)}
          </div>
          {cashPage.hasPossibleMore&&<button type="button"
            disabled={disabled||cashLoading} onClick={()=>void loadCash(true)}
            className="min-h-10 rounded-lg border border-border-standard px-3 text-xs disabled:opacity-50">
            Next live page
          </button>}
        </div>}
      </div>}
      {(mode==="receipts"||mode==="both")&&<div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Customer receipts</h3>
          <button type="button" disabled={disabled||receiptLoading}
            className="min-h-10 rounded-lg border border-border-standard px-3 py-2 text-xs disabled:opacity-50"
            onClick={()=>void loadReceipts()}>Load / refresh</button>
        </div>
        {receiptLoading&&<p role="status" className="text-sm">Loading company receipts…</p>}
        {receiptError&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{receiptError}</p>}
        {receiptPage&&<div className="space-y-2">
          {receiptPage.rows.length===0&&<p role="status" className="text-sm text-text-muted">
            No customer receipts on this live page.
          </p>}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {receiptPage.rows.map(row=><div key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-standard p-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{row.receipt_number??"Unposted receipt"} · {row.state}</p>
                <p className="text-xs text-text-muted">{row.business_date} · {fmt(row.amount_minor)}</p>
                <p className="break-all font-mono text-[11px] text-text-muted">{row.id}</p>
              </div>
              <button type="button" disabled={disabled||receiptLoading||!onReceiptSelected}
                className="min-h-10 rounded-md border border-border-standard px-3 text-xs disabled:opacity-50"
                onClick={()=>onReceiptSelected?.(row.id)}>Review source</button>
            </div>)}
          </div>
          {receiptPage.hasPossibleMore&&<button type="button"
            disabled={disabled||receiptLoading} onClick={()=>void loadReceipts(true)}
            className="min-h-10 rounded-lg border border-border-standard px-3 text-xs disabled:opacity-50">
            Next live page
          </button>}
        </div>}
      </div>}
    </div>
    <p className="text-xs text-text-muted">
      Cash counts are manually attested, not bank-cleared. A draft or approved
      receipt is not posted and cannot be presented as paid. Refresh to see later changes.
    </p>
  </section>;
}
