import { useEffect, useState } from "react";
import { loadPeriodAnalytics } from "../../services/periodAnalyticsService";
import { calculateReportTotals } from "../../lib/reportAnalytics";
import { getWeekRangeForDate } from "../../lib/reportDateRanges";
import { getKarachiBusinessDate } from "../../lib/dates";
import type { OverviewPeriod } from "./OverviewPeriodControls";
export function overviewRange(period: OverviewPeriod, date: string, start: string, end: string): [string, string] {
  if (period === "day") return [date, date];
  if (period === "week") return getWeekRangeForDate(date);
  if (period === "custom") return [start, end];
  const [year, month] = date.split("-").map(Number);
  const first = `${date.slice(0, 7)}-01`, last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10), today = getKarachiBusinessDate();
  return [first, last > today && first <= today ? today : last];
}
export function previousRange(start: string, end: string): [string, string] {
  const first = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
  const length = last - first + 86400000;
  return [new Date(first - length).toISOString().slice(0, 10), new Date(first - 86400000).toISOString().slice(0, 10)];
}
export function useOverviewComparison(enabled: boolean, start: string, end: string) {
  const [state, setState] = useState<{ key: string; totals?: ReturnType<typeof calculateReportTotals>; error?: string }>({ key: "" });
  const key = `${start}:${end}`;
  useEffect(() => {
    if (!enabled || !start || !end || start > end) return;
    let active = true;
    const [from, to] = previousRange(start, end);
    void loadPeriodAnalytics({ startDate: from, endDate: to }).then(result => {
      if (active) setState({ key, totals: result.totals });
    }).catch(() => { if (active) setState({ key, error: "Comparison unavailable. Try switching comparison off and on." }); });
    return () => { active = false; };
  }, [enabled, start, end, key]);
  return enabled && state.key === key ? state : { key };
}
