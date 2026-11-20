import type { ChartAccount, PostedJournal } from "../../accounting/types";

/** Exact minor units throughout. Chart coordinates are visual-only. */
export interface SampleCashDay {
  date: string;
  receivedMinor: string;
  paidMinor: string;
}

export interface SampleClassCount {
  name: string;
  count: number;
}

const CLASS_LABELS: Record<ChartAccount["accountClass"], string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity",
  revenue: "Revenue", cost_of_sales: "Cost of sales",
  expense: "Expenses", other_income: "Other income",
  other_expense: "Other expenses",
};

/** Only use this with explicitly illustrative preview inputs, never as a certified ledger query. */
export function buildSampleCashActivity(
  accounts: readonly ChartAccount[],
  journals: readonly PostedJournal[],
): SampleCashDay[] {
  const cashIds = new Set(accounts.filter((a) =>
    a.isActive && a.controlRole === "cash").map((a) => a.id));
  const byDay = new Map<string, { received: bigint; paid: bigint }>();
  for (const journal of journals) {
    const day = byDay.get(journal.businessDate) ?? { received: 0n, paid: 0n };
    for (const line of journal.lines) {
      if (!cashIds.has(line.accountId)) continue;
      day.received += BigInt(line.debitMinor);
      day.paid += BigInt(line.creditMinor);
    }
    byDay.set(journal.businessDate, day);
  }
  return Array.from(byDay, ([date, day]) => ({
    date, receivedMinor: day.received.toString(), paidMinor: day.paid.toString(),
  })).sort((a, b) => a.date.localeCompare(b.date));
}

export function countSampleAccountClasses(accounts: readonly ChartAccount[]): SampleClassCount[] {
  const counts = new Map<ChartAccount["accountClass"], number>();
  for (const a of accounts) counts.set(a.accountClass, (counts.get(a.accountClass) ?? 0) + 1);
  return Array.from(counts, ([key, count]) => ({
    name: CLASS_LABELS[key], count,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sumSampleMinor(values: readonly string[]): string {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}
