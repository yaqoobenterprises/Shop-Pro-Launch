import React,{useEffect,useMemo,useRef,useState} from "react";
import {BookOpenText,CalendarDays,ChartNoAxesCombined,ChevronDown,FileSpreadsheet,
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
import type {AppView} from "../../context/AppContext";
import type {StagingFinanceNavItem} from "./stagingFinanceNavigation";
import {sampleChart,sampleCompany,sampleJournals} from "./financeSampleData";
import "./FinanceDesignPreview.css";
const Cashbook = React.lazy(() =>
  import("../chat/ChatView").then(module=>({default:module.ChatView})),
);
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
interface Props {
  onClose:()=>void;
  stagingLinks?:StagingFinanceNavItem[];
  onOpenStaging?:(id:AppView)=>void;
  unifiedCashbook?:boolean;
}

export const FinanceDesignPreview:React.FC<Props>=({
  onClose,stagingLinks=[],onOpenStaging,unifiedCashbook=false,
})=>{
  const [page,setPage]=useState<ErpReviewPage|"cashbook">(
    unifiedCashbook?"cashbook":"overview",
  );
  const [roadmapOpen,setRoadmapOpen]=useState(false);
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
    const esc=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!unifiedCashbook)onClose();};
    window.addEventListener("keydown",esc);
    return ()=>window.removeEventListener("keydown",esc);
  },[onClose,unifiedCashbook]);
  useEffect(()=>{if(typeof mainRef.current?.scrollTo==="function") mainRef.current.scrollTo({top:0,behavior:"auto"});},[page]);
  const selected=erpReviewGroups.flatMap(group=>group.pages).find(item=>item.id===page);
  const navigate=(next:ErpReviewPage)=>setPage(next);

  return <div className="aq-finance"
    role={unifiedCashbook?"region":"dialog"}
    aria-modal={unifiedCashbook?undefined:true}
    aria-label={unifiedCashbook?"AQVORA unified workspace review":"AQVORA interactive ERP sample preview"}>
    <div className="aq-finance__shell">
      <header className="aq-finance__topbar">
        <div className="aq-finance__identity">
          <img src="/assets/aqvora-symbol.svg" alt="" aria-hidden="true"/>
          <div><strong>AQVORA</strong>
            <span>{unifiedCashbook?"Unified workspace · review mode":"Unified ERP Review"}</span></div>
        </div>
        <div className="aq-finance__topbar-right">
          <span className="aq-finance__sample-flag">{unifiedCashbook&&page==="cashbook"
            ?"Cashbook · existing account records"
            :"Illustrative ERP company · No live records"}</span>
          <button type="button" className="aq-finance__close"
            onClick={onClose} title="Return to legacy cashbook">
            <X size={19} aria-hidden="true"/>
            <span>{unifiedCashbook?"Return to classic Cashbook":"Exit to legacy Cashbook"}</span>
          </button>
        </div>
      </header>
      <div className="aq-erp-preview-banner" role="status">
        <strong>{unifiedCashbook&&page==="cashbook"?"YOUR CASHBOOK":"DESIGN & LOGIC REVIEW"}</strong>
        <span>{unifiedCashbook&&page==="cashbook"
          ?"Existing Cashbook records and fast entry. Not automatically posted to V2 double-entry books."
          :"Sample ERP company · PKR · V2 posting OFF here · Never actual Cashbook or bank data"}</span>
      </div>
      <div className="aq-finance__body">
        <aside className="aq-finance__navigation"
          aria-label={unifiedCashbook?"AQVORA unified navigation":"AQVORA ERP preview navigation"}>
          {unifiedCashbook&&<div className="aq-erp-nav-group" aria-label="Existing Cashbook">
            <span>QUICK ENTRY</span>
            <button type="button" aria-current={page==="cashbook"?"page":undefined}
              onClick={()=>setPage("cashbook")}>
              <Wallet size={17} aria-hidden="true"/><span>Cashbook</span>
              <small className="aq-erp-nav-soon">Your records</small>
            </button>
          </div>}
          {erpReviewGroups.map(group=><div key={group.label} className="aq-erp-nav-group">
            {group.label==="ROADMAP"?<button type="button"
              className="aq-erp-section-toggle" aria-expanded={roadmapOpen}
              onClick={()=>setRoadmapOpen(open=>!open)}>
              <span>ROADMAP</span><ChevronDown aria-hidden="true"/>
            </button>:<span>{group.label}</span>}
            {(group.label!=="ROADMAP"||roadmapOpen)&&group.pages.map(entry=>{
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
          {stagingLinks.length>0&&onOpenStaging&&<div className="aq-erp-nav-group"
            aria-label="Authenticated V2 source workspaces">
            <span>VERIFIED STAGING ONLY</span>
            <p className="aq-erp-verified-note">
              Real authenticated sources · not this synthetic company
            </p>
            {stagingLinks.map(link=>{
              const Icon=link.icon;
              return <button key={link.id} type="button"
                onClick={()=>onOpenStaging(link.id)}>
                <Icon className="aq-erp-verified-icon"/>
                <span>Open {link.label}</span>
              </button>;
            })}
          </div>}
        </aside>
        <div className={`aq-finance__main${page==="cashbook"?" aq-finance__main--cashbook":""}`}
          ref={mainRef}>
          <div className="aq-finance__mobile-tabs" role="navigation"
            aria-label="AQVORA review pages">
            {unifiedCashbook&&<button type="button"
              aria-current={page==="cashbook"?"page":undefined}
              onClick={()=>setPage("cashbook")}>Cashbook · Your records</button>}
            {erpReviewGroups.flatMap(group=>group.pages).map(entry=><button
              type="button" key={entry.id} aria-current={page===entry.id?"page":undefined}
              onClick={()=>navigate(entry.id)}>
              {entry.label}{!entry.implemented?" · Planned":""}
            </button>)}
          </div>
          {unifiedCashbook&&page==="cashbook"&&<div className="aq-finance__cashbook"><React.Suspense fallback={<p role="status">Loading your Cashbook…</p>}><Cashbook/></React.Suspense></div>}
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
          {page!=="cashbook"&&<p className="aq-erp-synthetic-caption">
            Review-only visual workflow. Functional staging RPCs exist in separate
            audited modules, but are intentionally not activated in this sample preview.
          </p>}
          <span className="sr-only" aria-live="polite">
            Current workspace page: {page==="cashbook"?"Cashbook":selected?.label}
          </span>
        </div>
      </div>
    </div>
  </div>;
};
