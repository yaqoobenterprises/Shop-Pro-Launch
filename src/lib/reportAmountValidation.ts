import type { Transaction } from "../types/ledger";

/** Bound report aggregation to exact integer minor units, including every category/type. */
export function assertReportAmounts(transactions: readonly Transaction[]): void {
  let magnitude = 0;
  for (const row of transactions) {
    if (!Number.isSafeInteger(row.amount_paisa) || row.amount_paisa < 0) throw new Error("Report contains an invalid monetary amount. No total or export is available.");
    magnitude += row.amount_paisa;
    if (!Number.isSafeInteger(magnitude)) throw new Error("Report exceeds safe monetary precision. Narrow the date range.");
  }
}

