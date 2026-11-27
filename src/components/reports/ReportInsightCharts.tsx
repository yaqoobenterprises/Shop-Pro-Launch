import React from "react";
import type { ReportCategoryBucket, ReportTrendBucket } from "../../lib/reportAnalytics";
import { CashFlowChart } from "../charts/CashFlowChart";
import { CategoryDonut } from "../charts/CategoryDonut";

export const ReportInsightCharts: React.FC<{ trend: ReportTrendBucket[]; expenseCategories: ReportCategoryBucket[] }> = ({ trend, expenseCategories }) => (
  <div className="reports-modern__insight-grid">
    <section className="reports-modern__table-panel">
      <div className="reports-modern__section-heading"><h2>Net result</h2></div>
      <CashFlowChart rows={trend} range="selected reporting period" resultOnly />
    </section>
    <section className="reports-modern__table-panel">
      <div className="reports-modern__section-heading"><h2>Expenses by category</h2></div>
      <CategoryDonut listLabel="Expense amounts by category" items={expenseCategories.map(item => ({ key: item.key, label: item.category_name, amountPaisa: item.total_paisa }))} />
    </section>
  </div>
);
