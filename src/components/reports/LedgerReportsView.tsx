import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ledgerService } from "../../services/ledgerService";
import { formatRecordedPaisa as formatPaisa } from "../../lib/money";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import type { Category, Transaction } from "../../types/ledger";
import { assertReportAmounts } from "../../lib/reportAmountValidation";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, getTrendGrouping } from "../../lib/reportAnalytics";
import { downloadPremiumXlsx } from "../../lib/premiumXlsx";
import { buildReportsWorkbook } from "./buildReportsWorkbook";
import { ReportFiltersPanel, type ReportFilters } from "./ReportFiltersPanel";
import "./ReportsAnalytics.css";
import "./ReportsRealFinish.css";
import { buildReportAccountBreakdown } from "../../lib/reportAccountBreakdown";
import { useRegion } from "../../regional/region";
import { ReportInsightCharts } from "./ReportInsightCharts";

export const LedgerReportsView: React.FC<{ cloudOnly?: boolean }> = ({ cloudOnly = false }) => {
  const { region } = useRegion();
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [loadedFilters, setLoadedFilters] = useState<ReportFilters | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState(0);
  const rowsPerPage = 15;
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
    setExportError(null);
    setTransactions([]);
    setLoadedFilters(null);
    try {
      const query = {
        startDate: filters.fromDate,
        endDate: filters.toDate,
        type: filters.type,
        categoryId: filters.categoryId,
        status: "active" as const,
      };
      const rows = cloudOnly ? await ledgerService.getAllFilteredTransactions(query, { requireCloudSource: true }) : await ledgerService.getAllFilteredTransactions(query);
      if (id !== requestId.current) return;
      assertReportAmounts(rows);
      setTransactions(rows);
      setLoadedFilters(filters);
      setTransactionPage(0);
    } catch (error) {
      if (id !== requestId.current) return;
      setTransactions([]);
      setLoadError(error instanceof Error ? error.message : "The selected report could not be loaded.");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [filters, cloudOnly]);

  useEffect(() => { void loadReport(); return () => { requestId.current += 1; }; }, [loadReport]);
  const ready = !isLoading && !loadError && loadedFilters === filters;
  const amount = (paisa: number) => ready ? formatPaisa(paisa) : loadError ? "Unavailable" : "Loading…";

  const totals = useMemo(() => calculateReportTotals(transactions), [transactions]);
  const trend = useMemo(
    () => ready && transactions.length ? buildReportTrend(transactions, filters.fromDate, filters.toDate) : [],
    [transactions, filters.fromDate, filters.toDate, ready],
  );
  const categoryBreakdown = useMemo(
    () => buildReportCategoryBreakdown(transactions),
    [transactions],
  );
  const accountBreakdown = useMemo(() => buildReportAccountBreakdown(transactions), [transactions]);
  const chartMax = Math.max(1, ...trend.map((bucket) => Math.max(bucket.income_paisa, bucket.expense_paisa)));
  const grouping = getTrendGrouping(filters.fromDate, filters.toDate);

  const expenseCategories = useMemo(
    () => categoryBreakdown.filter((item) => item.type === "expense" && item.total_paisa > 0),
    [categoryBreakdown],
  );
  const handleExport = () => {
    if (!ready || isExporting) return;
    setExportError(null);
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
        currency: region.currency,
        sourceScope: cloudOnly ? "Posted cloud records only" : "Available local or demo records; completeness not verified",
      });
      downloadPremiumXlsx(workbook.sheets, workbook.fileName, region.currency);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not create the Excel workbook.");
    } finally {
      setIsExporting(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(transactions.length / rowsPerPage));
  const safePage = Math.min(transactionPage, pageCount - 1);
  const visibleTransactions = transactions.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);
  return (
    <div className="page-content reports-page reports-modern">
      <header className="reports-modern__hero">
        <div>
          <h1>Reports</h1>
        </div>
        <button type="button" className="reports-modern__export" onClick={handleExport} disabled={isExporting || !ready || region.currency !== "PKR"}>
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

      <div className="visual-scope-row"><span className="visual-scope" title={cloudOnly?"Posted cloud records only; queued entries excluded.":"Local or demo records; completeness not verified."}>{cloudOnly?"Posted only":"Local records"}</span><span className="visual-scope" title="Cashbook analysis; internal transfers excluded.">Cash basis</span>{!cloudOnly&&<span className="visual-scope is-warning">Unverified</span>}</div>
      {exportError && <div role="alert" className="reports-modern__error">{exportError}</div>}
      {loadError && <div role="alert" className="reports-modern__error reports-modern__load-error">{loadError} <button type="button" className="button button-secondary" onClick={() => void loadReport()}>Retry</button></div>}

      <section className="reports-modern__kpis" aria-label="Filtered report totals" aria-busy={isLoading}>
        <article className={`reports-modern__kpi reports-modern__kpi--profit ${totals.net_profit_paisa < 0 ? "is-negative" : ""}`}>
          <span>Cashbook result</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{amount(totals.net_profit_paisa)}</strong>
          <small className="sr-only">Cashbook basis · not accrual P&L</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--income">
          <span>Income</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{amount(totals.income_paisa)}</strong>
          
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--expense">
          <span>Expenses</span><TrendingDown size={18} aria-hidden="true" />
          <strong>{amount(totals.expense_paisa)}</strong>
          
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--count">
          <span>Transactions</span><FileSpreadsheet size={18} aria-hidden="true" />
          <strong>{ready ? totals.transaction_count.toLocaleString() : loadError ? "Unavailable" : "Loading…"}</strong>
          
        </article>
      </section>

      {ready && <>
      <section className="reports-modern__chart-panel">
        <div className="reports-modern__section-heading">
          <div><h2>Cash flow</h2></div>
          <div className="reports-modern__legend"><span><i className="is-income" />Income</span><span><i className="is-expense" />Expenses</span></div>
        </div>
        {trend.length > 0 && <p className="reports-source-note">Scale: {formatPaisa(0)} to {formatPaisa(chartMax)}</p>}
        {trend.length === 0 ? <div className="reports-modern__empty">No transactions match this reporting range.</div> : (
          <div className="reports-modern__trend-scroll" tabIndex={0} role="region" aria-label="Income and expense trend, scroll horizontally">
            <div className="reports-modern__trend" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(36px, 1fr))` }}>
              {trend.map((bucket) => {
                const incomeHeight = bucket.income_paisa > 0 ? (bucket.income_paisa / chartMax) * 100 : 0;
                const expenseHeight = bucket.expense_paisa > 0 ? (bucket.expense_paisa / chartMax) * 100 : 0;
                return <div className="reports-modern__trend-item" key={bucket.key} title={`${bucket.title}\nIncome: ${formatPaisa(bucket.income_paisa)}\nExpenses: ${formatPaisa(bucket.expense_paisa)}`}>
                  <div className="reports-modern__bar-area"><span className="reports-modern__bar is-income" style={{ height: `${incomeHeight}%` }} /><span className="reports-modern__bar is-expense" style={{ height: `${expenseHeight}%` }} /></div>
                  <span className="reports-modern__trend-label">{bucket.label}</span>
                </div>;
              })}
            </div>
          </div>
        )}
        {trend.length > 0 && <details className="report-trend-data"><summary>Exact values</summary><div className="reports-modern__table-scroll" tabIndex={0} role="region" aria-label="Exact trend values"><table><caption className="sr-only">Filtered period totals</caption><thead><tr><th scope="col">Period</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Operating result</th></tr></thead><tbody>{trend.map(bucket => <tr key={bucket.key}><th scope="row">{bucket.label}</th><td>{formatPaisa(bucket.income_paisa)}</td><td>{formatPaisa(bucket.expense_paisa)}</td><td>{formatPaisa(bucket.net_profit_paisa)}</td></tr>)}</tbody></table></div></details>}
      </section>

      <ReportInsightCharts trend={trend} expenseCategories={expenseCategories} />

      <div className="reports-modern__analysis-grid">
        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><h2>Categories</h2></div></div>
          {categoryBreakdown.length === 0 ? <div className="reports-modern__empty">No category activity for these filters.</div> : <div className="reports-modern__table-scroll" tabIndex={0} role="region" aria-label="Category breakdown"><table><thead><tr><th>Category</th><th>Type</th><th>Entries</th><th>Total</th></tr></thead><tbody>
            {categoryBreakdown.map((item) => <tr key={item.key}><td><strong>{item.category_name}</strong></td><td><span className={`reports-modern__type-badge type-${item.type}`}>{item.type.replace("_", " ")}</span></td><td>{item.entry_count}</td><td className={item.type === "expense" ? "amount-expense" : item.type === "income" ? "amount-income" : ""}>{formatPaisa(item.total_paisa)}</td></tr>)}
          </tbody></table></div>}
        </section>

        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><h2>Cash movements</h2></div></div>
          <div className="reports-modern__movement-list">
            <div><span>Capital introduced</span><strong>{formatPaisa(totals.capital_in_paisa)}</strong></div>
            <div><span>Owner drawings</span><strong>{formatPaisa(totals.withdrawal_paisa)}</strong></div>
            <div><span>Cash adjustments in</span><strong>{formatPaisa(totals.adjustment_in_paisa)}</strong></div>
            <div><span>Cash adjustments out</span><strong>{formatPaisa(totals.adjustment_out_paisa)}</strong></div>
          </div>
          <span className="visual-scope" title="Income minus operating expenses, cashbook basis">Cash basis</span>
        </section>
      </div>

      <section className="reports-modern__table-panel">
        <div className="reports-modern__section-heading"><div><h2 aria-label="Activity by account">Account activity</h2></div></div>
        {accountBreakdown.length ? <div className="reports-modern__table-scroll" tabIndex={0} role="region" aria-label="Account activity"><table><thead><tr><th scope="col">Account</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Operating result</th><th scope="col">Entries</th></tr></thead><tbody>{accountBreakdown.map(row => <tr key={row.accountId}><th scope="row">{row.name}</th><td>{formatPaisa(row.income_paisa)}</td><td>{formatPaisa(row.expense_paisa)}</td><td>{formatPaisa(row.net_profit_paisa)}</td><td>{row.transaction_count}</td></tr>)}</tbody></table></div> : <p className="reports-modern__empty">No account activity for these filters.</p>}
      </section>
      <section className="reports-modern__table-panel reports-modern__transactions">
        <div className="reports-modern__section-heading"><div><h2 aria-label="Transaction register">Transactions</h2></div><span className="reports-modern__record-count">{transactions.length.toLocaleString()} records</span></div>
        {transactions.length === 0 ? <div className="reports-modern__empty">No matching transactions to display.</div> : <div className="reports-modern__table-scroll" tabIndex={0} role="region" aria-label="Transaction register"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Account</th><th>Amount</th></tr></thead><tbody>
          {visibleTransactions.map((tx) => <tr key={tx.id}><td>{formatDisplayDate(tx.business_date)}</td><td><span className={`reports-modern__type-badge type-${tx.type}`}>{tx.type.replace("_", " ")}</span></td><td>{tx.category_name || "Uncategorised"}</td><td className="reports-modern__description" title={tx.raw_text}>{tx.raw_text || "—"}</td><td>{tx.account_name || "Account unavailable"}</td><td className={tx.type === "expense" ? "amount-expense" : tx.type === "income" ? "amount-income" : ""}>{formatPaisa(tx.amount_paisa)}</td></tr>)}
        </tbody></table></div>}
        {transactions.length > rowsPerPage && <nav className="reports-modern__pager" aria-label="Transaction register pagination">
          <span>Showing {safePage * rowsPerPage + 1}–{Math.min((safePage + 1) * rowsPerPage, transactions.length)} of {transactions.length.toLocaleString()} records · All are included in export</span>
          <div>
            <button type="button" disabled={safePage === 0}
              aria-label="Previous transaction page" onClick={() => setTransactionPage((p) => Math.max(0, p - 1))}>Previous</button>
            <span aria-live="polite">Page {safePage + 1} of {pageCount}</span>
            <button type="button" disabled={safePage === pageCount - 1}
              aria-label="Next transaction page" onClick={() => setTransactionPage((p) => Math.min(pageCount - 1, p + 1))}>Next</button>
          </div>
        </nav>}
      </section>
      </>}
      <p className="reports-modern__footer-note">Active entries · Shop business dates · Printed register includes the displayed page; Excel contains every matched record.</p>
    </div>
  );
};
