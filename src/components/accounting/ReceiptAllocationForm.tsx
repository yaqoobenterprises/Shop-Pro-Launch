import type {CashCollection,InvoiceOpenBalance,ReceiptAllocationInput} from "../../accounting/receiptContracts";
import {formatExactCurrencyMinor} from "../../accounting/formatExactCurrencyMinor";

export function ReceiptAllocationForm(props:{
  cash:CashCollection;invoices:InvoiceOpenBalance[];values:Record<string,string>;
  busy:boolean;onAmount:(id:string,amount:string)=>void;onCreate:()=>void;
}) {
  const {cash,invoices,values,busy,onAmount,onCreate}=props;
  const chosen=invoices.filter(row=>Boolean(values[row.invoice_id]?.trim()));
  let total=0n;
  let valid=true;
  for(const row of chosen){
    const v=values[row.invoice_id];
    if(!/^[1-9][0-9]*$/.test(v)||v.length>19){valid=false;continue;}
    const n=BigInt(v);
    if(n>BigInt(row.outstanding_minor)||n>9223372036854775807n)valid=false;
    total+=n;
  }
  const complete=valid&&chosen.length>=1&&chosen.length<=99&&
    total===BigInt(cash.amount_minor);
  return <form aria-label="Allocate confirmed cash to invoices" onSubmit={event=>{
    event.preventDefault();onCreate();
  }} className="space-y-4">
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">Allocate original cash</h2>
      <p className="text-sm text-text-muted">
        Controlled cash {cash.collection_number} · {formatExactCurrencyMinor(cash.amount_minor,cash.currency)}
      </p>
      <p className="text-xs text-text-muted">Only complete, certified V2 open invoices at the cash business date are selectable.
        A draft does not change outstanding AR.</p>
    </div>
    {invoices.length===0?<p role="status" className="text-sm">
      No eligible open invoices. The cash source cannot be allocated with this workflow.
    </p>:<div className="max-h-80 space-y-2 overflow-y-auto">
      {invoices.map(invoice=><label key={invoice.invoice_id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-standard p-3 text-sm">
        <span className="min-w-0">
          <span className="block break-all font-mono text-xs">{invoice.invoice_id}</span>
          <span className="text-xs text-text-muted">Outstanding: {formatExactCurrencyMinor(invoice.outstanding_minor,cash.currency)}</span>
        </span>
        <input aria-label={`Allocation minor units for invoice ${invoice.invoice_id}`}
          value={values[invoice.invoice_id]??""} disabled={busy}
          inputMode="numeric" pattern="[0-9]*" placeholder="Exact minor units"
          onChange={event=>onAmount(invoice.invoice_id,event.target.value)}
          className="min-h-11 w-40 max-w-full rounded-lg border border-border-standard bg-surface-bright px-3" />
      </label>)}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-standard pt-3 text-sm">
      <span>Selected {chosen.length} / 99 invoices</span>
      <strong>{formatExactCurrencyMinor(total.toString(),cash.currency)}</strong>
    </div>
    {!complete&&<p role="status" className="text-xs text-text-muted">
      Allocations must exactly equal the full confirmed cash amount; each invoice must have a positive amount within its verified outstanding balance.
    </p>}
    <button type="submit" disabled={busy||!complete}
      className="min-h-11 rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">
      Create server receipt draft
    </button>
  </form>;
}

export const enteredAllocations=(values:Record<string,string>):ReceiptAllocationInput[]=>
  Object.entries(values).filter(([,value])=>value.trim()!=="")
    .map(([invoice_id,amount_minor])=>({invoice_id,amount_minor}))
    .sort((a,b)=>a.invoice_id.localeCompare(b.invoice_id,"en"));
