import type { Transaction } from "../types/ledger";
import { calculateReportTotals } from "./reportAnalytics";

/** Group the already-filtered register by stable account ID, never by display name. */
export function buildReportAccountBreakdown(transactions: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.account_id || "";
    const rows = groups.get(key) || [];
    rows.push(tx);
    groups.set(key, rows);
  }
  return [...groups].map(([accountId, rows]) => ({
    accountId,
    name: rows.find(row => row.account_name)?.account_name || "Account unavailable",
    ...calculateReportTotals(rows),
  })).sort((a,b) => a.name.localeCompare(b.name) || a.accountId.localeCompare(b.accountId));
}
