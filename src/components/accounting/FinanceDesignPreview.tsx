import React, { useEffect, useMemo, useState } from "react";
import { BookOpenText, CalendarRange, ChartNoAxesCombined, FileSpreadsheet, LayoutList, Sparkles, X } from "lucide-react";
import { buildFinancialSnapshot } from "../../accounting/financialSnapshot";
import type { JournalPreviewPolicy } from "../../accounting/types";
import { ChartExplorer } from "./ChartExplorer";
import { FiscalPeriodPanel } from "./FiscalPeriodPanel";
import type { AqvoraFiscalPeriod } from "../../services/aqvoraAdminReadService";
import { JournalComposer } from "./JournalComposer";
import { GeneralLedgerPanel } from "./GeneralLedgerPanel";
import { TrialBalancePanel } from "./TrialBalancePanel";
import { sampleChart, sampleCompany, sampleJournals } from "./financeSampleData";
import "./FinanceDesignPreview.css";
import "./FinanceFinish.css";
import "./FinanceAdmin.css";

type Page = "chart" | "periods" | "journal" | "ledger" | "trial";
const pages: { key: Page; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "chart", label: "Chart of Accounts", icon: LayoutList },
  { key: "periods", label: "Fiscal Periods", icon: CalendarRange },
  { key: "journal", label: "Journal Entry", icon: FileSpreadsheet },
  { key: "ledger", label: "General Ledger", icon: BookOpenText },
  { key: "trial", label: "Trial Balance", icon: ChartNoAxesCombined },
];
const policy: JournalPreviewPolicy = {
  organizationId: sampleCompany.organizationId,
  currency: sampleCompany.currency,
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  periodState: "open",
};

const samplePeriods: AqvoraFiscalPeriod[] = [
  { id: "sample-q1", organizationId: sampleCompany.organizationId, startsOn: "2026-01-01", endsOn: "2026-03-31", state: "closed", reopenCount: 0, revision: "1" },
  { id: "sample-q2", organizationId: sampleCompany.organizationId, startsOn: "2026-04-01", endsOn: "2026-06-30", state: "closed", reopenCount: 1, revision: "3" },
  { id: "sample-q3", organizationId: sampleCompany.organizationId, startsOn: "2026-07-01", endsOn: "2026-09-30", state: "closed", reopenCount: 0, revision: "1" },
  { id: "sample-q4", organizationId: sampleCompany.organizationId, startsOn: "2026-10-01", endsOn: "2026-12-31", state: "open", reopenCount: 0, revision: "1" },
];

interface Props { onClose: () => void; onOpenAi?: () => void }

export const FinanceDesignPreview: React.FC<Props> = ({ onClose, onOpenAi }) => {
  const [page, setPage] = useState<Page>("chart");
  const [ledgerAccountId, setLedgerAccountId] = useState<string | undefined>(undefined);
  const report = useMemo(() => buildFinancialSnapshot({
    organizationId: sampleCompany.organizationId,
    currency: sampleCompany.currency,
    asOfDate: sampleCompany.asOfDate,
    sourceComplete: true,
    accounts: sampleChart,
    journals: sampleJournals,
  }), []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="aq-finance" role="dialog" aria-modal="true"
      aria-label="AQVORA accounting interface preview">
      <div className="aq-finance__shell">
        <header className="aq-finance__topbar">
          <div className="aq-finance__identity">
            <img src="/assets/aqvora-symbol.svg" alt="" aria-hidden="true" />
            <div><strong>AQVORA</strong><span>Accounting workspace</span></div>
          </div>
          <div className="aq-finance__topbar-right">
            <span className="aq-finance__sample-flag">Illustrative data · No live records</span>
            <button type="button" className="aq-finance__close" autoFocus
              aria-label="Close accounting preview" onClick={onClose}>
              <X size={19} aria-hidden="true" /> <span>Close preview</span>
            </button>
          </div>
        </header>
        <div className="aq-finance__body">
          <aside className="aq-finance__navigation" aria-label="Finance preview navigation">
            <div className="aq-finance__nav-label">ACCOUNTING</div>
            {pages.map((entry) => {
              const Icon = entry.icon;
              return <button type="button" key={entry.key}
                onClick={() => setPage(entry.key)} aria-current={page === entry.key ? "page" : undefined}>
                <Icon size={18} aria-hidden="true" /><span>{entry.label}</span>
              </button>;
            })}
            {onOpenAi && <button type="button" className="aq-finance__ai-link" onClick={onOpenAi}>
              <Sparkles size={17} aria-hidden="true" /><span>AI Copilot</span>
            </button>}
            <div className="aq-finance__nav-note">
              <strong>Design preview</strong>
              <span>Period mutations and secure journal posting remain disabled pending real staging.</span>
            </div>
          </aside>
          <div className="aq-finance__main">
            <div className="aq-finance__welcome">
              <div><span>FINANCE / {pages.find((item) => item.key === page)?.label.toUpperCase()}</span>
                <h1>Finance & accounting</h1>
                <p>Sample company · PKR · focused accounting workflows</p>
              </div>
            </div>
            <div className="aq-finance__mobile-tabs" role="navigation" aria-label="Finance preview views">
              {pages.map((entry) => <button key={entry.key} type="button"
                aria-current={page === entry.key ? "page" : undefined}
                onClick={() => setPage(entry.key)}>{entry.label}</button>)}
            </div>
            {page === "chart" && <ChartExplorer accounts={sampleChart} isSample />}
            {page === "periods" && <FiscalPeriodPanel periods={samplePeriods} source="illustrative" />}
            {page === "journal" && <JournalComposer accounts={sampleChart}
              initialDate={sampleCompany.asOfDate} policy={policy} />}
            {page === "ledger" && <GeneralLedgerPanel accounts={sampleChart}
              journals={sampleJournals} asOfDate={sampleCompany.asOfDate}
              selectedAccountId={ledgerAccountId} />}
            {page === "trial" && <TrialBalancePanel snapshot={report}
              onOpenLedger={(accountId) => { setLedgerAccountId(accountId); setPage("ledger"); }} />}
          </div>
        </div>
      </div>
    </div>
  );
};
