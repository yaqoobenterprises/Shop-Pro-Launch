import { loadPeriodAnalytics, type PeriodAnalytics } from "../../services/periodAnalyticsService";
import { useLedgerRefresh } from "../../hooks/useLedgerRefresh";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { ledgerService } from "../../services/ledgerService";
import { formatPaisa } from "../../lib/money";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import type { Category, Transaction } from "../../types/ledger";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, getTrendGrouping } from "../../lib/reportAnalytics";
import { exportReportsWorkbook } from "../../services/reportExportService";
import { ReportFiltersPanel, type ReportFilters } from "./ReportFiltersPanel";
import { CashFlowChart } from "../charts/CashFlowChart";
import { DataTable } from "../tables/DataTable";
import { transactionColumns } from "../tables/transactionColumns";
import { exportToCSV } from "../../lib/utils";
import { ReportInsightCharts } from "./ReportInsightCharts";

export const LedgerReportsView: React.FC = () => {
  const today = getKarachiBusinessDate();
  const currentYearStart = `${today.slice(0, 4)}-01-01`;
  const [filters, setFilters] = useState<ReportFilters>({
    fromDate: currentYearStart,
    toDate: today,
    type: "all",
    categoryId: "all",
  });
  const [analytics, setAnalytics] = useState<PeriodAnalytics | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [registerError, setRegisterError] = useState<string | undefined>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const columns = useMemo(() => transactionColumns(), []);
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
    setLoadError(null); setLoadingRecords(false);
    try {
      const report = await loadPeriodAnalytics({
        startDate: filters.fromDate,
        endDate: filters.toDate,
        type: filters.type,
        categoryId: filters.categoryId,
      });
      if (id !== requestId.current) return;
      setAnalytics(report);
      setTransactions(report.records || []); setRecordsLoaded(Boolean(report.records));
      setShowRecords(false); setRegisterError(undefined);

    } catch (error) {
      if (id !== requestId.current) return;
      setTransactions([]); setAnalytics(null); setRecordsLoaded(false); setShowRecords(false);
      setLoadError(error instanceof Error ? error.message : "The selected report could not be loaded.");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  useLedgerRefresh(loadReport);

  const totals = useMemo(() => analytics?.totals || calculateReportTotals(transactions), [analytics, transactions]);
  const trend = useMemo(
    () => analytics?.trend || buildReportTrend(transactions, filters.fromDate, filters.toDate),
    [analytics, transactions, filters.fromDate, filters.toDate],
  );
  const categoryBreakdown = useMemo(
    () => analytics?.categories || buildReportCategoryBreakdown(transactions),
    [analytics, transactions],
  );
  const grouping = getTrendGrouping(filters.fromDate, filters.toDate);

  const expenseCategories = useMemo(
    () => categoryBreakdown.filter((item) => item.type === "expense" && item.total_paisa > 0),
    [categoryBreakdown],
  );
  const getRecords = () => ledgerService.getAllFilteredTransactions({ startDate: filters.fromDate, endDate: filters.toDate, type: filters.type, categoryId: filters.categoryId, status: "active" });
  const loadRegisterRecords = async () => {
    if (loadingRecords) return;
    const id = requestId.current; setLoadingRecords(true); setRegisterError(undefined);
    try { const rows = await getRecords(); if (id === requestId.current) { setTransactions(rows); setRecordsLoaded(true); } }
    catch (error) { if (id === requestId.current) setRegisterError(error instanceof Error ? error.message : "Entries could not load."); }
    finally { if (id === requestId.current) setLoadingRecords(false); }
  };

  const openRegister = () => {
    setShowRecords(value => !value);
    if (!showRecords && !recordsLoaded) void loadRegisterRecords();
  };

  const handleExport = async () => {
    setIsExporting(true); setExportError(null);
    try {
      const records = recordsLoaded ? transactions : await getRecords();
      await exportReportsWorkbook({
        transactions: records,
        categories,
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        type: filters.type,
        categoryId: filters.categoryId,
        trend,
        grouping,
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not create the Excel workbook.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-content reports-page reports-modern">
      <header className="reports-modern__hero">
        <div>
          <h1>Reports</h1><p className="sp-page-subtitle">Understand cash flow and category performance.</p>
        </div>
        <button type="button" className="reports-modern__export" onClick={handleExport} disabled={isExporting || isLoading || Boolean(loadError)}>
          <FileSpreadsheet size={17} aria-hidden="true" />
          {isExporting ? "Preparing Excel…" : "Export to Excel"}

        </button>
      </header>

      {exportError && <p role="alert" className="reports-modern__error">{exportError}</p>}
      <ReportFiltersPanel
        filters={filters}
        categories={categories}
        today={today}
        isLoading={isLoading}
        onApply={setFilters}
      />

      {loadError && <div role="alert" className="reports-modern__error reports-modern__load-error">{loadError} <button type="button" onClick={() => { void loadReport(); }}>Retry</button></div>}

      <section className="reports-modern__kpis" aria-label="Filtered report totals" aria-busy={isLoading}>
        <article className={`reports-modern__kpi reports-modern__kpi--profit ${totals.net_profit_paisa < 0 ? "is-negative" : ""}`}>
          <span>Operating result</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : loadError ? "Unavailable" : formatPaisa(totals.net_profit_paisa)}</strong>
          <small>Cashbook basis</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--income">
          <span>Income</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : loadError ? "Unavailable" : formatPaisa(totals.income_paisa)}</strong>

        </article>
        <article className="reports-modern__kpi reports-modern__kpi--expense">
          <span>Expenses</span><TrendingDown size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : loadError ? "Unavailable" : formatPaisa(totals.expense_paisa)}</strong>

        </article>
        <article className="reports-modern__kpi reports-modern__kpi--count">
          <span>Transactions</span><FileSpreadsheet size={18} aria-hidden="true" />
          <strong>{isLoading || loadError ? "—" : totals.transaction_count.toLocaleString()}</strong>

        </article>
      </section>

      <section className="reports-modern__chart-panel">
        <div className="reports-modern__section-heading">
          <div><h2>Cash flow</h2><p>{grouping === "day" ? "Daily" : grouping === "week" ? "Weekly" : "Monthly"} income versus expenses</p></div>
          <div className="reports-modern__legend"><span><i className="is-income" />Income</span><span><i className="is-expense" />Expenses</span></div>
        </div>
        {isLoading ? <p role="status">Loading chart…</p> : loadError ? <p>Chart unavailable.</p> : <CashFlowChart rows={trend} range={`${formatDisplayDate(filters.fromDate)} – ${formatDisplayDate(filters.toDate)}`} />}

      </section>

      {!isLoading && !loadError && <ReportInsightCharts trend={trend} expenseCategories={expenseCategories} />}

      <div className="reports-modern__analysis-grid">
        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><h2>Category performance</h2></div></div>
          {categoryBreakdown.length === 0 ? <div className="reports-modern__empty">No category activity for these filters.</div> : <div className="reports-modern__table-scroll"><table><thead><tr><th>Category</th><th>Type</th><th>Entries</th><th>Total</th></tr></thead><tbody>
            {categoryBreakdown.map((item) => <tr key={item.key}><td><strong>{item.category_name}</strong></td><td><span className={`reports-modern__type-badge type-${item.type}`}>{item.type.replace("_", " ")}</span></td><td>{item.entry_count}</td><td className={item.type === "expense" ? "amount-expense" : item.type === "income" ? "amount-income" : ""}>{formatPaisa(item.total_paisa)}</td></tr>)}
          </tbody></table></div>}
        </section>

        <section className="reports-modern__table-panel">
          <div className="reports-modern__section-heading"><div><h2>Other cash movements</h2></div></div>
          <div className="reports-modern__movement-list">
            <div><span>Capital introduced</span><strong>{formatPaisa(totals.capital_in_paisa)}</strong></div>
            <div><span>Owner drawings</span><strong>{formatPaisa(totals.withdrawal_paisa)}</strong></div>
            <div><span>Cash adjustments in</span><strong>{formatPaisa(totals.adjustment_in_paisa)}</strong></div>
            <div><span>Cash adjustments out</span><strong>{formatPaisa(totals.adjustment_out_paisa)}</strong></div>
          </div>
          <p className="reports-modern__footnote">Operating result = income − operating expenses (cashbook basis, not accrual P&L).</p>
        </section>
      </div>

      <section className="reports-modern__table-panel reports-modern__transactions">
        <div className="reports-modern__section-heading"><div><h2>Transaction register</h2><p>{totals.transaction_count.toLocaleString()} matching entries</p></div><button className="button button-secondary" type="button" aria-expanded={showRecords} onClick={() => { void openRegister(); }}>{showRecords ? "Hide entries" : "View entries"}</button></div>
        {showRecords && <>
        <DataTable data={transactions} columns={columns} label="Transaction register" loading={isLoading || loadingRecords} error={registerError || loadError || undefined} onRetry={() => { void loadRegisterRecords(); }} searchable getRowId={tx => tx.id}
          onExportSelected={rows => exportToCSV("shop_pro_selected_entries", ["Date", "Type", "Category", "Description", "Account", "Amount"], rows.map(tx => [tx.business_date, tx.type, tx.category_name || "", tx.raw_text, tx.account_name || "", (tx.amount_paisa / 100).toFixed(2)]), today)} />
        </>}<p className="reports-modern__footnote">Excel includes all matching entries.</p>
      </section>
      <p className="reports-modern__footer-note">Active entries · Shop business dates</p>
    </div>
  );
};
