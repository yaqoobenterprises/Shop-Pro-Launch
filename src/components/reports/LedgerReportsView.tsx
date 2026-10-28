import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { DatePicker } from "../common/DatePicker";
import { ledgerService } from "../../services/ledgerService";
import { formatPaisa } from "../../lib/money";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import type { Category, Transaction, TransactionType } from "../../types/ledger";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, getTrendGrouping } from "../../lib/reportAnalytics";
import { downloadPremiumXlsx } from "../../lib/premiumXlsx";
import { buildReportsWorkbook } from "./buildReportsWorkbook";
import "./ReportsAnalytics.css";

type TypeFilter = "all" | TransactionType;
interface ReportFilters {
  fromDate: string;
  toDate: string;
  type: TypeFilter;
  categoryId: string;
}
const types: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All transaction types" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "capital_in", label: "Capital introduced" },
  { value: "withdrawal", label: "Owner drawings" },
  { value: "adjustment", label: "Cash adjustments" },
];
const dateDaysAgo = (date: string, days: number): string => {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
};

export const LedgerReportsView: React.FC = () => {
  const today = getKarachiBusinessDate();
  const currentYearStart = `${today.slice(0, 4)}-01-01`;
  const [fromDate, setFromDate] = useState(currentYearStart);
  const [toDate, setToDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
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
  const [filterError, setFilterError] = useState<string | null>(null);
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
  const matchingCategories = categories.filter((category) =>
    typeFilter === "all" ||
    typeFilter === "capital_in" ||
    typeFilter === "withdrawal" ||
    typeFilter === "adjustment" ||
    category.kind === typeFilter,
  );

  const applyFilters = () => {
    if (!fromDate || !toDate) {
      setFilterError("Please select both a start and end date.");
      return;
    }
    if (fromDate > toDate) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    setFilterError(null);
    setFilters({ fromDate, toDate, type: typeFilter, categoryId: categoryFilter });
  };

  const applyRange = (start: string, end: string) => {
    setFromDate(start);
    setToDate(end);
    setFilterError(null);
    setFilters({ fromDate: start, toDate: end, type: typeFilter, categoryId: categoryFilter });
  };

  const setType = (value: TypeFilter) => {
    setTypeFilter(value);
    setCategoryFilter("all");
  };

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

      <section className="reports-modern__filters" aria-label="Report filters">
        <div className="reports-modern__filter-heading">
          <div className="reports-modern__filter-title"><Filter size={17} aria-hidden="true" /><h2>Build your report</h2></div>
          <span className="reports-modern__filter-note">Every chart and total uses the selected filters</span>
        </div>
        <div className="reports-modern__presets" role="group" aria-label="Quick date ranges">
          <button type="button" onClick={() => applyRange(dateDaysAgo(today, 6), today)}>Last 7 days</button>
          <button type="button" onClick={() => applyRange(dateDaysAgo(today, 29), today)}>Last 30 days</button>
          <button type="button" onClick={() => applyRange(`${today.slice(0, 7)}-01`, today)}>This month</button>
          <button type="button" onClick={() => applyRange(currentYearStart, today)}>Year to date</button>
        </div>
        <div className="reports-modern__filter-grid">
          <label className="reports-modern__field">
            <span>From date</span>
            <DatePicker value={fromDate} onChange={setFromDate} ariaLabel="Report start date" max={toDate || today} className="w-full" />
          </label>
          <label className="reports-modern__field">
            <span>To date</span>
            <DatePicker value={toDate} onChange={setToDate} ariaLabel="Report end date" min={fromDate} max={today} className="w-full" />
          </label>
          <label className="reports-modern__field">
            <span>Transaction type</span>
            <select value={typeFilter} onChange={(event) => setType(event.target.value as TypeFilter)} className="workspace-control w-full">
              {types.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="reports-modern__field">
            <span>Category</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="workspace-control w-full">
              <option value="all">All categories</option>
              {matchingCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <div className="reports-modern__filter-actions">
            <button type="button" className="reports-modern__apply" onClick={applyFilters} disabled={isLoading}>
              <Filter size={15} aria-hidden="true" /> Apply filters
            </button>
            <button type="button" className="reports-modern__reset" onClick={() => {
              setFromDate(currentYearStart);
              setToDate(today);
              setTypeFilter("all");
              setCategoryFilter("all");
              setFilterError(null);
              setFilters({ fromDate: currentYearStart, toDate: today, type: "all", categoryId: "all" });
            }}>
              <RotateCcw size={15} aria-hidden="true" /> Reset
            </button>
          </div>
        </div>
        {filterError && <p role="alert" className="reports-modern__error">{filterError}</p>}
        <div className="reports-modern__active-range"><CalendarDays size={15} aria-hidden="true" /><strong>{rangeLabel}</strong><span>{filters.type === "all" ? "All transaction types" : types.find((item) => item.value === filters.type)?.label}</span><span>{filters.categoryId === "all" ? "All categories" : categories.find((item) => item.id === filters.categoryId)?.name}</span></div>
      </section>

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
