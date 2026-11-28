import { getSupabaseClient } from "../lib/supabase";
import { getSecurityPrincipal } from "../lib/security";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals, type ReportCategoryBucket, type ReportTrendBucket } from "../lib/reportAnalytics";
import type { Transaction } from "../types/ledger";
import { ledgerService } from "./ledgerService";
import { isDemoOrganization, requireAuthoritativeCloudRead } from "./ledgerReadPolicy";
interface Filter { startDate: string; endDate: string; type?: Transaction["type"] | "all"; categoryId?: string }
export interface PeriodAnalytics { totals: ReturnType<typeof calculateReportTotals>; trend: ReportTrendBucket[]; categories: ReportCategoryBucket[]; records?: Transaction[] }
/** Opt-in after the reviewed database migration; the preview uses existing services. */
export async function loadPeriodAnalytics(filter: Filter): Promise<PeriodAnalytics> {
  const principal = getSecurityPrincipal();
  const rpcEnabled = import.meta.env.VITE_PERIOD_ANALYTICS_RPC === "true" && !isDemoOrganization(principal?.organizationId);
  if (!rpcEnabled) {
    const rows = await ledgerService.getAllFilteredTransactions({ ...filter, type: filter.type, status: "active" });
    return { records: rows, totals: calculateReportTotals(rows), trend: buildReportTrend(rows, filter.startDate, filter.endDate), categories: buildReportCategoryBreakdown(rows) };
  }
  await requireAuthoritativeCloudRead(principal, "cashbook analytics");
  const { data, error } = await getSupabaseClient().rpc("cashbook_period_analytics", { target_org: principal!.organizationId, start_date: filter.startDate, end_date: filter.endDate, filter_type: filter.type || "all", filter_category: filter.categoryId && filter.categoryId !== "all" ? filter.categoryId : null });
  if (error) throw new Error("Analytics could not be verified. Please retry.", { cause: error });
  const result = data as PeriodAnalytics;
  if (!result?.totals || !Array.isArray(result.trend) || !Array.isArray(result.categories)) throw new Error("Analytics returned an incomplete response.");
  for (const record of [result.totals, ...result.trend, ...result.categories]) for (const [key, value] of Object.entries(record)) {
    if ((key.endsWith("_paisa") || key.endsWith("_count")) && !Number.isSafeInteger(value)) throw new Error("Analytics amounts exceed the supported precision.");
  }
  const observed = new Map(result.trend.map(bucket => [bucket.key, bucket]));
  return { ...result, trend: buildReportTrend([], filter.startDate, filter.endDate).map(bucket => ({ ...bucket, ...observed.get(bucket.key), label: bucket.label, title: bucket.title })) };
}
