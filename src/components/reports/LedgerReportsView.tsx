import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ledgerService } from "../../services/ledgerService";
import { formatPaisa } from "../../lib/money";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import type { Category, Transaction } from "../../types/ledger";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, getTrendGrouping } from "../../lib/reportAnalytics";
import { downloadPremiumXlsx } from "../../lib/premiumXlsx";
import { buildReportsWorkbook } from "./buildReportsWorkbook";
import { ReportFiltersPanel, type ReportFilters } from "./ReportFiltersPanel";
import "./ReportsAnalytics.css";

export const LedgerReportsView: React.FC = () => {
  const today = getKarachiBusinessDate();
  const currentYearStart = `${today.slice(0, 4)}-01-01`;
  const [filters, setFilters] = useState<ReportFilters>({
    fromDate: currentYearStart,
    toDate: today,
    type: "all",
    categoryId: "all",
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void ledgerService.getCategories().then((items) => {
      if (!cancelled) setCategories(items.filter((item) => item.is_active));
    }).catch((error: unknown) => {
      console.warn("Could not load report categories:", error);
    });
    return () => { cancelled = true; };
  }, []);

  const loadReport = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const rows = await ledgerService.getAllFilteredTransactions({
        startDate: filters.fromDate,
        endDate: filters.toDate,
        type: filters.type,
        categoryId: filters.categoryId,
        status: "active",
      });
      if (id !== requestId.current) return;
      setTransactions(rows);
      setShowAllTransactions(false);
    } catch (error) {
      if (id !== requestId.current) return;
      setTransactions([]);
      setLoadError(error instanceof Error ? error.message : "The selected report could not be loaded.");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const totals = useMemo(() => calculateReportTotals(transactions), [transactions]);
  const trend = useMemo(
    () => buildReportTrend(transactions, filters.fromDate, filters.toDate),
    [transactions, filters.fromDate, filters.toDate],
  );
  const categoryBreakdown = useMemo(
    () => buildReportCategoryBreakdown(transactions),
    [transactions],
  );
  const chartMax = Math.max(1, ...trend.map((bucket) => Math.max(bucket.income_paisa, bucket.expense_paisa)));
  const rangeLabel = `${formatDisplayDate(filters.fromDate)} – ${formatDisplayDate(filters.toDate)}`;
  const grouping = getTrendGrouping(filters.fromDate, filters.toDate);
  const handleExport = () => {
    setIsExporting(true);
    try {
      const workbook = buildReportsWorkbook({
        transactions,
        categories,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        type: filters.type,
        categoryId: filters.categoryId,
        trend,
        grouping,
      });
      downloadPremiumXlsx(workbook.sheets, workbook.fileName);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not create the Excel workbook.");
    } finally {
      setIsExporting(false);
    }
  };

  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 50);
  return (
    <main className="page-content reports-page reports-modern">
      <header className="reports-modern__hero">
        <div>
          <span className="reports-modern__eyebrow">FINANCIAL INTELLIGENCE</span>
          <h1>Reports</h1>
          <p>Explore your shop performance, inspect category trends and export a polished workbook.</p>
        </div>
        <button type="button" className="reports-modern__export" onClick={handleExport} disabled={isExporting || isLoading}>
          <FileSpreadsheet size={17} aria-hidden="true" />
          {isExporting ? "Preparing Excel…" : "Export to Excel"}
          <Download size={15} aria-hidden="true" />
        </button>
      </header>

      <ReportFiltersPanel
        filters={filters}
        categories={categories}
        today={today}
        isLoading={isLoading}
        onApply={setFilters}
      />

      {loadError && <div role="alert" className="reports-modern__error reports-modern__load-error">{loadError}</div>}

      <section className="reports-modern__kpis" aria-label="Filtered report totals" aria-busy={isLoading}>
        <article className={`reports-modern__kpi reports-modern__kpi--profit ${totals.net_profit_paisa < 0 ? "is-negative" : ""}`}>
          <span>NET PROFIT</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.net_profit_paisa)}</strong>
          <small>Income less operating expenses</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--income">
          <span>TOTAL INCOME</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.income_paisa)}</strong>
          <small>{totals.transaction_count.toLocaleString()} matching entries</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--expense">
          <span>TOTAL EXPENSES</span><TrendingDown size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.expense_paisa)}</strong>
          <small>Operating outflow</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--count">
          <span>TRANSACTIONS</span><FileSpreadsheet size={18} aria-hidden="true" />
          <strong>{isLoading ? "—" : totals.transaction_count.toLocaleString()}</strong>
          <small>Active records in this report</small>
        </article>
      </section>

      <section className="reports-modern__chart-panel">
        <div className="reports-modern__section-heading">
          <div><span className="reports-modern__section-kicker">PERFORMANCE</span><h2>Cash flow over time</h2><p>{grouping === "day" ? "Daily" : grouping === "week" ? "Weekly" : "Monthly"} income versus expenses</p></div>
          <div className="reports-modern__legend"><span><i className="is-income" />Income</span><span><i className="is-expense" />Expenses</span></div>
        </div>
        {trend.length === 0 ? <div className="reports-modern__empty">No transactions match this reporting range.</div> : (
          <div className="reports-modern__trend-scroll">
            <div className="reports-modern__trend" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(36px, 1fr))` }}>
              {trend.map((bucket) => {
                const incomeHeight = bucket.income_paisa > 0 ? Math.max(3, (bucket.income_paisa / chartMax) * 100) : 0;
                const expenseHeight = bucket.expense_paisa > 0 ? Math.max(3, (bucket.expense_paisa / chartMax) * 100) : 0;
                return <div className="reports-modern__trend-item" key={bucket.key} title={`${bucket.title}\nIncome: ${formatPaisa(bucket.income_paisa)}\nExpenses: ${formatPaisa(bucket.expense_paisa)}`}>
                  <div className="reports-modern__bar-area"><span className="reports-modern__bar is-income" style={{ height: `${incomeHeight}%` }} /><span className="reports-modern__bar is-expense" style={{ height: `${expenseHeight}%` }} /></div>
                  <span className="reports-modern__trend-label">{bucket.label}</span>
                </div>;
              })}
            </div>
          </div>
        )}
      </section>

      <div className="reports-modern__analysis-grid">
        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><span className="reports-modern__section-kicker">BY CATEGORY</span><h2>Category performance</h2><p>Highest activity first</p></div></div>
          {categoryBreakdown.length === 0 ? <div className="reports-modern__empty">No category activity for these filters.</div> : <div className="reports-modern__table-scroll"><table><thead><tr><th>Category</th><th>Type</th><th>Entries</th><th>Total</th></tr></thead><tbody>
            {categoryBreakdown.map((item) => <tr key={item.key}><td><strong>{item.category_name}</strong></td><td><span className={`reports-modern__type-badge type-${item.type}`}>{item.type.replace("_", " ")}</span></td><td>{item.entry_count}</td><td className={item.type === "expense" ? "amount-expense" : item.type === "income" ? "amount-income" : ""}>{formatPaisa(item.total_paisa)}</td></tr>)}
          </tbody></table></div>}
        </section>

        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><span className="reports-modern__section-kicker">NON-OPERATING</span><h2>Other cash movements</h2><p>Separated from operating profit</p></div></div>
          <div className="reports-modern__movement-list">
            <div><span>Capital introduced</span><strong>{formatPaisa(totals.capital_in_paisa)}</strong></div>
            <div><span>Owner drawings</span><strong>{formatPaisa(totals.withdrawal_paisa)}</strong></div>
            <div><span>Cash adjustments in</span><strong>{formatPaisa(totals.adjustment_in_paisa)}</strong></div>
            <div><span>Cash adjustments out</span><strong>{formatPaisa(totals.adjustment_out_paisa)}</strong></div>
          </div>
          <p className="reports-modern__footnote">Net profit is calculated from income minus operating expenses. Capital, drawings and cash adjustments remain separately visible.</p>
        </section>
      </div>

      <section className="reports-modern__table-panel reports-modern__transactions">
        <div className="reports-modern__section-heading"><div><span className="reports-modern__section-kicker">AUDITABLE DETAIL</span><h2>Transaction register</h2><p>All filtered active entries are included in Excel export.</p></div><span className="reports-modern__record-count">{transactions.length.toLocaleString()} records</span></div>
        {transactions.length === 0 ? <div className="reports-modern__empty">No matching transactions to display.</div> : <div className="reports-modern__table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Account</th><th>Amount</th></tr></thead><tbody>
          {visibleTransactions.map((tx) => <tr key={tx.id}><td>{formatDisplayDate(tx.business_date)}</td><td><span className={`reports-modern__type-badge type-${tx.type}`}>{tx.type.replace("_", " ")}</span></td><td>{tx.category_name || "Uncategorised"}</td><td className="reports-modern__description" title={tx.raw_text}>{tx.raw_text || "—"}</td><td>{tx.account_name || "Cash In Hand"}</td><td className={tx.type === "expense" ? "amount-expense" : tx.type === "income" ? "amount-income" : ""}>{formatPaisa(tx.amount_paisa)}</td></tr>)}
        </tbody></table></div>}
        {transactions.length > 50 && <button type="button" className="reports-modern__show-more" onClick={() => setShowAllTransactions((value) => !value)}>{showAllTransactions ? "Show latest 50 only" : `Show all ${transactions.length.toLocaleString()} records`}</button>}
      </section>
      <p className="reports-modern__footer-note">Report generated from active ledger records · Date boundaries use the shop business date.</p>
    </main>
  );
};
