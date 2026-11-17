import React, { useMemo } from "react";
import { formatPaisa } from "../../lib/money";
import type { ReportCategoryBucket, ReportTrendBucket } from "../../lib/reportAnalytics";

interface ReportInsightChartsProps {
  trend: ReportTrendBucket[];
  expenseCategories: ReportCategoryBucket[];
}

const EXPENSE_PALETTE = ["#14765e", "#5688a0", "#b96d45", "#809b77", "#7c78a8", "#8a9ba8"];

export const ReportInsightCharts: React.FC<ReportInsightChartsProps> = ({
  trend,
  expenseCategories,
}) => {
  const expenseCategoryTotal = expenseCategories.reduce(
    (sum, item) => sum + item.total_paisa,
    0,
  );

  const visibleExpenseCategories = useMemo(() => {
    const top = expenseCategories.slice(0, 5);
    const otherTotal = expenseCategoryTotal - top.reduce(
      (sum, item) => sum + item.total_paisa,
      0,
    );
    return otherTotal > 0
      ? [...top, { key: "other-expenses", category_name: "Other", total_paisa: otherTotal }]
      : top;
  }, [expenseCategories, expenseCategoryTotal]);

  const expenseDonutBackground = useMemo(() => {
    if (expenseCategoryTotal <= 0) return "conic-gradient(var(--line) 0deg 360deg)";
    let cumulative = 0;
    const stops = visibleExpenseCategories.map((item, index) => {
      const start = cumulative;
      cumulative += (item.total_paisa / expenseCategoryTotal) * 100;
      return `${EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]} ${start}% ${cumulative}%`;
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

  return (
    <div className="reports-modern__insight-grid">
      <section className="reports-modern__table-panel reports-modern__profit-panel">
        <div className="reports-modern__section-heading">
          <div>
            <span className="reports-modern__section-kicker">PROFITABILITY</span>
            <h2>Net profit trend</h2>
            <p>Income minus operating expenses, grouped by the selected date range</p>
          </div>
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
          <div>
            <span className="reports-modern__section-kicker">SPENDING MIX</span>
            <h2>Expenses by category</h2>
            <p>Where operating spend is going</p>
          </div>
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
              <div>
                <strong>{formatPaisa(expenseCategoryTotal)}</strong>
                <span>Total spend</span>
              </div>
            </div>
            <ul className="reports-modern__expense-legend" aria-label="Expense amounts by category">
              {visibleExpenseCategories.map((item, index) => (
                <li key={item.key}>
                  <span>
                    <i style={{ background: EXPENSE_PALETTE[index % EXPENSE_PALETTE.length] }} />
                    {item.category_name}
                  </span>
                  <strong>{formatPaisa(item.total_paisa)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};
