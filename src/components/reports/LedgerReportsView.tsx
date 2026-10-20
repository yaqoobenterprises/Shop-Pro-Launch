import React, { useCallback, useState, useEffect, useRef } from "react";
import { Select } from "../common/Select";
import { ledgerService } from "../../services/ledgerService";
import { formatPaisa } from "../../lib/money";
import { AnimatedAmount } from "../common/AnimatedAmount";
import { getKarachiBusinessDate } from "../../lib/dates";

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
  const currentYear = Number(getKarachiBusinessDate().slice(0, 4));
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [monthlyData, setMonthlyData] = useState<MonthlyReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
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
  }, [selectedYear]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const maxMonthValue = Math.max(
    ...monthlyData.map((m) => Math.max(m.income_paisa, m.expense_paisa)),
    1,
  );
  return (
    <main className="page-content reports-page">
      {/* Page Title */}
      <div className="page-title">
        <div>
          <h1>Reports</h1>
        </div>

        <div className="title-actions">
          <Select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            aria-label="Select report year"
          >
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
            <option value={currentYear - 2}>{currentYear - 2}</option>
          </Select>

        </div>
      </div>

      {loadError && (
        <div role="alert" className="toast-note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)", color: "var(--danger)" }}>
          {loadError}
        </div>
      )}

      {/* Annual report summary cards */}
      <div className="report-cards">
        <article>
          <span>NET PROFIT ({selectedYear})</span>
          <strong style={{ color: totalAnnualProfit >= 0 ? "var(--green)" : "var(--danger)" }}>
            <AnimatedAmount amountPaisa={totalAnnualProfit} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>

        <article>
          <span>TOTAL REVENUE</span>
          <strong>
            <AnimatedAmount amountPaisa={totalAnnualIncome} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>

        <article>
          <span>TOTAL EXPENSES</span>
          <strong>
            <AnimatedAmount amountPaisa={totalAnnualExpense} loading={isLoading} error={Boolean(loadError)} />
          </strong>
        </article>
      </div>

      {/* Monthly Chart Panel */}
      <section className="panel report-chart">
        <div className="panel-heading">
          <div>
            <h2>Monthly Performance</h2>
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
            {monthlyData.map((row, index) => {
              const incPct = Math.min(100, Math.round((row.income_paisa / maxMonthValue) * 100));
              const expPct = Math.min(100, Math.round((row.expense_paisa / maxMonthValue) * 100));
              const label = monthNames[(row.month || 1) - 1]?.slice(0, 3) || `${row.month}`;

              return (
                <div
                  key={row.month_start}
                  style={{ "--bar-animation-delay": `${Math.min(index, 11) * 18}ms` } as React.CSSProperties}
                >
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
