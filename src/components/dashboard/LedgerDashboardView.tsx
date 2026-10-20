import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { ledgerService } from "../../services/ledgerService";
import { getKarachiBusinessDate } from "../../lib/dates";
import { formatPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { useI18n } from "../../i18n";
import { DatePicker } from "../common/DatePicker";
import { MonthPicker } from "../common/MonthPicker";
import {
  DailySummary,
  MonthlySummary,
  CategoryBreakdown,
  LedgerAccount,
} from "../../types/ledger";
import {
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

export const LedgerDashboardView: React.FC = () => {
  const { t } = useI18n();
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [currentDate, setCurrentDate] = useState(getKarachiBusinessDate());
  const [isLoading, setIsLoading] = useState(true);

  const [dailyData, setDailyData] = useState<DailySummary | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlySummary | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlySummary[]>([]);
  const [breakdowns, setBreakdowns] = useState<CategoryBreakdown[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    setDailyData(null);
    setMonthlyData(null);
    setMonthlyTrend([]);
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
      } else {
        const year = parseInt(currentDate.split("-")[0], 10);
        const month = parseInt(currentDate.split("-")[1], 10);
        const [mData, trendData] = await Promise.all([
          ledgerService.getMonthlySummary(year, month),
          ledgerService.getMonthlyReport(year),
        ]);
        if (currentRequestId !== requestId.current) return;
        setMonthlyData(mData);
        setMonthlyTrend(trendData);
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
  }, [period, currentDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeIncome =
    period === "day"
      ? dailyData?.income_paisa || 0
      : monthlyData?.income_paisa || 0;
  const activeExpense =
    period === "day"
      ? dailyData?.expense_paisa || 0
      : monthlyData?.expense_paisa || 0;
  const activeProfit =
    period === "day"
      ? dailyData?.net_profit_paisa || 0
      : monthlyData?.net_profit_paisa || 0;

  const activeCapital =
    period === "day"
      ? dailyData?.capital_in_paisa || 0
      : monthlyData?.capital_in_paisa || 0;
  const activeWithdrawal =
    period === "day"
      ? dailyData?.withdrawal_paisa || 0
      : monthlyData?.withdrawal_paisa || 0;
  const activeAdjIn =
    period === "day"
      ? dailyData?.adjustment_in_paisa || 0
      : monthlyData?.adjustment_in_paisa || 0;
  const activeAdjOut =
    period === "day"
      ? dailyData?.adjustment_out_paisa || 0
      : monthlyData?.adjustment_out_paisa || 0;

  const activeAccounts = accounts.filter((account) => account.is_active);
  const totalBalancePaisa = activeAccounts.reduce(
    (sum, account) => sum + (Number(account.balance_paisa) || 0),
    0,
  );

  const formatMetric = (amountPaisa: number) =>
    isLoading ? "Loading…" : loadError ? "—" : formatPaisa(amountPaisa);

  const expenseBreakdowns = useMemo(
    () => breakdowns.filter((b) => b.type === "expense" && b.total_paisa > 0),
    [breakdowns],
  );

  const trendMax = Math.max(
    ...monthlyTrend.map((m) => Math.max(m.income_paisa, m.expense_paisa)),
    1,
  );

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="page-content overview-page">
      {/* Page Title */}
      <div className="page-title">
        <div>
          <h1>Overview</h1>
        </div>

        <div className="title-actions overview-filter-controls">
          <div className="overview-period-toggle" role="group" aria-label="Overview period">
            <button
              type="button"
              aria-pressed={period === "day"}
              className={`button overview-period-option ${period === "day" ? "button-primary" : "button-secondary"}`}
              onClick={() => setPeriod("day")}
            >
              Day
            </button>
            <button
              type="button"
              aria-pressed={period === "month"}
              className={`button overview-period-option ${period === "month" ? "button-primary" : "button-secondary"}`}
              onClick={() => setPeriod("month")}
            >
              Month
            </button>
          </div>

          <div className="overview-period-picker">
            {period === "day" ? (
              <DatePicker
                value={currentDate}
                onChange={setCurrentDate}
                ariaLabel="Filter date"
                className="w-full"
              />
            ) : (
              <MonthPicker
                value={currentDate.slice(0, 7)}
                onChange={(value) => setCurrentDate(value)}
                ariaLabel="Filter month"
                className="w-full"
              />
            )}
          </div>

        </div>
      </div>

      {loadError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <p style={{ margin: 0, color: "var(--danger)" }}>{loadError}</p>
        </div>
      )}

      {/* 4-Up Metric Cards */}
      <div className="metrics">
        <article className="metric">
          <div className="metric-top">
            <span>Total Liquidity</span>
            <Wallet className="h-4 w-4" />
          </div>
          <strong className="metric-amount">
            <AnimatedAmount amountPaisa={totalBalancePaisa} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>

        <article className="metric">
          <div className="metric-top">
            <span>{t("dashboard.income")}</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <strong className="metric-amount">
            <AnimatedAmount amountPaisa={activeIncome} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>

        <article className="metric">
          <div className="metric-top">
            <span>{t("dashboard.expenses")}</span>
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <strong className="metric-amount">
            <AnimatedAmount amountPaisa={activeExpense} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>

        <article className="metric">
          <div className="metric-top">
            <span>{t("dashboard.netProfit")}</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <strong className="metric-amount" style={{ color: activeProfit >= 0 ? "var(--green)" : "var(--danger)" }}>
            <AnimatedAmount amountPaisa={activeProfit} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>
      </div>

      {/* Overview Grid: Cash Flow Panel + Reserves & Accounts */}
      <div className="overview-grid">
        {/* Left Column: Cash Flow Panel */}
        <section className="panel cash-panel">
          <div className="panel-heading">
            <div>
              <h2>Cash flow</h2>
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

          {period === "month" ? (
            <div>
              {monthlyTrend.length > 0 ? (
                <div className="cash-chart">
                  <div className="y-labels">
                    <span>{formatPaisa(trendMax)}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.75))}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.5))}</span>
                    <span>{formatPaisa(Math.round(trendMax * 0.25))}</span>
                    <span>0</span>
                  </div>
                  <div className="chart-bars">
                    {monthlyTrend.map((row, index) => {
                      const incHeight = Math.min(100, Math.round((row.income_paisa / trendMax) * 100));
                      const expHeight = Math.min(100, Math.round((row.expense_paisa / trendMax) * 100));
                      const label = monthNames[(row.month || 1) - 1] || `${row.month}`;
                      return (
                        <div
                          className="bar-group"
                          key={row.month_start}
                          style={{ "--bar-animation-delay": `${Math.min(index, 11) * 18}ms` } as React.CSSProperties}
                        >
                          <div>
                            <i style={{ height: `${Math.max(incHeight, 4)}%` }} title={`Income: ${formatPaisa(row.income_paisa)}`} />
                            <i style={{ height: `${Math.max(expHeight, 4)}%` }} title={`Expenses: ${formatPaisa(row.expense_paisa)}`} />
                          </div>
                          <span>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: "var(--type-body)", padding: "20px 0", textAlign: "center" }}>
                  No monthly trends recorded.
                </p>
              )}
            </div>
          ) : (
            <div style={{ padding: "16px 0" }}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--type-label)" }}>
                  <span>Recorded Income</span>
                  <strong className="positive" style={{ fontFamily: "DM Mono" }}>
                    {formatMetric(activeIncome)}
                  </strong>
                </div>
                <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    className="cash-progress-fill"
                    style={{
                      height: "100%",
                      width: `${Math.min(100, activeIncome > 0 ? 100 : 0)}%`,
                      background: "var(--green)",
                      borderRadius: 4,
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--type-label)", marginTop: 8 }}>
                  <span>Operating Expenses</span>
                  <strong style={{ fontFamily: "DM Mono", color: "var(--orange)" }}>
                    {formatMetric(activeExpense)}
                  </strong>
                </div>
                <div style={{ height: 8, background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    className="cash-progress-fill"
                    style={{
                      height: "100%",
                      width: `${activeIncome > 0 ? Math.min(100, (activeExpense / activeIncome) * 100) : activeExpense > 0 ? 100 : 0}%`,
                      background: "var(--orange)",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <p style={{ fontSize: "var(--type-caption)", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Expense totals by category
                </p>
                {expenseBreakdowns.length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: "var(--type-body)", padding: "16px 0", textAlign: "center" }}>
                    No active expenses for this date. Recorded expenses will appear here.
                  </p>
                ) : (
                  <>
                    <ul
                      aria-label="Expense totals by category"
                      style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}
                    >
                      {expenseBreakdowns.map((b) => (
                        <li
                          key={b.category_id || b.category_name}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "var(--type-label)",
                            padding: "6px 0",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          <span style={{ color: "var(--ink)" }}>{b.category_name}</span>
                          <span style={{ fontFamily: "DM Mono", color: "var(--orange)" }}>
                            {formatPaisa(b.total_paisa)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
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
