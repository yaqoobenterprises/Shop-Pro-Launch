import React, { useState, useEffect, useRef } from "react";
import { ledgerService } from "../../services/ledgerService";
import { formatPaisa } from "../../lib/money";
import { getKarachiBusinessDate } from "../../lib/dates";
import { useI18n } from "../../i18n";
import { RefreshCw } from "lucide-react";

interface MonthlyReportRow {
  month_start: string;
  year: number;
  month: number;
  income_paisa: number;
  expense_paisa: number;
  net_profit_paisa: number;
  capital_in_paisa: number;
  withdrawal_paisa: number;
  adjustment_in_paisa: number;
  adjustment_out_paisa: number;
}

export const LedgerReportsView: React.FC = () => {
  const { t } = useI18n();
  const currentYear = Number(getKarachiBusinessDate().slice(0, 4));
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [monthlyData, setMonthlyData] = useState<MonthlyReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadData = async () => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    setMonthlyData([]);
    try {
      const data = await ledgerService.getMonthlyReport(selectedYear);
      if (currentRequestId !== requestId.current) return;
      setMonthlyData(
        data.map((row) => ({
          month_start: row.month_start,
          year: row.year,
          month: row.month,
          income_paisa: Number(row.income_paisa || 0),
          expense_paisa: Number(row.expense_paisa || 0),
          net_profit_paisa: Number(row.net_profit_paisa || 0),
          capital_in_paisa: Number(row.capital_in_paisa || 0),
          withdrawal_paisa: Number(row.withdrawal_paisa || 0),
          adjustment_in_paisa: Number(row.adjustment_in_paisa || 0),
          adjustment_out_paisa: Number(row.adjustment_out_paisa || 0),
        })),
      );
    } catch (err) {
      console.error("Error loading reports:", err);
      if (currentRequestId === requestId.current) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "The selected reporting period could not be loaded.",
        );
      }
    } finally {
      if (currentRequestId === requestId.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedYear]);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const totalAnnualIncome = monthlyData.reduce(
    (acc, m) => acc + m.income_paisa,
    0,
  );
  const totalAnnualExpense = monthlyData.reduce(
    (acc, m) => acc + m.expense_paisa,
    0,
  );
  const totalAnnualProfit = monthlyData.reduce(
    (acc, month) => acc + month.net_profit_paisa,
    0,
  );

  const profitMargin =
    totalAnnualIncome > 0
      ? Math.round((totalAnnualProfit / totalAnnualIncome) * 100)
      : totalAnnualProfit > 0
      ? 100
      : 0;

  const maxMonthValue = Math.max(
    ...monthlyData.map((m) => Math.max(m.income_paisa, m.expense_paisa)),
    1,
  );
  const formatMetric = (amountPaisa: number) =>
    isLoading ? "Loading…" : loadError ? "—" : formatPaisa(amountPaisa);

  return (
    <main className="page-content reports-page">
      {/* Page Title */}
      <div className="page-title">
        <div>
          <span className="kicker">{selectedYear} FISCAL PERFORMANCE</span>
          <h1>Reports</h1>
          <p>Understand profitability, annual revenue trends, and operational expense ratios.</p>
        </div>

        <div className="title-actions">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            aria-label="Select report year"
          >
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
            <option value={currentYear - 2}>{currentYear - 2}</option>
          </select>

          <button
            type="button"
            className="icon-button"
            onClick={() => void loadData()}
            title="Refresh reports"
            aria-label="Refresh reports"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          {loadError}
        </div>
      )}

      {/* 3-Up Gradient Report Cards */}
      <div className="report-cards">
        <article>
          <span>NET PROFIT ({selectedYear})</span>
          <strong style={{ color: totalAnnualProfit >= 0 ? "var(--green)" : "var(--danger)" }}>
            {formatMetric(totalAnnualProfit)}
          </strong>
          <p>
            <em className={totalAnnualProfit >= 0 ? "" : "warm"}>
              {profitMargin}% margin
            </em>{" "}
            for the calendar year
          </p>
        </article>

        <article>
          <span>TOTAL REVENUE</span>
          <strong>{formatMetric(totalAnnualIncome)}</strong>
          <p>
            <em>Recorded income</em> across operating lines
          </p>
        </article>

        <article>
          <span>TOTAL EXPENSES</span>
          <strong>{formatMetric(totalAnnualExpense)}</strong>
          <p>
            <em className="warm">Operating outflows</em> and expenses
          </p>
        </article>
      </div>

      {/* Monthly Chart Panel */}
      <section className="panel report-chart">
        <div className="panel-heading">
          <div>
            <h2>Monthly Performance</h2>
            <p>Annual breakdown of income and expenses</p>
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

        <div className="line-report">
          <div className="report-y">
            <span>{formatPaisa(maxMonthValue)}</span>
            <span>{formatPaisa(Math.round(maxMonthValue * 0.75))}</span>
            <span>{formatPaisa(Math.round(maxMonthValue * 0.5))}</span>
            <span>{formatPaisa(Math.round(maxMonthValue * 0.25))}</span>
            <span>0</span>
          </div>

          <div className="report-bars">
            {monthlyData.map((row) => {
              const incPct = Math.min(100, Math.round((row.income_paisa / maxMonthValue) * 100));
              const expPct = Math.min(100, Math.round((row.expense_paisa / maxMonthValue) * 100));
              const label = monthNames[(row.month || 1) - 1]?.slice(0, 3) || `${row.month}`;

              return (
                <div key={row.month_start}>
                  <div>
                    <i
                      style={{ height: `${Math.max(incPct, 3)}%` }}
                      title={`Income: ${formatPaisa(row.income_paisa)}`}
                    />
                    <i
                      style={{ height: `${Math.max(expPct, 3)}%` }}
                      title={`Expenses: ${formatPaisa(row.expense_paisa)}`}
                    />
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Breakdown Table */}
      <section className="panel breakdown-table">
        <div className="panel-heading">
          <div>
            <h2>Monthly Breakdown</h2>
            <p>Financial ledger summary by month</p>
          </div>
        </div>

        <div className="breakdown-head">
          <span>Month</span>
          <span>Income</span>
          <span>Expenses</span>
          <span>Net Profit</span>
          <span style={{ textAlign: "right" }}>Margin</span>
        </div>

        {monthlyData.map((row) => {
          const mName = monthNames[(row.month || 1) - 1] || `Month ${row.month}`;
          const mMargin =
            row.income_paisa > 0
              ? Math.round((row.net_profit_paisa / row.income_paisa) * 100)
              : row.net_profit_paisa > 0
              ? 100
              : 0;

          return (
            <div className="breakdown-row" key={row.month_start}>
              <span style={{ fontWeight: 600 }}>{mName}</span>
              <span style={{ color: "var(--green)" }}>{formatPaisa(row.income_paisa)}</span>
              <span>{formatPaisa(row.expense_paisa)}</span>
              <strong style={{ color: row.net_profit_paisa >= 0 ? "var(--green)" : "var(--danger)" }}>
                {formatPaisa(row.net_profit_paisa)}
              </strong>
              <span style={{ textAlign: "right" }}>{mMargin}%</span>
            </div>
          );
        })}

        {monthlyData.length === 0 && !isLoading && !loadError && (
          <div className="empty-state">
            <strong>No data recorded</strong>
            <p>No ledger entries recorded for {selectedYear}.</p>
          </div>
        )}
      </section>
    </main>
  );
};
