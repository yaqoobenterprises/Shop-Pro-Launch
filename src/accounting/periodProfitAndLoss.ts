import { buildFinancialSnapshot } from "./financialSnapshot";
import { validBusinessDate } from "./minorUnits";
import type { AccountingSnapshotInput, FinancialSnapshot } from "./types";

export interface PeriodProfitAndLoss {
  organizationId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  revenueMinor: string;
  costOfSalesMinor: string;
  grossProfitMinor: string;
  expensesMinor: string;
  otherIncomeMinor: string;
  otherExpensesMinor: string;
  netEarningsMinor: string;
}

/**
 * A complete, previously authorized financial snapshot is required.
 * Returns an EXACT date-range P&L (inclusive), not cumulative lifetime profit.
 *
 * Client-side mathematics cannot certify data completeness, bank reconciliation,
 * country tax treatment, revenue recognition policy, or IFRS 18 presentation.
 * Only a server-issued complete, tenant-scoped snapshot may be trusted here.
 */
export function buildPeriodProfitAndLoss(
  input: AccountingSnapshotInput,
  periodStart: string,
  periodEnd: string,
): PeriodProfitAndLoss {
  if (!validBusinessDate(input.asOfDate) || !validBusinessDate(periodStart)
      || !validBusinessDate(periodEnd)
      || periodStart > periodEnd || periodEnd > input.asOfDate) {
    throw new Error("Choose a valid period within the certified as-of cutoff.");
  }
  if (!input.sourceComplete) {
    throw new Error("Incomplete financial source: period profit is unavailable.");
  }

  // Derive the opening cumulative state immediately BEFORE periodStart so
  // prior-year/prior-month earnings cannot leak into this period's profit.
  const before = new Date(periodStart + "T00:00:00.000Z");
  before.setUTCDate(before.getUTCDate() - 1);
  const openingCutoff = before.toISOString().slice(0, 10);

  // Both calls validate every immutable journal and its unique intent/lines,
  // while including only business dates <= their respective as-of cutoff.
  const closing = buildFinancialSnapshot({ ...input, asOfDate: periodEnd });
  const opening: FinancialSnapshot = buildFinancialSnapshot({
    ...input, asOfDate: openingCutoff,
  });
  const movement = (field: keyof FinancialSnapshot["incomeStatement"]): bigint =>
    BigInt(closing.incomeStatement[field]) - BigInt(opening.incomeStatement[field]);

  const revenue = movement("revenueMinor");
  const cost = movement("costOfSalesMinor");
  const expenses = movement("expensesMinor");
  const otherIncome = movement("otherIncomeMinor");
  const otherExpenses = movement("otherExpensesMinor");
  const grossProfit = revenue - cost;
  const netProfit = grossProfit - expenses + otherIncome - otherExpenses;

  if (netProfit !== movement("netEarningsMinor")) {
    throw new Error("Period income statement failed exact earnings reconciliation.");
  }
  return {
    organizationId: input.organizationId,
    currency: input.currency,
    periodStart, periodEnd,
    revenueMinor: revenue.toString(),
    costOfSalesMinor: cost.toString(),
    grossProfitMinor: grossProfit.toString(),
    expensesMinor: expenses.toString(),
    otherIncomeMinor: otherIncome.toString(),
    otherExpensesMinor: otherExpenses.toString(),
    netEarningsMinor: netProfit.toString(),
  };
}
