import type { Category, Transaction } from "../../types/ledger";
import { formatKarachiTime, getKarachiBusinessDate } from "../../lib/dates";
import type { ReportTrendBucket, TrendGrouping } from "../../lib/reportAnalytics";
import { calculateReportTotals, buildReportCategoryBreakdown } from "../../lib/reportAnalytics";
import type { WorkbookSheet } from "../../lib/premiumXlsx";

export interface ReportsWorkbookInput {
  transactions: Transaction[];
  categories: Category[];
  fromDate: string;
  toDate: string;
  type: string;
  categoryId: string;
  trend: ReportTrendBucket[];
  grouping: TrendGrouping;
}

const rupees = (paisa: number) => paisa / 100;

const typeLabel = (type: string): string => ({
  all: "All transaction types",
  income: "Income",
  expense: "Expenses",
  capital_in: "Capital introduced",
  withdrawal: "Owner drawings",
  adjustment: "Cash adjustments",
}[type] || "All transaction types");

export const buildReportsWorkbook = (input: ReportsWorkbookInput): { sheets: WorkbookSheet[]; fileName: string } => {
  const { transactions, categories, fromDate, toDate, type, categoryId, trend, grouping } = input;
  const totals = calculateReportTotals(transactions);
  const categoryBreakdown = buildReportCategoryBreakdown(transactions);
  const rangeLabel = `${fromDate} – ${toDate}`;
  const categoryLabel = categoryId === "all"
    ? "All categories"
    : categories.find((item) => item.id === categoryId)?.name || "Selected category";
  const metadata = [
    `Type: ${typeLabel(type)}`,
    `Category: ${categoryLabel}`,
    "Active transactions only",
  ].join(" · ");
  const transactionRows = [...transactions]
    .sort((left, right) => right.business_date.localeCompare(left.business_date) || right.device_entry_time.localeCompare(left.device_entry_time))
    .map((transaction) => ({
      values: [
        transaction.business_date,
        formatKarachiTime(transaction.device_entry_time),
        transaction.type.replace("_", " "),
        transaction.category_name || "Uncategorised",
        transaction.account_name || "Cash In Hand",
        rupees(transaction.amount_paisa),
        transaction.raw_text || "",
        transaction.note || "",
        transaction.id,
      ],
    }));
  const summaryRows = [
    { values: ["Income", rupees(totals.income_paisa), "Matched active entries"], kind: "data" as const },
    { values: ["Expenses", rupees(totals.expense_paisa), "Matched active entries"], kind: "data" as const },
    { values: ["Net profit", rupees(totals.net_profit_paisa), "Income less operating expenses"], kind: "total" as const },
    { values: ["Capital introduced", rupees(totals.capital_in_paisa), "Non-operating inflow"], kind: "data" as const },
    { values: ["Owner drawings", rupees(totals.withdrawal_paisa), "Non-operating outflow"], kind: "data" as const },
    { values: ["Cash adjustments in", rupees(totals.adjustment_in_paisa), "Separate from operating profit"], kind: "data" as const },
    { values: ["Cash adjustments out", rupees(totals.adjustment_out_paisa), "Separate from operating profit"], kind: "data" as const },
    { values: ["Transactions", totals.transaction_count, "Count of filtered active entries"], kind: "total" as const },
  ];
  const sheets: WorkbookSheet[] = [
    {
      name: "Executive Summary",
      title: "SHOP PRO | FINANCIAL REPORT",
      subtitle: `Reporting period: ${rangeLabel}`,
      metadata: `${metadata} · Generated ${getKarachiBusinessDate()}`,
      columns: [{ header: "Metric", width: 29 }, { header: "Value", width: 20, kind: "money" }, { header: "Context", width: 42 }],
      rows: summaryRows,
      freezeRows: 5,
    },
    {
      name: "Transactions",
      title: "TRANSACTION REGISTER",
      subtitle: `Full filtered register · ${rangeLabel}`,
      metadata: `${metadata} · ${transactions.length} records · Amounts in Pakistani Rupees`,
      columns: [
        { header: "Business date", width: 16, kind: "date" },
        { header: "Time", width: 13 },
        { header: "Type", width: 17 },
        { header: "Category", width: 23 },
        { header: "Account", width: 22 },
        { header: "Amount (Rs)", width: 18, kind: "money" },
        { header: "Description", width: 42 },
        { header: "Notes", width: 30 },
        { header: "Transaction ID", width: 38 },
      ],
      rows: transactionRows,
      autoFilter: true,
      freezeRows: 5,
    },
    {
      name: "Category Breakdown",
      title: "CATEGORY PERFORMANCE",
      subtitle: `Category-level totals · ${rangeLabel}`,
      metadata,
      columns: [
        { header: "Category", width: 28 },
        { header: "Transaction type", width: 20 },
        { header: "Entries", width: 13, kind: "number" },
        { header: "Total (Rs)", width: 18, kind: "money" },
      ],
      rows: categoryBreakdown.map((item) => ({
        values: [item.category_name, item.type.replace("_", " "), item.entry_count, rupees(item.total_paisa)],
      })),
      autoFilter: true,
      freezeRows: 5,
    },
    {
      name: "Trend",
      title: "CASH FLOW TREND",
      subtitle: `${grouping === "day" ? "Daily" : grouping === "week" ? "Weekly" : "Monthly"} totals · ${rangeLabel}`,
      metadata: "Net profit is income minus operating expenses; capital and drawings are shown separately.",
      columns: [
        { header: "Period", width: 22 },
        { header: "Income (Rs)", width: 18, kind: "money" },
        { header: "Expenses (Rs)", width: 18, kind: "money" },
        { header: "Net profit (Rs)", width: 18, kind: "money" },
        { header: "Transactions", width: 16, kind: "number" },
      ],
      rows: trend.map((bucket) => ({
        values: [bucket.title, rupees(bucket.income_paisa), rupees(bucket.expense_paisa), rupees(bucket.net_profit_paisa), bucket.transaction_count],
      })),
      autoFilter: true,
      freezeRows: 5,
    },
  ];
  return { sheets, fileName: `Shop-Pro-Report-${fromDate}-to-${toDate}` };
};
