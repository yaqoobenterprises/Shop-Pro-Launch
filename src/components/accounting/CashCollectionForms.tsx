import type { SalesCustomer } from "../../accounting/salesContracts";
import type { CashCollection } from "../../accounting/receiptContracts";
import { formatExactCurrencyMinor } from "../../accounting/formatExactCurrencyMinor";

interface CreateProps {
  customers:SalesCustomer[]; selectedCustomer:string; amount:string; date:string;
  currency:string;busy:boolean;locked:boolean;onCustomer:(v:string)=>void;
  onAmount:(v:string)=>void;onDate:(v:string)=>void;onCreate:()=>void;
}
export function CashClaimCreateForm(p:CreateProps) {
  return <form aria-label="Create controlled cash claim"
    className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4"
    onSubmit={event=>{event.preventDefault();p.onCreate();}}>
    <h2 className="text-lg font-semibold">Record cash received</h2>
    <p className="text-xs text-text-muted">
      Stage 1: this creates an unconfirmed cash claim, not a bank deposit,
      posted cash account or settled customer invoice.
    </p>
    <label className="block text-sm">Customer
      <select required aria-label="Cash customer" disabled={p.busy||p.locked}
        value={p.selectedCustomer} onChange={e=>p.onCustomer(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3">
        <option value="">Select customer</option>
        {p.customers.filter(c=>c.is_active).map(c=>
          <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
      </select>
    </label>
    <label className="block text-sm">Business date
      <input aria-label="Cash business date" type="date" required
        disabled={p.busy||p.locked} value={p.date} onChange={e=>p.onDate(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3" />
    </label>
    <label className="block text-sm">Amount ({p.currency} exact minor units)
      <input aria-label="Cash amount in minor units" required inputMode="numeric"
        pattern="[1-9][0-9]*" disabled={p.busy||p.locked} value={p.amount}
        onChange={e=>p.onAmount(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3" />
    </label>
    <button type="submit" disabled={p.busy || p.customers.every(c=>!c.is_active)}
      className="rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">
      {p.busy?"Saving…":p.locked?"Retry original cash claim":"Save unconfirmed cash claim"}
    </button>
  </form>;
}

interface ReviewProps {
  source:CashCollection; currency:string;actorId:string;actorRole:string|undefined;
  busy:boolean;counted:string;attest:boolean;reason:string;
  onCounted:(v:string)=>void;onAttest:(v:boolean)=>void;onReason:(v:string)=>void;
  onConfirm:()=>void;onCancel:()=>void;
}
export function CashClaimReviewPanel(p:ReviewProps) {
  const v=p.source;
  const fmt=(amount:string)=>formatExactCurrencyMinor(amount,p.currency);
  const canConfirm=v.state==="draft"&&p.actorRole==="OWNER"&&v.created_by!==p.actorId;
  const canCancel=v.state==="draft"&&(p.actorRole==="OWNER"||v.created_by===p.actorId);
  return <section aria-label="Controlled cash evidence"
    className="space-y-3 rounded-xl border border-border-standard bg-surface-bright p-4">
    <h2 className="text-lg font-semibold">Cash collection {v.collection_number}</h2>
    <p className="break-all font-mono text-xs text-text-muted">{v.id}</p>
    <div className="grid gap-2 sm:grid-cols-2 text-sm">
      <p>Company cash claim: <strong>{fmt(v.amount_minor)}</strong></p>
      <p>Status: <strong>{v.state}</strong> · Revision {v.revision}</p>
      <p>Business date: {v.business_date}</p>
      <p>Cash maker: <span className="font-mono text-xs">{v.created_by.slice(0,8)}…</span></p>
    </div>
    <p role="status" className="rounded-lg bg-surface-container-low p-3 text-xs">
      {v.state==="confirmed"
        ?"A distinct OWNER manually attested the exact cash count."
        :"Cash is not independently confirmed or recorded in a financial journal by this claim."}
      {" "}Bank verification is NOT available.
    </p>
    {v.posted_receipt_id&&<p className="break-all text-xs">
      Linked posted receipt ID: <span className="font-mono">{v.posted_receipt_id}</span>
    </p>}
    {canConfirm&&(
      <form aria-label="Independent cash confirmation" className="space-y-3"
        onSubmit={e=>{e.preventDefault();p.onConfirm();}}>
        <h3 className="font-semibold">Independent OWNER cash count</h3>
        <label className="block text-sm">Personally counted amount (minor units)
          <input required inputMode="numeric" pattern="[1-9][0-9]*"
            aria-label="Personally counted amount" disabled={p.busy} value={p.counted}
            onChange={e=>p.onCounted(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3"/>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" disabled={p.busy} checked={p.attest}
            onChange={e=>p.onAttest(e.target.checked)} />
          I personally counted this exact cash amount in person; I am not the original maker.
        </label>
        <button type="submit" disabled={p.busy||!p.attest||p.counted!==v.amount_minor}
          className="rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50">
          Confirm manual cash count
        </button>
      </form>
    )}
    {canCancel&&(
      <form aria-label="Cancel unconfirmed cash claim" className="space-y-2 border-t border-border-standard pt-3"
        onSubmit={e=>{e.preventDefault();p.onCancel();}}>
        <label className="block text-sm">Cancellation reason (unconfirmed claims only)
          <textarea aria-label="Cash cancellation reason" maxLength={500} required
            disabled={p.busy} value={p.reason} onChange={e=>p.onReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-border-standard bg-surface-bright p-3" rows={2}/>
        </label>
        <button type="submit" disabled={p.busy||!p.reason.trim()}
          className="rounded-lg border border-border-standard px-4 py-3 disabled:opacity-50">
          Cancel unconfirmed cash claim
        </button>
      </form>
    )}
  </section>;
}
