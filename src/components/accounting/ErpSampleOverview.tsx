import {ArrowRight,ArrowUpRight,CheckCircle2,FileText,ReceiptText,
  Users,Wallet} from "lucide-react";
import {demoTotals,samplePKR} from "./erpSampleScenario";
import type {ErpReviewPage} from "./erpPreviewPages";

const metrics=[
  {label:"Invoiced services",minor:demoTotals.revenueMinor,icon:FileText,
    tone:"charcoal",note:"2 synthetic posted invoices"},
  {label:"Cash collected",minor:demoTotals.collectedMinor,icon:Wallet,
    tone:"mint",note:"Independently counted, not bank-verified"},
  {label:"Outstanding AR",minor:demoTotals.outstandingMinor,icon:ReceiptText,
    tone:"blush",note:"As of 21 Nov 2026"},
] as const;

export function ErpSampleOverview({onNavigate}:{
  onNavigate:(page:ErpReviewPage)=>void;
}){
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
        <strong>3</strong><small>2 customers with posted invoices</small>
      </button>
    </div>
    <div className="aq-erp-dashboard-grid">
      <section className="aq-erp-white-panel aq-erp-trend">
        <div className="aq-erp-panel-head">
          <div><h3>Sales and cash flow</h3>
            <p>Illustrative source-consistent activity</p></div>
          <span className="aq-erp-chart-legend"><i/> Invoiced <i/> Collected</span>
        </div>
        <svg viewBox="0 0 720 258" role="img"
          aria-label="Illustrative two-line chart showing invoices and receipts by day"
          preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="aq-erp-lavender-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9386dc" stopOpacity=".16"/>
              <stop offset="100%" stopColor="#9386dc" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="aq-erp-teal-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#55cbb5" stopOpacity=".12"/>
              <stop offset="100%" stopColor="#55cbb5" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[44,94,144,194,244].map(y=><line key={y} x1="35" x2="696" y1={y} y2={y}
            stroke="#e6e5eb" strokeDasharray="5 6"/>)}
          <path d="M35 244 C110 244 135 210 185 173 S277 85 332 100 S428 129 489 91 S592 63 696 103 L696 244 Z"
            fill="url(#aq-erp-lavender-area)"/>
          <path d="M35 244 C155 244 201 244 268 244 S369 194 433 184 S539 148 600 172 S666 204 696 213 L696 244 Z"
            fill="url(#aq-erp-teal-area)"/>
          <path d="M35 244 C110 244 135 210 185 173 S277 85 332 100 S428 129 489 91 S592 63 696 103"
            fill="none" stroke="#9587e2" strokeWidth="2.7" strokeLinecap="round"/>
          <path d="M35 244 C155 244 201 244 268 244 S369 194 433 184 S539 148 600 172 S666 204 696 213"
            fill="none" stroke="#4ec7ad" strokeWidth="2.7" strokeLinecap="round"/>
          <circle cx="489" cy="91" r="5" fill="#9587e2" stroke="#fff" strokeWidth="2.4"/>
          <circle cx="600" cy="172" r="5" fill="#4ec7ad" stroke="#fff" strokeWidth="2.4"/>
        </svg>
        <div className="aq-erp-axis"><span>15 Nov</span><span>17 Nov</span><span>19 Nov</span><span>21 Nov</span></div>
        <p className="aq-erp-synthetic-caption">Chart curves demonstrate the approved visual treatment;
          source-backed analytic time series still requires hosted staging.</p>
      </section>
      <section className="aq-erp-white-panel aq-erp-settlement">
        <div className="aq-erp-panel-head"><div><h3>Receivables settlement</h3>
          <p>Sample posted sources only</p></div></div>
        <div className="aq-erp-donut" role="img"
          aria-label="26 percent of invoiced total collected; 74 percent outstanding">
          <div><strong>26%</strong><span>Collected</span></div>
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
          {title:"Invoice issued",detail:"INV-S001 · "+samplePKR("1500000"),
            target:"sales" as const},
          {title:"Cash independently confirmed",detail:"RC-S001 · "+samplePKR("600000"),
            target:"cash" as const},
          {title:"Receipt allocated",detail:"Dr Cash / Cr AR · "+samplePKR("600000"),
            target:"receipts" as const},
          {title:"Ledger reconciled",detail:"AR open · "+samplePKR("1700000"),
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
