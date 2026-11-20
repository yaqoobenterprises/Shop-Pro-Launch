import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { ledgerService } from "../../services/ledgerService";
import { formatDisplayDate, getKarachiBusinessDate } from "../../lib/dates";
import { formatPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { OverviewPeriodControls, type OverviewPeriod } from "./OverviewPeriodControls";
import "./OverviewAnalytics.css";
import "./OverviewPremium.css";
import "./OverviewReference.css";
import { OverviewMetricCard } from "./OverviewMetricCard";
import { OverviewAreaChart } from "./OverviewAreaChart";
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

const EXPENSE_CHART_PALETTE = ["var(--chart-lavender)", "var(--chart-teal)", "var(--chart-pink)", "#8d96ad", "#7eaab4", "#a1a1b6"];

export const LedgerDashboardView: React.FC = () => {
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
  return (
    <div className="page-content overview-page aq-overview">
      <div className="page-title">
        <div className="overview-page-heading">
          <span className="kicker">CASHBOOK OVERVIEW</span>
          <h1>Business overview</h1>
          <p>Recorded activity and balances, with their correct date basis.</p>
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
        <div role="alert" className="aq-overview__error">
          <strong>Overview unavailable</strong>
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadData()}>Retry</button>
        </div>
      )}

      <div className="metrics" aria-label="Business overview">
        <OverviewMetricCard label="Cash & bank" scope="Latest loaded account balances" icon={Wallet}
          amountPaisa={totalBalancePaisa}
          state={isLoading ? "loading" : loadError || !activeAccounts.length ? "unavailable" : "ready"} />
        <OverviewMetricCard label="Income" scope="Selected cashbook period" icon={TrendingUp}
          amountPaisa={activeIncome}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"} />
        <OverviewMetricCard label="Expenses" scope="Selected cashbook period" icon={ArrowDownLeft}
          amountPaisa={activeExpense}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"} />
        <OverviewMetricCard label="Operating result" scope="Cashbook basis · not accrual P&L" icon={ArrowUpRight}
          amountPaisa={activeProfit} tone={activeProfit < 0 ? "negative" : "positive"}
          state={isLoading ? "loading" : !activeSummary || loadError ? "unavailable" : "ready"} />
      </div>

      <div className="aq-overview__visuals">
        <section className="panel cash-panel">
          <div className="panel-heading">
            <div>
              <h2>Income & expenses</h2>
              <p className="overview-chart-range">{selectedRangeLabel}</p>
            </div>
            <span className="aq-overview__basis">Cashbook</span>
          </div>
          {period !== "day" ? (
            isLoading ? <p className="aq-overview__empty" role="status">Loading chart…</p>
              : loadError ? <p className="aq-overview__empty">Chart unavailable.</p>
                : <OverviewAreaChart rows={trendRows} range={selectedRangeLabel} />
          ) : (
            <div className="aq-overview__day">
              {isLoading ? <p role="status">Loading activity…</p>
                : !activeSummary || loadError ? <p>Activity unavailable.</p>
                  : (
                    <div className="aq-day-compare" role="group" aria-label="Income and expenses for selected date">
                      <div className="aq-day-compare__row">
                        <div><span>Income</span><strong>{formatPaisa(activeIncome)}</strong></div>
                        <div className="aq-day-compare__track"><i style={{ width: `${activeIncome > 0 ? 100 * activeIncome / Math.max(activeIncome, activeExpense, 1) : 0}%` }} /></div>
                      </div>
                      <div className="aq-day-compare__row aq-day-compare__row--expense">
                        <div><span>Expenses</span><strong>{formatPaisa(activeExpense)}</strong></div>
                        <div className="aq-day-compare__track"><i style={{ width: `${activeExpense > 0 ? 100 * activeExpense / Math.max(activeIncome, activeExpense, 1) : 0}%` }} /></div>
                      </div>
                      {activeIncome === 0 && activeExpense === 0 && <p className="aq-overview__empty">No income or expenses recorded for this date.</p>}
                    </div>
                  )}
              <p className="aq-overview__note">Select Week, Month or Custom to explore a time-series chart.</p>
            </div>
          )}
        </section>

        <section className="panel aq-overview__distribution">
          <div className="panel-heading">
            <div>
              <h2>Expenses by category</h2>
              <p className="overview-chart-range">{selectedRangeLabel}</p>
            </div>
          </div>
          {isLoading ? <p className="aq-overview__empty" role="status">Loading categories…</p>
            : loadError ? <p className="aq-overview__empty">Category breakdown unavailable.</p>
              : expenseBreakdowns.length === 0 ? (
                <p className="aq-overview__empty">No active expenses for this date. Recorded expenses will appear here.</p>
              ) : (
                <>
                  <div className="aq-overview__donut-wrap">
                    <div className="expense-donut" role="img"
                      aria-label={`Expense category distribution. Total ${formatPaisa(expenseBreakdownTotal)}`}
                      style={{ background: expenseDonutBackground }}>
                      <div className="expense-donut__center">
                        <strong>{formatPaisa(expenseBreakdownTotal)}</strong>
                        <span>Total recorded</span>
                      </div>
                    </div>
                  </div>
                  <ul className="expense-category-list" aria-label="Expense totals by category">
                    {expenseBreakdowns.map((b, index) => (
                      <li key={b.category_id || b.category_name}>
                        <span className="expense-category-label">
                          <i style={{ background: EXPENSE_CHART_PALETTE[index % EXPENSE_CHART_PALETTE.length] }} aria-hidden="true" />
                          <span>{b.category_name}</span>
                        </span>
                        <span className="expense-category-amount">
                          <small>{Math.round((b.total_paisa / expenseBreakdownTotal) * 100)}%</small>
                          <strong>{formatPaisa(b.total_paisa)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {activeSummary && activeExpense !== expenseBreakdownTotal && (
                    <p className="aq-overview__coverage">Category totals do not match the period expense total. Review the source entries.</p>
                  )}
                </>
              )}
        </section>
      </div>

      <div className="aq-overview__details">
        <section className="panel transactions-panel">
          <div className="panel-heading"><h2>Cash & bank accounts</h2><span className="aq-overview__basis">Balances as loaded</span></div>
          {isLoading ? <p role="status" className="aq-overview__empty">Loading accounts…</p>
            : loadError ? <p className="aq-overview__empty">Accounts unavailable.</p>
              : activeAccounts.length === 0 ? <p className="aq-overview__empty">No active shop accounts are available. Set up an account to see balances.</p>
                : <ul aria-label="Current balances by account" className="aq-overview__accounts">
                    {activeAccounts.map((acc) => (
                      <li className="transaction" key={acc.id}>
                        <span className="transaction-icon">{acc.type === "CASH" ? "CA" : acc.type === "BANK" ? "BA" : "WL"}</span>
                        <div><strong>{acc.name}</strong><small>{acc.type}{acc.is_default ? " · Primary" : ""}</small></div>
                        <strong className="num">{formatPaisa(acc.balance_paisa)}</strong>
                      </li>
                    ))}
                  </ul>}
        </section>
        <section className="panel health-panel">
          <div className="panel-heading"><h2>Capital & adjustments</h2></div>
          <div className="health-items">
            <span>Capital introduced<strong><AnimatedAmount amountPaisa={activeCapital} loading={isLoading} error={Boolean(loadError) || !activeSummary} /></strong></span>
            <span>Owner drawings<strong><AnimatedAmount amountPaisa={activeWithdrawal} loading={isLoading} error={Boolean(loadError) || !activeSummary} /></strong></span>
            <span>Cash adjustments in<strong><AnimatedAmount amountPaisa={activeAdjIn} loading={isLoading} error={Boolean(loadError) || !activeSummary} /></strong></span>
            <span>Cash adjustments out<strong><AnimatedAmount amountPaisa={activeAdjOut} loading={isLoading} error={Boolean(loadError) || !activeSummary} /></strong></span>
          </div>
        </section>
      </div>
    </div>
  );
};
