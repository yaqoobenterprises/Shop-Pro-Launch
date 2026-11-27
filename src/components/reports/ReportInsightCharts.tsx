import React, { useMemo } from "react";
import { FinancialDonut } from "../common/FinancialDonut";
import { useRegion } from "../../regional/region";
import { formatRecordedPaisa as formatPaisa } from "../../lib/money";
import type { ReportCategoryBucket, ReportTrendBucket } from "../../lib/reportAnalytics";

interface ReportInsightChartsProps {
  trend: ReportTrendBucket[];
  expenseCategories: ReportCategoryBucket[];
}



export const ReportInsightCharts: React.FC<ReportInsightChartsProps> = ({
  trend,
  expenseCategories,
}) => {
  const { region } = useRegion();
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
      points, min, max,
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
            <h2>Operating result</h2>
          </div>
          <span className="reports-modern__chart-unit">{region.currency}</span>
        </div>
        {!profitChart ? (
          <div className="reports-modern__empty">No operating result data for this reporting range.</div>
        ) : (
          <>
            <p className="reports-source-note">Scale: {formatPaisa(profitChart.min)} to {formatPaisa(profitChart.max)} · zero reference shown</p>
            <div className="reports-modern__profit-chart" role="img" aria-label="Operating result trend chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="3" y1="16" x2="97" y2="16" className="reports-modern__profit-gridline" />
                <line x1="3" y1="50" x2="97" y2="50" className="reports-modern__profit-gridline" />
                <line x1="3" y1={profitChart.zeroY} x2="97" y2={profitChart.zeroY} className="reports-modern__profit-zero" />
                <line x1="3" y1="84" x2="97" y2="84" className="reports-modern__profit-gridline" />
                <polygon points={`${profitChart.points[0].x},${profitChart.zeroY} ${profitChart.pointString} ${profitChart.points[profitChart.points.length-1].x},${profitChart.zeroY}`} fill="var(--chart-lavender)" opacity=".12"/>
                <polyline points={profitChart.pointString} className="reports-modern__profit-line" />
                {profitChart.points.map((point) => (
                  <circle key={point.title} cx={point.x} cy={point.y} r=".55" vectorEffect="non-scaling-stroke" className="reports-modern__profit-point">
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
            <h2>Expense mix</h2>
          </div>
        </div>
        {visibleExpenseCategories.length === 0 ? (
          <div className="reports-modern__empty">No expense categories in this reporting range.</div>
        ) : (
          <FinancialDonut label="Expense distribution" centerLabel="Expenses" items={visibleExpenseCategories.map(item=>({key:item.key,label:item.category_name,amount:item.total_paisa}))}/>
        )}
      </section>
    </div>
  );
};
