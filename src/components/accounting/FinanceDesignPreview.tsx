import React,{useEffect,useMemo,useRef,useState} from "react";
import {BookOpenText,CalendarDays,ChartNoAxesCombined,FileSpreadsheet,
  FileText,HandCoins,LayoutDashboard,LayoutList,Package,ReceiptText,
  ShoppingCart,Sparkles,Users,Wallet,X,type LucideIcon} from "lucide-react";
import {buildFinancialSnapshot} from "../../accounting/financialSnapshot";
import type {JournalPreviewPolicy} from "../../accounting/types";
import {ChartExplorer} from "./ChartExplorer";
import {JournalComposer} from "./JournalComposer";
import {GeneralLedgerPanel} from "./GeneralLedgerPanel";
import {TrialBalancePanel} from "./TrialBalancePanel";
import {ErpSampleOverview} from "./ErpSampleOverview";
import {ErpSampleOperations} from "./ErpSampleOperations";
import {erpReviewGroups,type ErpReviewPage} from "./erpPreviewPages";
import {sampleChart,sampleCompany,sampleJournals} from "./financeSampleData";
import "./FinanceDesignPreview.css";
import "./ErpSampleShowcase.css";

const icons:Record<ErpReviewPage,LucideIcon>={
  overview:LayoutDashboard,customers:Users,sales:FileText,
  receivables:Wallet,cash:HandCoins,receipts:ReceiptText,
  chart:LayoutList,journal:FileSpreadsheet,ledger:BookOpenText,
  trial:ChartNoAxesCombined,fiscal:CalendarDays,
  purchases:ShoppingCart,inventory:Package,payroll:Users,ai:Sparkles,
};
const policy:JournalPreviewPolicy={
  organizationId:sampleCompany.organizationId,currency:sampleCompany.currency,
  periodStart:"2026-01-01",periodEnd:"2026-12-31",periodState:"open",
};
interface Props {onClose:()=>void}

export const FinanceDesignPreview:React.FC<Props>=({onClose})=>{
  const [page,setPage]=useState<ErpReviewPage>("overview");
  const [ledgerAccountId,setLedgerAccountId]=useState<string|undefined>();
  const mainRef=useRef<HTMLDivElement>(null);
  const report=useMemo(()=>buildFinancialSnapshot({
    organizationId:sampleCompany.organizationId,
    currency:sampleCompany.currency,
    asOfDate:sampleCompany.asOfDate,
    sourceComplete:true,
    accounts:sampleChart,
    journals:sampleJournals,
  }),[]);
  useEffect(()=>{
    const esc=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",esc);
    return ()=>window.removeEventListener("keydown",esc);
  },[onClose]);
  useEffect(()=>{mainRef.current?.scrollTo({top:0,behavior:"auto"});},[page]);
  const selected=erpReviewGroups.flatMap(group=>group.pages).find(item=>item.id===page);
  const navigate=(next:ErpReviewPage)=>setPage(next);

  return <div className="aq-finance" role="dialog" aria-modal="true"
    aria-label="AQVORA interactive ERP sample preview">
    <div className="aq-finance__shell">
      <header className="aq-finance__topbar">
        <div className="aq-finance__identity">
          <img src="/assets/aqvora-symbol.svg" alt="" aria-hidden="true"/>
          <div><strong>AQVORA</strong><span>Unified ERP Review</span></div>
        </div>
        <div className="aq-finance__topbar-right">
          <span className="aq-finance__sample-flag">Illustrative company · No live records</span>
          <button type="button" className="aq-finance__close"
            onClick={onClose} title="Return to legacy cashbook">
            <X size={19} aria-hidden="true"/><span>Exit to legacy Cashbook</span>
          </button>
        </div>
      </header>
      <div className="aq-erp-preview-banner" role="status">
        <strong>DESIGN & LOGIC REVIEW</strong>
        <span>Sample company · PKR · Real V2 posting and cloud connection OFF · Never actual bank/ledger data</span>
      </div>
      <div className="aq-finance__body">
        <aside className="aq-finance__navigation" aria-label="AQVORA ERP preview navigation">
          {erpReviewGroups.map(group=><div key={group.label} className="aq-erp-nav-group">
            <span>{group.label}</span>
            {group.pages.map(entry=>{
              const Icon=icons[entry.id];
              return <button type="button" key={entry.id}
                aria-current={page===entry.id?"page":undefined}
                onClick={()=>navigate(entry.id)}>
                <Icon size={17} aria-hidden="true"/>
                <span>{entry.label}</span>
                {!entry.implemented&&<small className="aq-erp-nav-soon">Planned</small>}
              </button>;
            })}
          </div>)}
        </aside>
        <div className="aq-finance__main" ref={mainRef}>
          <div className="aq-finance__mobile-tabs" role="navigation"
            aria-label="AQVORA review pages">
            {erpReviewGroups.flatMap(group=>group.pages).map(entry=><button
              type="button" key={entry.id} aria-current={page===entry.id?"page":undefined}
              onClick={()=>navigate(entry.id)}>
              {entry.label}{!entry.implemented?" · Planned":""}
            </button>)}
          </div>
          {page==="overview"&&<ErpSampleOverview onNavigate={navigate}/>}
          {page==="chart"&&<ChartExplorer accounts={sampleChart} isSample/>}
          {page==="journal"&&<JournalComposer accounts={sampleChart}
            initialDate={sampleCompany.asOfDate} policy={policy}/>}
          {page==="ledger"&&<GeneralLedgerPanel accounts={sampleChart}
            journals={sampleJournals} asOfDate={sampleCompany.asOfDate}
            selectedAccountId={ledgerAccountId}/>}
          {page==="trial"&&<TrialBalancePanel snapshot={report}
            onOpenLedger={id=>{setLedgerAccountId(id);setPage("ledger");}}/>}
          {!["overview","chart","journal","ledger","trial"].includes(page)&&
            <ErpSampleOperations key={page} page={page} onNavigate={navigate}/>}
          <p className="aq-erp-synthetic-caption">
            Review-only visual workflow. Functional staging RPCs exist in separate
            audited modules, but are intentionally not activated in this sample preview.
          </p>
          <span className="sr-only" aria-live="polite">
            Current preview page: {selected?.label}
          </span>
        </div>
      </div>
    </div>
  </div>;
};
