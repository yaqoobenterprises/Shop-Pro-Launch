import React, { useMemo } from "react";
import { FinancialTrend } from "../common/FinancialTrend";
import { FinancialDonut } from "../common/FinancialDonut";
import { useRegion } from "../../regional/region";
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




  return (
    <div className="reports-modern__insight-grid">
      <section className="reports-modern__table-panel reports-modern__profit-panel">
        <div className="reports-modern__section-heading">
          <div>
            <h2>Operating result</h2>
          </div>
          <span className="reports-modern__chart-unit">{region.currency}</span>
        </div>
        {trend.length ? <FinancialTrend rows={trend} mode="result" label="Operating result trend chart"/> : <div className="reports-modern__empty">No activity</div>}
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
