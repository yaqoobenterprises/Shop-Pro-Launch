import type { Transaction } from "../types/ledger";
export interface ReportTrendBucket {
  key: string;
  label: string;
  title: string;
  income_paisa: number;
  expense_paisa: number;
  net_profit_paisa: number;
  transaction_count: number;
}
export interface ReportCategoryBucket {
  key: string;
  category_id: string | null;
  category_name: string;
  type: Transaction["type"];
  total_paisa: number;
  entry_count: number;
}
const parseIsoDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);
const addDays = (value: Date, days: number): Date => {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};
const dateDifference = (start: string, end: string): number =>
  Math.max(0, Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / 86400000));
export type TrendGrouping = "day" | "week" | "month";
export const getTrendGrouping = (startDate: string, endDate: string): TrendGrouping => {
  const days = dateDifference(startDate, endDate) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
};
const bucketStart = (date: string, grouping: TrendGrouping): string => {
  const parsed = parseIsoDate(date);
  if (grouping === "month") return `${date.slice(0, 7)}-01`;
  if (grouping === "week") {
    const mondayOffset = (parsed.getUTCDay() + 6) % 7;
    return toIsoDate(addDays(parsed, -mondayOffset));
  }
  return date;
};
const labelBucket = (key: string, grouping: TrendGrouping): string => {
  const date = parseIsoDate(key);
  if (grouping === "month") {
    return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
  }
  if (grouping === "week") {
    return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};
export const buildReportTrend = (
  transactions: Transaction[],
  startDate: string,
  endDate: string,
): ReportTrendBucket[] => {
  if (!startDate || !endDate || startDate > endDate) return [];
  const grouping = getTrendGrouping(startDate, endDate);
  const buckets = new Map<string, ReportTrendBucket>();
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (grouping === "month") {
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cursor <= lastMonth) {
      const key = toIsoDate(cursor);
      buckets.set(key, {
        key,
        label: labelBucket(key, grouping),
        title: new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor),
        income_paisa: 0,
        expense_paisa: 0,
        net_profit_paisa: 0,
        transaction_count: 0,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
  } else {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const key = bucketStart(toIsoDate(cursor), grouping);
      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label: labelBucket(key, grouping),
          title: grouping === "day"
            ? new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(cursor)
            : `Week of ${key}`,
          income_paisa: 0,
          expense_paisa: 0,
          net_profit_paisa: 0,
          transaction_count: 0,
        });
      }
    }
  }
  for (const transaction of transactions) {
    if (transaction.business_date < startDate || transaction.business_date > endDate) continue;
    const key = bucketStart(transaction.business_date, grouping);
    let bucket = buckets.get(key);
    if (!bucket) {
      const date = parseIsoDate(key);
      bucket = {
        key,
        label: labelBucket(key, grouping),
        title: grouping === "month"
          ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)
          : grouping === "week" ? `Week of ${key}` : key,
        income_paisa: 0,
        expense_paisa: 0,
        net_profit_paisa: 0,
        transaction_count: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.transaction_count += 1;
    if (transaction.type === "income") {
      bucket.income_paisa += Number(transaction.amount_paisa) || 0;
      bucket.net_profit_paisa += Number(transaction.amount_paisa) || 0;
    } else if (transaction.type === "expense") {
      bucket.expense_paisa += Number(transaction.amount_paisa) || 0;
      bucket.net_profit_paisa -= Number(transaction.amount_paisa) || 0;
    }
  }
  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
};
export const buildReportCategoryBreakdown = (
  transactions: Transaction[],
): ReportCategoryBucket[] => {
  const grouped = new Map<string, ReportCategoryBucket>();
  for (const transaction of transactions) {
    const categoryId = transaction.category_id || null;
    const categoryName = transaction.category_name || (
      transaction.type === "income" ? "General Income" :
      transaction.type === "expense" ? "General Expense" : "Uncategorised"
    );
    const key = `${categoryId || "uncategorised"}:${transaction.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.total_paisa += Number(transaction.amount_paisa) || 0;
      existing.entry_count += 1;
    } else {
      grouped.set(key, {
        key,
        category_id: categoryId,
        category_name: categoryName,
        type: transaction.type,
        total_paisa: Number(transaction.amount_paisa) || 0,
        entry_count: 1,
      });
    }
  }
  return [...grouped.values()].sort((left, right) => right.total_paisa - left.total_paisa);
};
export const calculateReportTotals = (transactions: Transaction[]) => {
  return transactions.reduce((totals, transaction) => {
    const amount = Number(transaction.amount_paisa) || 0;
    totals.transaction_count += 1;
    switch (transaction.type) {
      case "income":
        totals.income_paisa += amount;
        totals.net_profit_paisa += amount;
        break;
      case "expense":
        totals.expense_paisa += amount;
        totals.net_profit_paisa -= amount;
        break;
      case "capital_in":
        totals.capital_in_paisa += amount;
        break;
      case "withdrawal":
        totals.withdrawal_paisa += amount;
        break;
      case "adjustment":
        if (transaction.adjustment_dir === "in") totals.adjustment_in_paisa += amount;
        else if (transaction.adjustment_dir === "out") totals.adjustment_out_paisa += amount;
        break;
    }
    return totals;
  }, {
    income_paisa: 0,
    expense_paisa: 0,
    net_profit_paisa: 0,
    capital_in_paisa: 0,
    withdrawal_paisa: 0,
    adjustment_in_paisa: 0,
    adjustment_out_paisa: 0,
    transaction_count: 0,
  });
};
