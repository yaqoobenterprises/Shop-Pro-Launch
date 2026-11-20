import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { ledgerService } from "../../services/ledgerService";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import { formatPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { useI18n } from "../../i18n";
import { OverviewPeriodControls, type OverviewPeriod } from "./OverviewPeriodControls";
import "./OverviewAnalytics.css";
import "./OverviewPremium.css";
import { OverviewMetricCard } from "./OverviewMetricCard";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, type ReportTrendBucket } from "../../lib/reportAnalytics";
import { getWeekRangeForDate } from "../../lib/reportDateRanges";
import {
  DailySummary,
  CategoryBreakdown,
  LedgerAccount,
} from "../../types/ledger";
import {
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

const EXPENSE_CHART_PALETTE = ["#14765e", "#5688a0", "#b96d45", "#809b77", "#7c78a8", "#8a9ba8"];

export const LedgerDashboardView: React.FC = () => {
  const { t } = useI18n();
  const [period, setPeriod] = useState<OverviewPeriod>("day");
  const [currentDate, setCurrentDate] = useState(getKarachiBusinessDate());
  const [rangeStart, setRangeStart] = useState(getKarachiBusinessDate());
  const [rangeEnd, setRangeEnd] = useState(getKarachiBusinessDate());
  const [isLoading, setIsLoading] = useState(true);

  const [dailyData, setDailyData] = useState<DailySummary | null>(null);
  const [rangeSummary, setRangeSummary] = useState<ReturnType<typeof calculateReportTotals> | null>(null);
  const [rangeTrend, setRangeTrend] = useState<ReportTrendBucket[]>([]);
  const [breakdowns, setBreakdowns] = useState<CategoryBreakdown[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    setDailyData(null);
    setRangeSummary(null);
    setRangeTrend([]);
    setBreakdowns([]);
    setAccounts([]);
    try {
      const availableAccounts = await ledgerService.getPaymentAccounts();
      if (currentRequestId !== requestId.current) return;
      setAccounts(availableAccounts);

      if (period === "day") {
        const [daySummary, bData] = await Promise.all([
          ledgerService.getDailySummary(currentDate),
          ledgerService.getCategoryBreakdown(currentDate),
        ]);
        if (currentRequestId !== requestId.current) return;
        setDailyData(daySummary);
        setBreakdowns(bData || []);
      } else if (period === "month") {
        const year = parseInt(currentDate.split("-")[0], 10);
        const month = parseInt(currentDate.split("-")[1], 10);
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        const today = getKarachiBusinessDate();
        const endDate = monthEnd > today && startDate <= today ? today : monthEnd;
        const records = await ledgerService.getAllFilteredTransactions({
          startDate,
          endDate,
          status: "active",
        });
        if (currentRequestId !== requestId.current) return;
        setRangeSummary(calculateReportTotals(records));
        setRangeTrend(buildReportTrend(records, startDate, endDate));
        setBreakdowns(buildReportCategoryBreakdown(records).map((item) => ({
          business_date: startDate,
          type: item.type,
          category_id: item.category_id || "uncategorized",
          category_name: item.category_name,
          total_paisa: item.total_paisa,
          entry_count: item.entry_count,
        })));
      } else {
        const [startDate, endDate] = period === "week"
          ? getWeekRangeForDate(currentDate)
          : [rangeStart, rangeEnd];
        if (startDate > endDate) throw new Error("The start date must be on or before the end date.");
        const records = await ledgerService.getAllFilteredTransactions({
          startDate,
          endDate,
          status: "active",
        });
        if (currentRequestId !== requestId.current) return;
        setRangeSummary(calculateReportTotals(records));
        setRangeTrend(buildReportTrend(records, startDate, endDate));
        setBreakdowns(buildReportCategoryBreakdown(records).map((item) => ({
          business_date: startDate,
          type: item.type,
          category_id: item.category_id || "uncategorized",
          category_name: item.category_name,
          total_paisa: item.total_paisa,
          entry_count: item.entry_count,
        })));
      }
    } catch (err) {
      console.error("Error fetching dashboard summary views:", err);
      if (currentRequestId === requestId.current) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Some overview data could not be loaded. Refresh to try again.",
        );
      }
    } finally {
      if (currentRequestId === requestId.current) setIsLoading(false);
    }
  }, [period, currentDate, rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeSummary = period === "day" ? dailyData : rangeSummary;
  const activeIncome = activeSummary?.income_paisa || 0;
  const activeExpense = activeSummary?.expense_paisa || 0;
  const activeProfit = activeSummary?.net_profit_paisa || 0;
  const activeCapital = activeSummary?.capital_in_paisa || 0;
  const activeWithdrawal = activeSummary?.withdrawal_paisa || 0;
  const activeAdjIn = activeSummary?.adjustment_in_paisa || 0;
  const activeAdjOut = activeSummary?.adjustment_out_paisa || 0;

  const activeAccounts = accounts.filter((account) => account.is_active);
  const totalBalancePaisa = activeAccounts.reduce(
    (sum, account) => sum + (Number(account.balance_paisa) || 0),
    0,
  );

  const expenseBreakdowns = useMemo(
    () => breakdowns.filter((b) => b.type === "expense" && b.total_paisa > 0),
    [breakdowns],
  );
  const expenseBreakdownTotal = expenseBreakdowns.reduce((sum, item) => sum + item.total_paisa, 0);
  const expenseDonutBackground = useMemo(() => {
    if (expenseBreakdownTotal <= 0) return "conic-gradient(var(--line) 0deg 360deg)";
    let cumulative = 0;
    const stops = expenseBreakdowns.map((item, index) => {
      const start = cumulative;
      cumulative += (item.total_paisa / expenseBreakdownTotal) * 100;
      return `${EXPENSE_CHART_PALETTE[index % EXPENSE_CHART_PALETTE.length]} ${start}% ${cumulative}%`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [expenseBreakdowns, expenseBreakdownTotal]);

  const trendRows: ReportTrendBucket[] = rangeTrend;
  const selectedRangeLabel = period === "day"
    ? formatDisplayDate(currentDate)
    : period === "week"
      ? getWeekRangeForDate(currentDate).map(formatDisplayDate).join(" – ")
      : period === "month"
        ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${currentDate.slice(0, 7)}-01T00:00:00.000Z`))
        : `${formatDisplayDate(rangeStart)} – ${formatDisplayDate(rangeEnd)}`;
  const trendMax = Math.max(...trendRows.map((row) => Math.max(row.income_paisa, row.expense_paisa)), 1);

  return (
    <div className="page-content overview-page">
      {/* Page Title */}
      <div className="page-title">
        <div className="overview-page-heading">
          <span className="kicker">CASHBOOK</span>
          <h1>Overview</h1>
          <p>Recorded activity and account balances.</p>
        </div>

        <OverviewPeriodControls
          period={period}
          setPeriod={setPeriod}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          rangeStart={rangeStart}
          setRangeStart={setRangeStart}
          rangeEnd={rangeEnd}
          setRangeEnd={setRangeEnd}
          today={getKarachiBusinessDate()}
        />
      </div>

      {loadError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <p style={{ margin: 0, color: "var(--danger)" }}>{loadError}</p>
        </div>
      )}

      <div className="metrics" aria-label="Business overview">
        <OverviewMetricCard
          label="Cash & bank"
          scope="Latest loaded account balances"
          icon={Wallet}
          amountPaisa={totalBalancePaisa}
          state={isLoading ? "loading" : loadError || activeAccounts.length === 0 ? "unavailable" : "ready"}
        />
        <OverviewMetricCard
          label="Income"
          scope="Selected cashbook period"
          icon={TrendingUp}
          amountPaisa={activeIncome}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"}
        />
        <OverviewMetricCard
          label="Expenses"
          scope="Selected cashbook period"
          icon={ArrowDownLeft}
          amountPaisa={activeExpense}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"}
        />
        <OverviewMetricCard
          label="Operating result"
          scope="Cashbook basis · not accrual P&L"
          icon={ArrowUpRight}
          amountPaisa={activeProfit}
          tone={activeProfit < 0 ? "negative" : "positive"}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"}
        />
      </div>

      {/* Overview Grid: Cash Flow Panel + Reserves & Accounts */}
      <div className="overview-grid">
        {/* Left Column: Cash Flow Panel */}
        <section className="panel cash-panel">
          <div className="panel-heading">
            <div>
              <h2>Income & expenses</h2>
              <p className="overview-chart-range">{selectedRangeLabel}</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="green" />
                Income
              </span>
              <span>
                <i />
                Expenses
              </span>
            </div>
          </div>

          {period !== "day" ? (
            <div>
              {trendRows.length > 0 ? (
                <div className="cash-chart">
                  <div className="y-labels">
                    <span>{formatPaisa(trendMax)}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.75))}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.5))}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.25))}</span>
                    <span>0</span>
                  </div>
                  <div className="chart-bars">
                    {trendRows.map((row, index) => {
                      const incHeight = row.income_paisa > 0 ? Math.max(4, Math.min(100, Math.round((row.income_paisa / trendMax) * 100))) : 0;
                      const expHeight = row.expense_paisa > 0 ? Math.max(4, Math.min(100, Math.round((row.expense_paisa / trendMax) * 100))) : 0;
                      return (
                        <div
                          className="bar-group"
                          key={row.key}
                          title={row.title}
                          style={{ "--bar-animation-delay": `${Math.min(index, 15) * 18}ms` } as React.CSSProperties}
                        >
                          <div>
                            <i style={{ height: `${incHeight}%` }} title={`Income: ${formatPaisa(row.income_paisa)}`} />
                            <i style={{ height: `${expHeight}%` }} title={`Expenses: ${formatPaisa(row.expense_paisa)}`} />
                          </div>
                          <span>{row.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                  <table className="sr-only" aria-label="Income and expenses by period">
                    <caption>Recorded cashbook activity for {selectedRangeLabel}</caption>
                    <thead><tr><th scope="col">Period</th><th scope="col">Income</th><th scope="col">Expenses</th></tr></thead>
                    <tbody>
                      {trendRows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row">{row.title}</th>
                          <td>{formatPaisa(row.income_paisa)}</td>
                          <td>{formatPaisa(row.expense_paisa)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "var(--type-body)", padding: "20px 0", textAlign: "center" }}>
                  No entries recorded for this range.
                </p>
              )}
            </div>
          ) : (
            <div style={{ padding: "16px 0" }}>
              <div>
                <p style={{ fontSize: "var(--type-caption)", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Expense totals by category
                </p>
                {expenseBreakdowns.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "var(--type-body)", padding: "16px 0", textAlign: "center" }}>
                    No active expenses for this date. Recorded expenses will appear here.
                  </p>
                ) : (
                  <div className="expense-breakdown-layout">
                    <div
                      className="expense-donut"
                      role="img"
                      aria-label={`Expense category distribution. Total ${formatPaisa(expenseBreakdownTotal)}`}
                      style={{ background: expenseDonutBackground }}
                    >
                      <div className="expense-donut__center">
                        <strong>{formatPaisa(expenseBreakdownTotal)}</strong>
                        <span>Total spend</span>
                      </div>
                    </div>
                    <ul
                      aria-label="Expense totals by category"
                      className="expense-category-list"
                    >
                      {expenseBreakdowns.map((b, index) => (
                        <li key={b.category_id || b.category_name}>
                          <span className="expense-category-label">
                            <i
                              style={{ background: EXPENSE_CHART_PALETTE[index % EXPENSE_CHART_PALETTE.length] }}
                              aria-hidden="true"
                            />
                            <span>{b.category_name}</span>
                          </span>
                          <span className="expense-category-amount">
                            <small>{Math.round((b.total_paisa / expenseBreakdownTotal) * 100)}%</small>
                            <strong>{formatPaisa(b.total_paisa)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Reserves & Active Accounts */}
        <div style={{ display: "grid", gap: 14 }}>
          {/* Non-Operating Capital Panel */}
          <section className="panel health-panel">
            <div className="panel-heading">
              <div>
                <h2>Capital & Drawings</h2>
              </div>
            </div>

            <div className="health-items">
              <span>
                Capital Introduced
                <strong>
                  <AnimatedAmount amountPaisa={activeCapital} loading={isLoading} error={Boolean(loadError)} />
                </strong>
              </span>
              <span>
                Owner Drawings
                <strong>
                  <AnimatedAmount amountPaisa={activeWithdrawal} loading={isLoading} error={Boolean(loadError)} />
                </strong>
              </span>
              <span>
                Cash Adjustments In
                <strong>
                  <AnimatedAmount amountPaisa={activeAdjIn} loading={isLoading} error={Boolean(loadError)} />
                </strong>
              </span>
              <span>
                Cash Adjustments Out
                <strong>
                  <AnimatedAmount amountPaisa={activeAdjOut} loading={isLoading} error={Boolean(loadError)} />
                </strong>
              </span>
            </div>
          </section>

          {/* Active Accounts Panel */}
          <section className="panel transactions-panel">
            <div className="panel-heading">
              <div>
                <h2>Active Accounts</h2>
              </div>
            </div>

            <div>
              {activeAccounts.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "var(--type-body)", padding: "16px 0", textAlign: "center" }}>
                  No active shop accounts are available. Set up an account to see balances.
                </p>
              ) : (
                <ul
                  aria-label="Current balances by account"
                  style={{ listStyle: "none", padding: 0, margin: 0, display: "grid" }}
                >
                  {activeAccounts.slice(0, 5).map((acc) => {
                    const initials = acc.type === "CASH" ? "CA" : acc.type === "BANK" ? "BA" : "DW";
                    return (
                      <li className="transaction" key={acc.id}>
                        <span className="transaction-icon">{initials}</span>
                        <div>
                          <strong>{acc.name}</strong>
                          <small>{acc.type} {acc.is_default ? "· Primary Drawer" : ""}</small>
                        </div>
                        <strong>{formatPaisa(acc.balance_paisa)}</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
