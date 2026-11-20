import { useState } from "react";
import type { SalesCustomer } from "../../accounting/salesContracts";

interface CustomerFormProps {
  busy: boolean;
  locked: boolean;
  onCreate: (code:string,name:string)=>void;
}

export function SalesCustomerCreateForm({busy,locked,onCreate}:CustomerFormProps) {
  const [code,setCode]=useState("");
  const [name,setName]=useState("");
  return (
    <form aria-label="Create V2 customer" className="space-y-3" onSubmit={e=>{
      e.preventDefault();onCreate(code,name);
    }}>
      <h2 className="text-lg font-semibold">Create customer</h2>
      <p className="text-xs text-text-muted">Company-scoped directory. Same code and name safely retry; changes after an uncertain response are blocked.</p>
      <label className="block text-sm">Customer code
        <input aria-label="Customer code" required maxLength={32}
          pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,31}"
          disabled={locked||busy} value={code} onChange={e=>setCode(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3" />
      </label>
      <label className="block text-sm">Customer name
        <input aria-label="Customer name" required maxLength={160}
          disabled={locked||busy} value={name} onChange={e=>setName(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3" />
      </label>
      <button type="submit" disabled={busy}
        className="rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy?"Saving…":locked?"Retry identical customer request":"Save customer"}
      </button>
    </form>
  );
}

export interface ServiceDraftFormValues {
  customerId:string;businessDate:string;dueDate:string;
  description:string;quantityMillionths:string;
  unitPriceMinor:string;discountMinor:string;
}
interface DraftFormProps {
  customers:SalesCustomer[];
  busy:boolean;
  locked:boolean;
  initialDate:string;
  onCreate:(value:ServiceDraftFormValues)=>void;
}

export function ServiceInvoiceDraftCreateForm({
  customers,busy,locked,initialDate,onCreate,
}:DraftFormProps) {
  const [customerId,setCustomerId]=useState("");
  const [businessDate,setBusinessDate]=useState(initialDate);
  const [dueDate,setDueDate]=useState(initialDate);
  const [description,setDescription]=useState("");
  const [quantityMillionths,setQuantityMillionths]=useState("1000000");
  const [unitPriceMinor,setUnitPriceMinor]=useState("");
  const [discountMinor,setDiscountMinor]=useState("0");
  const disabled=busy||locked;
  return (
    <form aria-label="Create V2 service invoice draft" className="space-y-3"
      onSubmit={e=>{
        e.preventDefault();
        onCreate({customerId,businessDate,dueDate,description:description.trim(),
          quantityMillionths,unitPriceMinor,discountMinor});
      }}>
      <h2 className="text-lg font-semibold">Service invoice draft</h2>
      <p className="text-xs text-text-muted">
        Creates a draft only. No tax, inventory, journal posting or customer debt is created.
        Amount inputs use exact source minor units. Quantity: 1000000 = one service unit.
      </p>
      <label className="block text-sm">Customer
        <select aria-label="Draft customer" required disabled={disabled}
          value={customerId} onChange={e=>setCustomerId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3">
          <option value="">Select an active customer</option>
          {customers.filter(c=>c.is_active).map(c=>(
            <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Invoice business date
          <input aria-label="Invoice business date" required type="date" disabled={disabled}
            value={businessDate} onChange={e=>setBusinessDate(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3"/>
        </label>
        <label className="block text-sm">Due date
          <input aria-label="Invoice due date" required type="date" disabled={disabled}
            value={dueDate} onChange={e=>setDueDate(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3"/>
        </label>
      </div>
      <label className="block text-sm">Service description
        <input aria-label="Service description" required maxLength={500}
          disabled={disabled} value={description} onChange={e=>setDescription(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3"/>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {name:"Quantity (millionths)",value:quantityMillionths,set:setQuantityMillionths},
          {name:"Unit price (minor units)",value:unitPriceMinor,set:setUnitPriceMinor},
          {name:"Discount (minor units)",value:discountMinor,set:setDiscountMinor},
        ].map(field=>(
          <label key={field.name} className="block text-sm">{field.name}
            <input aria-label={field.name} required inputMode="numeric"
              pattern="[0-9]+" disabled={disabled} value={field.value}
              onChange={e=>field.set(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-border-standard bg-surface-bright px-3"/>
          </label>
        ))}
      </div>
      <button type="submit" disabled={busy||customers.every(c=>!c.is_active)}
        className="rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">
        {busy?"Saving draft…":locked?"Retry identical invoice intent":"Save draft only"}
      </button>
    </form>
  );
}
