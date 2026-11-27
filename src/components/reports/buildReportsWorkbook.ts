import type { Category, Transaction } from "../../types/ledger";
import { formatKarachiTime, getKarachiBusinessDate } from "../../lib/dates";
import type { ReportTrendBucket, TrendGrouping } from "../../lib/reportAnalytics";
import { calculateReportTotals, buildReportCategoryBreakdown } from "../../lib/reportAnalytics";
import { assertReportAmounts } from "../../lib/reportAmountValidation";
import { buildReportAccountBreakdown } from "../../lib/reportAccountBreakdown";
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
  sourceScope?: string;
  currency?: string;
}

/** Excel numeric cells retain at most 15 significant decimal digits. Reject unsafe exports rather than rounding. */
export const workbookMoney = (paisa: number): number => {
  if (!Number.isSafeInteger(paisa) || Math.abs(paisa) > 999_999_999_999_999) throw new Error("This amount exceeds safe Excel monetary precision. Narrow the report range or use an exact transaction CSV.");
  return paisa / 100;
};

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
  const currency = input.currency || "PKR";
  assertReportAmounts(transactions);
  const totals = calculateReportTotals(transactions);
  const categoryBreakdown = buildReportCategoryBreakdown(transactions);
  const rangeLabel = `${fromDate} – ${toDate}`;
  const categoryLabel = categoryId === "all"
    ? "All categories"
    : categories.find((item) => item.id === categoryId)?.name || "Selected category";
  const metadata = [
    `Type: ${typeLabel(type)}`,
    `Category: ${categoryLabel}`,
    "Active transactions only; internal transfers excluded",
    input.sourceScope || "Available records; completeness not verified",
  ].join(" · ");
  const transactionRows = [...transactions]
    .sort((left, right) => right.business_date.localeCompare(left.business_date) || right.device_entry_time.localeCompare(left.device_entry_time))
    .map((transaction) => ({
      values: [
        transaction.business_date,
        formatKarachiTime(transaction.device_entry_time),
        transaction.type.replace("_", " "),
        transaction.category_name || "Uncategorised",
        transaction.account_name || "Account unavailable",
        workbookMoney(transaction.amount_paisa),
        transaction.raw_text || "",
        transaction.note || "",
        transaction.id,
      ],
    }));
  const summaryRows = [
    { values: ["Income", workbookMoney(totals.income_paisa), null, "Matched active entries"], kind: "data" as const },
    { values: ["Expenses", workbookMoney(totals.expense_paisa), null, "Matched active entries"], kind: "data" as const },
    { values: ["Operating result", workbookMoney(totals.net_profit_paisa), null, "Income less recorded expenses (cashbook basis)"], kind: "total" as const },
    { values: ["Capital introduced", workbookMoney(totals.capital_in_paisa), null, "Non-operating inflow"], kind: "data" as const },
    { values: ["Owner drawings", workbookMoney(totals.withdrawal_paisa), null, "Non-operating outflow"], kind: "data" as const },
    { values: ["Cash adjustments in", workbookMoney(totals.adjustment_in_paisa), null, "Separate from operating result"], kind: "data" as const },
    { values: ["Cash adjustments out", workbookMoney(totals.adjustment_out_paisa), null, "Separate from operating result"], kind: "data" as const },
    { values: ["Active transactions", null, totals.transaction_count, "Count of filtered active entries"], kind: "total" as const },
  ];
  const sheets: WorkbookSheet[] = [
    {
      name: "Executive Summary",
      title: "SHOP PLUS | FINANCIAL REPORT",
      subtitle: `Reporting period: ${rangeLabel}`,
      metadata: `${metadata} · Generated ${getKarachiBusinessDate()}`,
      columns: [{ header: "Metric", width: 29 }, { header: `Amount (${currency})`, width: 20, kind: "money" }, { header: "Entries", width: 13, kind: "number" }, { header: "Context", width: 42 }],
      rows: summaryRows,
      freezeRows: 5,
    },
    {
      name: "Transactions",
      title: "TRANSACTION REGISTER",
      subtitle: `Full filtered register · ${rangeLabel}`,
      metadata: `${metadata} · ${transactions.length} records · Amounts in ${currency}`,
      columns: [
        { header: "Business date", width: 16, kind: "date" },
        { header: "Time", width: 13 },
        { header: "Type", width: 17 },
        { header: "Category", width: 23 },
        { header: "Account", width: 22 },
        { header: `Amount (${currency})`, width: 18, kind: "money" },
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
        { header: `Total (${currency})`, width: 18, kind: "money" },
      ],
      rows: categoryBreakdown.map((item) => ({
        values: [item.category_name, item.type.replace("_", " "), item.entry_count, workbookMoney(item.total_paisa)],
      })),
      autoFilter: true,
      freezeRows: 5,
    },
    {
      name: "Account activity",
      title: "FILTERED ACCOUNT ACTIVITY",
      subtitle: `Recorded income and expenses · ${rangeLabel}`,
      metadata: `${metadata} · Not an account balance or transfer register`,
      columns: [{header:"Account",width:28},{header:"Account ID",width:38},{header:`Income (${currency})`,width:20,kind:"money"},{header:`Expenses (${currency})`,width:20,kind:"money"},{header:`Operating result (${currency})`,width:24,kind:"money"},{header:"Entries",width:12,kind:"number"}],
      rows: buildReportAccountBreakdown(transactions).map(row => ({values:[row.name,row.accountId,workbookMoney(row.income_paisa),workbookMoney(row.expense_paisa),workbookMoney(row.net_profit_paisa),row.transaction_count]})),
      autoFilter:true, freezeRows:5,
    },
    {
      name: "Trend",
      title: "CASH FLOW TREND",
      subtitle: `${grouping === "day" ? "Daily" : grouping === "week" ? "Weekly" : "Monthly"} totals · ${rangeLabel}`,
      metadata: `${metadata} · Operating result is cashbook income less recorded expenses; not accrual profit.`,
      columns: [
        { header: "Period", width: 22 },
        { header: `Income (${currency})`, width: 18, kind: "money" },
        { header: `Expenses (${currency})`, width: 18, kind: "money" },
        { header: `Operating result (${currency})`, width: 18, kind: "money" },
        { header: "Transactions", width: 16, kind: "number" },
      ],
      rows: trend.map((bucket) => ({
        values: [bucket.title, workbookMoney(bucket.income_paisa), workbookMoney(bucket.expense_paisa), workbookMoney(bucket.net_profit_paisa), bucket.transaction_count],
      })),
      autoFilter: true,
      freezeRows: 5,
    },
  ];
  return { sheets, fileName: `Shop-Plus-Report-${fromDate}-to-${toDate}` };
};
