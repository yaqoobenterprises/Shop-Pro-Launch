import {ArrowRight,ArrowUpRight,CheckCircle2,FileText,ReceiptText,
  Users,Wallet} from "lucide-react";
import {demoTotals,sampleCustomers,sampleInvoices,sampleReceipt,samplePKR}
  from "./erpSampleScenario";
import {percentCollected} from "./erpSampleActivity";
import {ErpSampleActivityChart} from "./ErpSampleActivityChart";
import type {ErpReviewPage} from "./erpPreviewPages";

const metrics=[
  {label:"Invoiced services",minor:demoTotals.revenueMinor,icon:FileText,
    tone:"charcoal",note:sampleInvoices.length+" synthetic posted invoices"},
  {label:"Cash collected",minor:demoTotals.collectedMinor,icon:Wallet,
    tone:"mint",note:"Independently counted, not bank-verified"},
  {label:"Outstanding AR",minor:demoTotals.outstandingMinor,icon:ReceiptText,
    tone:"blush",note:"As of 21 Nov 2026"},
] as const;

export function ErpSampleOverview({onNavigate}:{
  onNavigate:(page:ErpReviewPage)=>void;
}){
  const share=percentCollected(demoTotals.collectedMinor,demoTotals.revenueMinor);
  const roundedShare=Math.round(share);
  return <div className="aq-erp-overview">
    <div className="aq-erp-heading">
      <div><span className="aq-finance__eyebrow">ERP / FINANCIAL COMMAND CENTRE</span>
        <h2>Business overview</h2>
        <p>One coherent sample: service invoices → controlled cash → receivables → posted journal.</p>
      </div>
      <span className="aq-finance__draft-chip">21 November 2026 · Illustrative</span>
    </div>
    <div className="aq-erp-kpis">
      {metrics.map(m=><button key={m.label} type="button"
        className={`aq-erp-kpi aq-erp-kpi--${m.tone}`}
        onClick={()=>onNavigate(m.label==="Invoiced services"?"sales":
          m.label==="Cash collected"?"cash":"receivables")}>
        <span className="aq-erp-kpi__top"><span>{m.label}</span><m.icon size={19} aria-hidden="true"/></span>
        <strong>{samplePKR(m.minor)}</strong><small>{m.note}</small>
      </button>)}
      <button type="button" className="aq-erp-kpi aq-erp-kpi--white"
        onClick={()=>onNavigate("customers")}>
        <span className="aq-erp-kpi__top"><span>Customers</span><Users size={19}/></span>
        <strong>{sampleCustomers.length}</strong><small>{sampleInvoices.length} customers with posted invoices</small>
      </button>
    </div>
    <div className="aq-erp-dashboard-grid">
      <section className="aq-erp-white-panel aq-erp-trend">
        <div className="aq-erp-panel-head">
          <div><h3>Sales and cash flow</h3>
            <p>Illustrative source-consistent activity</p></div>
          <span className="aq-erp-chart-legend"><i/> Invoiced <i/> Collected</span>
        </div>
        <ErpSampleActivityChart/>
        <p className="aq-erp-synthetic-caption">Derived from the three sample posted journals.
          Real company analytics require authorized V2 source reads and are not shown here.</p>
      </section>
      <section className="aq-erp-white-panel aq-erp-settlement">
        <div className="aq-erp-panel-head"><div><h3>Receivables settlement</h3>
          <p>Sample posted sources only</p></div></div>
        <div className="aq-erp-donut" role="img"
          style={{background:`conic-gradient(#51cbb2 0 ${share}%,#9789dc ${share}% 100%)`}}
          aria-label={`${roundedShare} percent collected; ${100-roundedShare} percent outstanding`}>
          <div><strong>{roundedShare}%</strong><span>Collected</span></div>
        </div>
        <div className="aq-erp-breakdown">
          <div><span><i className="mint"/> Collected</span><strong>{samplePKR(demoTotals.collectedMinor)}</strong></div>
          <div><span><i className="lavender"/> Open AR</span><strong>{samplePKR(demoTotals.outstandingMinor)}</strong></div>
        </div>
        <button type="button" className="aq-erp-inline-link" onClick={()=>onNavigate("receivables")}>
          Review open invoices <ArrowRight size={15}/>
        </button>
      </section>
    </div>
    <section className="aq-erp-white-panel aq-erp-activity">
      <div className="aq-erp-panel-head"><div><h3>Financial workflow</h3>
        <p>Trace the same example through the product</p></div></div>
      <div className="aq-erp-steps">
        {[
          {title:"Invoice issued",detail:sampleInvoices[0].id+" · "+samplePKR(sampleInvoices[0].faceMinor),
            target:"sales" as const},
          {title:"Cash independently confirmed",detail:sampleReceipt.id+" · "+samplePKR(sampleReceipt.amountMinor),
            target:"cash" as const},
          {title:"Receipt allocated",detail:"Dr Cash / Cr AR · "+samplePKR(sampleReceipt.amountMinor),
            target:"receipts" as const},
          {title:"Ledger reconciled",detail:"AR open · "+samplePKR(demoTotals.outstandingMinor),
            target:"trial" as const},
        ].map((item,i)=><button type="button" key={item.title}
          onClick={()=>onNavigate(item.target)} className="aq-erp-step">
          <CheckCircle2 size={20} aria-hidden="true"/>
          <span><strong>{i+1}. {item.title}</strong><small>{item.detail}</small></span>
          <ArrowUpRight size={16} aria-hidden="true"/>
        </button>)}
      </div>
    </section>
  </div>;
}
