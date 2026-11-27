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
import { downloadPremiumXlsx } from "../../lib/premiumXlsx";
import { buildReportsWorkbook } from "./buildReportsWorkbook";
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
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
  const grouping = getTrendGrouping(filters.fromDate, filters.toDate);

  const expenseCategories = useMemo(
    () => categoryBreakdown.filter((item) => item.type === "expense" && item.total_paisa > 0),
    [categoryBreakdown],
  );
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

  return (
    <main className="page-content reports-page reports-modern">
      <header className="reports-modern__hero">
        <div>
          <h1>Reports</h1><p className="sp-page-subtitle">Understand cash flow and category performance.</p>
        </div>
        <button type="button" className="reports-modern__export" onClick={handleExport} disabled={isExporting || isLoading}>
          <FileSpreadsheet size={17} aria-hidden="true" />
          {isExporting ? "Preparing Excel…" : "Export to Excel"}

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
          <span>Operating result</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.net_profit_paisa)}</strong>
          <small>Cashbook basis</small>
        </article>
        <article className="reports-modern__kpi reports-modern__kpi--income">
          <span>Income</span><TrendingUp size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.income_paisa)}</strong>

        </article>
        <article className="reports-modern__kpi reports-modern__kpi--expense">
          <span>Expenses</span><TrendingDown size={18} aria-hidden="true" />
          <strong>{isLoading ? "Loading…" : formatPaisa(totals.expense_paisa)}</strong>

        </article>
        <article className="reports-modern__kpi reports-modern__kpi--count">
          <span>Transactions</span><FileSpreadsheet size={18} aria-hidden="true" />
          <strong>{isLoading ? "—" : totals.transaction_count.toLocaleString()}</strong>

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
        <div className="reports-modern__section-heading"><div><h2>Transaction register</h2></div><span className="reports-modern__record-count">{transactions.length.toLocaleString()} records</span></div>
        <DataTable data={transactions} columns={columns} label="Transaction register" loading={isLoading} error={loadError || undefined} onRetry={() => void loadReport()} searchable getRowId={tx => tx.id}
          onExportSelected={rows => exportToCSV("shop_pro_selected_entries", ["Date", "Type", "Category", "Description", "Account", "Amount"], rows.map(tx => [tx.business_date, tx.type, tx.category_name || "", tx.raw_text, tx.account_name || "", (tx.amount_paisa / 100).toFixed(2)]), today)} />
        <p className="reports-modern__footnote">The workbook includes every entry matching the report filters.</p>
      </section>
      <p className="reports-modern__footer-note">Active entries · Shop business dates</p>
    </main>
  );
};
