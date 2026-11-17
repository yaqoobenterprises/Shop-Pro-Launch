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
  const grouping = getTrendGrouping(filters.fromDate, filters.toDate);

  const expenseCategories = useMemo(
    () => categoryBreakdown.filter((item) => item.type === "expense" && item.total_paisa > 0),
    [categoryBreakdown],
  );
  const expenseCategoryTotal = expenseCategories.reduce((sum, item) => sum + item.total_paisa, 0);
  const visibleExpenseCategories = useMemo(() => {
    const top = expenseCategories.slice(0, 5);
    const otherTotal = expenseCategoryTotal - top.reduce((sum, item) => sum + item.total_paisa, 0);
    return otherTotal > 0
      ? [...top, { key: "other-expenses", category_name: "Other", total_paisa: otherTotal }]
      : top;
  }, [expenseCategories, expenseCategoryTotal]);
  const expenseDonutBackground = useMemo(() => {
    if (expenseCategoryTotal <= 0) return "conic-gradient(var(--line) 0deg 360deg)";
    let cumulative = 0;
    const palette = ["#14765e", "#5688a0", "#b96d45", "#809b77", "#7c78a8", "#8a9ba8"];
    const stops = visibleExpenseCategories.map((item, index) => {
      const start = cumulative;
      cumulative += (item.total_paisa / expenseCategoryTotal) * 100;
      return `${palette[index % palette.length]} ${start}% ${cumulative}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [visibleExpenseCategories, expenseCategoryTotal]);

  const profitChart = useMemo(() => {
    if (trend.length === 0) return null;
    const values = trend.map((bucket) => bucket.net_profit_paisa);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = Math.max(1, max - min);
    const points = values.map((value, index) => {
      const x = trend.length === 1 ? 50 : 4 + (index / (trend.length - 1)) * 92;
      const y = 84 - ((value - min) / span) * 68;
      return { x, y, value, label: trend[index].label, title: trend[index].title };
    });
    return {
      points,
      pointString: points.map((point) => `${point.x},${point.y}`).join(" "),
      zeroY: 84 - ((0 - min) / span) * 68,
      labelIndices: [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])],
    };
  }, [trend]);
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

      <div className="reports-modern__insight-grid">
        <section className="reports-modern__table-panel reports-modern__profit-panel">
          <div className="reports-modern__section-heading">
            <div><span className="reports-modern__section-kicker">PROFITABILITY</span><h2>Net profit trend</h2><p>Income minus operating expenses, grouped by the selected date range</p></div>
            <span className="reports-modern__chart-unit">PKR</span>
          </div>
          {!profitChart ? (
            <div className="reports-modern__empty">No profit data for this reporting range.</div>
          ) : (
            <>
              <div className="reports-modern__profit-chart" role="img" aria-label="Net profit trend chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="3" y1="16" x2="97" y2="16" className="reports-modern__profit-gridline" />
                  <line x1="3" y1="50" x2="97" y2="50" className="reports-modern__profit-gridline" />
                  <line x1="3" y1={profitChart.zeroY} x2="97" y2={profitChart.zeroY} className="reports-modern__profit-zero" />
                  <line x1="3" y1="84" x2="97" y2="84" className="reports-modern__profit-gridline" />
                  <polyline points={profitChart.pointString} className="reports-modern__profit-line" />
                  {profitChart.points.map((point) => (
                    <circle key={point.title} cx={point.x} cy={point.y} r="1.35" className="reports-modern__profit-point">
                      <title>{point.title}: {formatPaisa(point.value)}</title>
                    </circle>
                  ))}
                </svg>
              </div>
              <div className="reports-modern__profit-axis">
                {profitChart.labelIndices.map((index) => (
                  <span key={profitChart.points[index].title}>{profitChart.points[index].label}</span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="reports-modern__table-panel reports-modern__expense-panel">
          <div className="reports-modern__section-heading">
            <div><span className="reports-modern__section-kicker">SPENDING MIX</span><h2>Expenses by category</h2><p>Where operating spend is going</p></div>
          </div>
          {visibleExpenseCategories.length === 0 ? (
            <div className="reports-modern__empty">No expense categories in this reporting range.</div>
          ) : (
            <div className="reports-modern__expense-layout">
              <div
                className="reports-modern__expense-donut"
                role="img"
                aria-label={`Expense distribution, total ${formatPaisa(expenseCategoryTotal)}`}
                style={{ background: expenseDonutBackground }}
              >
                <div><strong>{formatPaisa(expenseCategoryTotal)}</strong><span>Total spend</span></div>
              </div>
              <ul className="reports-modern__expense-legend" aria-label="Expense amounts by category">
                {visibleExpenseCategories.map((item, index) => {
                  const palette = ["#14765e", "#5688a0", "#b96d45", "#809b77", "#7c78a8", "#8a9ba8"];
                  return (
                    <li key={item.key}>
                      <span><i style={{ background: palette[index % palette.length] }} />{item.category_name}</span>
                      <strong>{formatPaisa(item.total_paisa)}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

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
