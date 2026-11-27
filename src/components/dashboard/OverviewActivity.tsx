import React, { useEffect, useRef, useState } from "react";
import { ledgerService } from "../../services/ledgerService";
import { precedingPeriod } from "../../lib/overviewComparison";
import { assertReportAmounts } from "../../lib/reportAmountValidation";
import { calculateReportTotals } from "../../lib/reportAnalytics";
import { formatRecordedPaisa } from "../../lib/money";
import { formatDisplayDate } from "../../lib/dates";
import type { Transaction } from "../../types/ledger";

type Totals = ReturnType<typeof calculateReportTotals>;
interface Props { start: string; end: string; current: Totals; onExplore?: (start: string,end: string) => void; }
export function OverviewActivity({start,end,current,onExplore}: Props) {
  const [recent,setRecent] = useState<Transaction[] | null>(null);
  const [comparison,setComparison] = useState<Totals | null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const request = useRef(0);
  const [previousStart,previousEnd] = precedingPeriod(start,end);
  useEffect(() => () => {request.current++;},[]);
  const load = async () => {
    const id=++request.current; setLoading(true); setError(""); setComparison(null); setRecent(null);
    const results=await Promise.allSettled([
      ledgerService.getFilteredTransactions({startDate:start,endDate:end,status:"active",sort:"newest",limit:5,offset:0},{requireCloudSource:true}),
      ledgerService.getAllFilteredTransactions({startDate:previousStart,endDate:previousEnd,status:"active"},{requireCloudSource:true}),
    ]);
    if(id!==request.current) return;
    if(results[0].status==="fulfilled") setRecent(results[0].value.transactions);
    if(results[1].status==="fulfilled") {
      try { assertReportAmounts(results[1].value); setComparison(calculateReportTotals(results[1].value)); }
      catch { setError("Previous-period amounts are unavailable."); }
    }
    if(results.some(result=>result.status==="rejected")) setError("Some activity or comparison data is unavailable. Reconnect and retry.");
    setLoading(false);
  };
  const metrics=[["Income","income_paisa"],["Expenses","expense_paisa"],["Operating result","net_profit_paisa"]] as const;
  return <section className="panel overview-revenue" aria-label="Period comparison and recent transactions">
    <div className="panel-heading"><div><h2>Compare periods</h2><p className="overview-chart-range">Previous equal-length period: {formatDisplayDate(previousStart)} – {formatDisplayDate(previousEnd)}</p></div><button type="button" className="button button-secondary" disabled={loading} onClick={()=>void load()}>{loading?"Loading…":"Load comparison & activity"}</button></div>
    <p className="overview-source-note">Comparison uses posted cloud records only the immediately preceding equal number of business dates, not a calendar-month forecast.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {comparison && <div role="region" aria-label="Period comparison values" tabIndex={0} className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th scope="col" className="text-start p-2">Metric</th><th scope="col" className="text-end p-2">Selected</th><th scope="col" className="text-end p-2">Previous</th></tr></thead><tbody>{metrics.map(([label,key])=><tr key={key} className="border-t border-border-standard"><th scope="row" className="p-2 text-start font-medium">{label}</th><td className="p-2 text-end num">{formatRecordedPaisa(current[key])}</td><td className="p-2 text-end num">{formatRecordedPaisa(comparison[key])}</td></tr>)}</tbody></table></div>}
    <div className="panel-heading mt-4"><h2>Latest recorded transactions</h2>{onExplore && <button className="button button-secondary" type="button" onClick={()=>onExplore(start,end)}>View selected period</button>}</div>
    {recent === null ? <p className="overview-source-note">{loading?"Loading posted records…":"Load activity to review the five most recently recorded entries in this period."}</p> : recent.length===0 ? <p className="overview-source-note">No posted transactions in the selected period.</p> : <ul className="overview-revenue-list">{recent.map(row=><li key={row.id}><div className="min-w-0 break-words"><span>{row.raw_text}</span><p className="text-xs text-text-muted">{row.business_date} · {row.type} · {row.account_name || "Account unavailable"}</p></div><strong className="num text-end">{formatRecordedPaisa(row.amount_paisa)}</strong></li>)}</ul>}
  </section>;
}
