import {useState} from "react";
import {ArrowRight,CheckCircle2,Clock3,FileText,LockKeyhole,
  Search,ShieldCheck,Wallet} from "lucide-react";
import type {ErpReviewPage} from "./erpPreviewPages";
import {demoTotals,sampleCustomers,sampleInvoices,samplePKR,
  sampleReceipt} from "./erpSampleScenario";

type Props={page:ErpReviewPage;onNavigate:(p:ErpReviewPage)=>void};
const notes:Partial<Record<ErpReviewPage,{title:string,subtitle:string}>>={
  purchases:{title:"Purchases & Payables",subtitle:"Purchase orders, supplier invoices, approvals and payments"},
  inventory:{title:"Inventory & POS",subtitle:"Stock movements, costing, point of sale and reconciliation"},
  payroll:{title:"HR & Payroll",subtitle:"Employees, attendance, pay runs and statutory controls"},
  ai:{title:"AQVORA AI Copilot",subtitle:"Permission-aware financial answers and drafted actions"},
};

export function ErpSampleOperations({page,onNavigate}:Props){
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const invoiceRows=sampleInvoices.filter(i=>
    [i.id,i.customer,i.description].join(" ").toLowerCase().includes(search.toLowerCase()));
  const customerRows=sampleCustomers.filter(c=>
    [c.code,c.name].join(" ").toLowerCase().includes(search.toLowerCase()));

  const note=notes[page];
  if(note){
    return <section className="aq-erp-white-panel aq-erp-roadmap" aria-label={note.title}>
      <div className="aq-erp-roadmap-icon"><Clock3 size={27}/></div>
      <span className="aq-finance__eyebrow">ROADMAP · NOT IMPLEMENTED</span>
      <h2>{note.title}</h2><p>{note.subtitle}.</p>
      <p>Not included in this tested ERP workflow. No sample transactions are accepted,
        and no backend permissions or financial records are created.</p>
      <button type="button" className="aq-finance__button"
        onClick={()=>onNavigate("overview")}>Return to working demo overview</button>
    </section>;
  }

  const title:Partial<Record<ErpReviewPage,string>>={
    customers:"Customers",sales:"Sales Invoices",receivables:"Accounts Receivable",
    cash:"Cash Collections",receipts:"Customer Receipts",fiscal:"Fiscal Periods",
  };
  return <section className="aq-finance__section aq-erp-operations">
    <header className="aq-finance__section-header">
      <div><span className="aq-finance__eyebrow">AQVORA / SAMPLE WORKFLOW</span>
        <h2>{title[page]}</h2>
        <p>Review the same synthetic customer-to-cash example. No cloud writes.</p></div>
      <span className="aq-finance__draft-chip">Sample-only · Read-only</span>
    </header>
    {(page==="customers"||page==="sales"||page==="receivables")&&
      <div className="aq-finance__panel">
        <div className="aq-finance__filters">
          <label className="aq-finance__search"><Search size={16}/>
            <span className="sr-only">Search sample records</span>
            <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search customers or invoices"/>
          </label>
          <span className="aq-finance__draft-chip"><ShieldCheck size={15}/> Synthetic V2 records</span>
        </div>
        <div className="aq-finance__table-scroll">
          <table className="aq-finance__table">
            <thead>{page==="customers"?
              <tr><th>Customer</th><th>Code</th><th>Open invoices</th><th>Action</th></tr>:
              <tr><th>Document</th><th>Customer</th><th>Invoiced</th><th>Received</th>
                <th>Outstanding</th><th>Action</th></tr>}</thead>
            <tbody>{page==="customers"?customerRows.map(c=><tr key={c.id}>
              <td><strong>{c.name}</strong><small className="aq-finance__meta">{c.status}</small></td>
              <td>{c.code}</td>
              <td>{sampleInvoices.filter(i=>i.customerId===c.id).length}</td>
              <td><button type="button" className="aq-erp-inline-link"
                onClick={()=>{setSearch(c.name);onNavigate("sales");}}>
                View invoices <ArrowRight size={14}/></button></td>
            </tr>):invoiceRows.map(i=><tr key={i.id}>
              <td><strong>{i.id}</strong><small className="aq-finance__meta">{i.description}</small></td>
              <td>{i.customer}</td><td>{samplePKR(i.faceMinor)}</td>
              <td>{samplePKR(i.receivedMinor)}</td>
              <td><strong>{samplePKR(BigInt(i.faceMinor)-BigInt(i.receivedMinor))}</strong></td>
              <td><button type="button" className="aq-erp-inline-link"
                onClick={()=>setSelected(id=>id===i.id?null:i.id)}>
                {selected===i.id?"Hide details":"Inspect"} <ArrowRight size={14}/>
              </button></td>
            </tr>)}</tbody>
          </table>
        </div>
        {page!=="customers"&&selected&&sampleInvoices.some(i=>i.id===selected)&&
          <div className="aq-erp-inspection" role="region" aria-label="Sample invoice detail">
            <div><strong>{selected}</strong><p>Issued → posted Dr Accounts Receivable / Cr Service Revenue.
              Receipt allocation appears only after a separately approved cash count.</p></div>
            <button className="aq-finance__button" type="button"
              onClick={()=>onNavigate("receipts")}>See receipt <ArrowRight size={15}/></button>
            <button type="button" className="aq-erp-inline-link" onClick={()=>onNavigate("ledger")}>
              Trace journal <ArrowRight size={15}/></button>
          </div>}
        <div className="aq-finance__table-foot">
          <span>{page==="customers"?customerRows.length:invoiceRows.length} synthetic records</span>
          <span>No save, issue or delete operations in review mode</span>
        </div>
      </div>}
    {page==="receivables"&&<div className="aq-erp-insight">
      <Wallet size={18}/><span>Total open AR: <strong>{samplePKR(demoTotals.outstandingMinor)}</strong></span>
      <button type="button" className="aq-erp-inline-link"
        onClick={()=>onNavigate("trial")}>Verify Trial Balance <ArrowRight size={14}/></button>
    </div>}
    {page==="cash"&&<div className="aq-erp-white-panel aq-erp-document">
      <div className="aq-erp-document-top"><div className="aq-erp-document-icon"><Wallet size={22}/></div>
        <span className="aq-finance__status">Confirmed · sample</span></div>
      <span className="aq-finance__eyebrow">CONTROLLED CASH EVIDENCE</span>
      <h3>Cash count CC-S001</h3><strong className="aq-erp-amount">{samplePKR(sampleReceipt.amountMinor)}</strong>
      <p>Received from North Star Trading · {sampleReceipt.date}</p>
      <div className="aq-erp-evidence"><CheckCircle2 size={18}/>
        <span>Distinct OWNER attested an in-person count. <strong>Bank verified: NO.</strong></span>
      </div>
      <button type="button" className="aq-finance__button"
        onClick={()=>onNavigate("receipts")}>Review linked customer receipt <ArrowRight size={16}/></button>
    </div>}
    {page==="receipts"&&<div className="aq-erp-white-panel aq-erp-document">
      <div className="aq-erp-document-top"><div className="aq-erp-document-icon"><FileText size={22}/></div>
        <span className="aq-finance__status">Posted · illustrative only</span></div>
      <span className="aq-finance__eyebrow">CUSTOMER RECEIPT</span>
      <h3>{sampleReceipt.id}</h3>
      <strong className="aq-erp-amount">{samplePKR(sampleReceipt.amountMinor)}</strong>
      <p>Against {sampleReceipt.invoiceId} · Original invoice {samplePKR(sampleInvoices[0].faceMinor)}</p>
      <div className="aq-erp-split">
        <div><span>Debit · Cash</span><strong>{samplePKR(sampleReceipt.amountMinor)}</strong></div>
        <div><span>Credit · Accounts Receivable</span><strong>{samplePKR(sampleReceipt.amountMinor)}</strong></div>
        <div><span>Remaining on INV-S001</span><strong>{samplePKR("900000")}</strong></div>
      </div>
      <p className="aq-erp-synthetic-caption">
        Manual cash receipt in a synthetic scenario only. Bank verified: NO. No real journal or Supabase write.</p>
      <button type="button" className="aq-finance__button" onClick={()=>onNavigate("ledger")}>
        Trace Dr/Cr in General Ledger <ArrowRight size={16}/></button>
    </div>}
    {page==="fiscal"&&<div className="aq-erp-white-panel aq-erp-document">
      <div className="aq-erp-document-top"><div className="aq-erp-document-icon"><ShieldCheck size={22}/></div>
        <span className="aq-finance__status">Illustrative period</span></div>
      <h3>FY 2026</h3>
      <p>01 Jan 2026 – 31 Dec 2026 · Sample open period</p>
      <div className="aq-erp-evidence"><LockKeyhole size={17}/>
        <span>Real close/reopen requires authorized backend policy, active MFA and auditable approval.</span>
      </div>
      <button type="button" className="aq-finance__button aq-finance__button--disabled" disabled>
        <LockKeyhole size={15}/> Close fiscal period
      </button>
    </div>}
  </section>;
}
