import React, { useMemo, useState } from "react";
import { ArrowUpRight, BookOpenText, CalendarRange, Layers3, ReceiptText } from "lucide-react";
import type { ChartAccount, PostedJournal } from "../../accounting/types";
import type { AqvoraFiscalPeriod } from "../../services/aqvoraAdminReadService";
import { formatMinorForPreview } from "./financeInput";
import { buildSampleCashActivity, countSampleAccountClasses, sumSampleMinor } from "./financeOverviewModel";

export type FinanceOverviewDestination = "chart" | "periods" | "journal" | "ledger" | "trial";
interface Props {
  accounts: ChartAccount[];
  periods: AqvoraFiscalPeriod[];
  journals: PostedJournal[];
  onNavigate: (page: FinanceOverviewDestination) => void;
}

const COLORS = ["#9189df", "#55cdbb", "#f58fcc", "#4c4b52", "#a8b9d1", "#f0bd73"];
type Point = { x: number; y: number };

const pathThrough = (points: Point[]) => {
  if (!points.length) return "";
  return points.slice(1).reduce((path, point, index) => {
    const last = points[index];
    const center = (last.x + point.x) / 2;
    return path + ` C ${center},${last.y} ${center},${point.y} ${point.x},${point.y}`;
  }, `M ${points[0].x},${points[0].y}`);
};

const chartPoints = (values: string[], ceiling: bigint): Point[] => values.map((value, i) => ({
  x: values.length === 1 ? 370 : 52 + (636 * i) / (values.length - 1),
  y: 202 - Number((BigInt(value) * 152n) / (ceiling === 0n ? 1n : ceiling)),
}));

const cashSeries = (points: Point[], shade: boolean) => {
  if (!points.length) return "";
  const line = pathThrough(points);
  return shade ? `${line} L ${points[points.length - 1].x},202 L ${points[0].x},202 Z` : line;
};

export const FinanceOverviewPanel: React.FC<Props> = ({ accounts, periods, journals, onNavigate }) => {
  const [range, setRange] = useState<"all" | "recent">("all");
  const allDays = useMemo(() => buildSampleCashActivity(accounts, journals), [accounts, journals]);
  const classes = useMemo(() => countSampleAccountClasses(accounts), [accounts]);
  const shownDays = range === "recent" ? allDays.slice(-2) : allDays;
  const cashReceived = sumSampleMinor(shownDays.map((day) => day.receivedMinor));
  const cashPaid = sumSampleMinor(shownDays.map((day) => day.paidMinor));
  const highest = shownDays.reduce((maximum, day) => {
    const received = BigInt(day.receivedMinor);
    const paid = BigInt(day.paidMinor);
    return [maximum, received, paid].reduce((a, b) => a > b ? a : b);
  }, 0n);
  const plotMax = highest || 1n;
  const incoming = chartPoints(shownDays.map((day) => day.receivedMinor), plotMax);
  const outgoing = chartPoints(shownDays.map((day) => day.paidMinor), plotMax);
  const activeAccounts = accounts.filter((a) => a.isActive && a.isPosting).length;
  const controlAccounts = accounts.filter((a) => Boolean(a.controlRole)).length;
  const openPeriods = periods.filter((p) => p.state === "open").length;
  const total = classes.reduce((n, row) => n + row.count, 0);
  let accumulated = 0;

  const kpis = [
    { label: "Chart accounts", value: accounts.length, icon: Layers3, tone: "charcoal", foot: "Illustrative company chart" },
    { label: "Posting accounts", value: activeAccounts, icon: BookOpenText, tone: "mint", foot: "Active in this sample" },
    { label: "Control accounts", value: controlAccounts, icon: ReceiptText, tone: "blush", foot: "Restricted account types" },
    { label: "Open periods", value: openPeriods, icon: CalendarRange, tone: "white", foot: "Illustrative fiscal calendar" },
  ] as const;

  return <section className="aq-overview" aria-labelledby="aq-overview-heading">
    <div className="aq-overview__heading">
      <div>
        <span className="aq-finance__eyebrow">SAMPLE COMPANY / FINANCIAL STRUCTURE</span>
        <h2 id="aq-overview-heading">Accounting overview</h2>
        <p>A focused workspace for understanding the books before posting.</p>
      </div>
      <button type="button" className="aq-overview__outline" onClick={() => onNavigate("chart")}>
        Explore accounts <ArrowUpRight size={16} aria-hidden="true"/>
      </button>
    </div>
    <div className="aq-overview__kpis" aria-label="Illustrative accounting summary">
      {kpis.map(({ label, value, icon: Icon, tone, foot }) =>
        <div key={label} className={`aq-overview__kpi aq-overview__kpi--${tone}`}>
          <div className="aq-overview__kpi-top"><span>{label}</span><Icon size={20} strokeWidth={1.7} aria-hidden="true"/></div>
          <strong>{value}</strong><small>{foot}</small>
        </div>
      )}
    </div>
    <div className="aq-overview__charts">
      <section className="aq-overview__panel aq-overview__panel--trend" aria-labelledby="aq-cash-heading">
        <div className="aq-overview__panel-title">
          <div><h3 id="aq-cash-heading">Cash movement</h3>
            <p>From illustrative cash-control journal lines, not revenue or profit</p>
          </div>
          <label className="aq-overview__range">
            <span className="sr-only">Cash movement date range</span>
            <select value={range} onChange={(e) => setRange(e.target.value as "all" | "recent")}>
              <option value="all">All sample dates</option>
              <option value="recent">Last two sample dates</option>
            </select>
          </label>
        </div>
        <div className="aq-overview__legend">
          <span><i className="aq-overview__dot aq-overview__dot--lavender"/> Cash received</span>
          <span><i className="aq-overview__dot aq-overview__dot--teal"/> Cash paid</span>
        </div>
        {shownDays.length ? <div className="aq-overview__plot">
          <svg viewBox="0 0 740 238" role="img" aria-label="Illustrative daily cash received and cash paid line chart">
            <title>Sample cash movements by journal date</title>
            {[50, 88, 126, 164, 202].map((y) =>
              <line key={y} x1="52" x2="688" y1={y} y2={y} stroke="currentColor" strokeOpacity=".09" strokeDasharray="4 7"/>)}
            <path d={cashSeries(incoming, true)} fill="#9189df" fillOpacity=".10"/>
            <path d={cashSeries(outgoing, true)} fill="#55cdbb" fillOpacity=".10"/>
            <path d={cashSeries(incoming, false)} stroke="#9189df" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
            <path d={cashSeries(outgoing, false)} stroke="#55cdbb" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
            {incoming.map((p, i) => <circle key={shownDays[i].date} cx={p.x} cy={p.y} r="4" fill="#9189df" stroke="#fff" strokeWidth="2"/>)}
            {outgoing.map((p, i) => <circle key={shownDays[i].date} cx={p.x} cy={p.y} r="4" fill="#55cdbb" stroke="#fff" strokeWidth="2"/>)}
            {shownDays.map((day, i) => <text key={day.date} x={incoming[i].x} y="227" textAnchor="middle"
              fontSize="12" fill="currentColor" opacity=".65">{day.date.slice(5)}</text>)}
          </svg>
        </div> : <p className="aq-overview__no-chart">No illustrative cash movements.</p>}
        <div className="aq-overview__cash-totals" aria-live="polite">
          <span><small>Cash received</small><strong>{formatMinorForPreview(cashReceived)}</strong></span>
          <span><small>Cash paid</small><strong>{formatMinorForPreview(cashPaid)}</strong></span>
        </div>
      </section>
      <section className="aq-overview__panel aq-overview__panel--mix" aria-labelledby="aq-class-heading">
        <div className="aq-overview__panel-title"><div>
          <h3 id="aq-class-heading">Account structure</h3><p>Count by class · sample chart</p>
        </div></div>
        <div className="aq-overview__donut-wrap">
          <svg viewBox="0 0 220 220" role="img" aria-label="Illustrative account classes breakdown">
            <title>Sample chart of accounts classes</title>
            <circle cx="110" cy="110" r="72" stroke="currentColor" strokeOpacity=".08" strokeWidth="21" fill="none"/>
            {classes.map((entry, i) => {
              const segment = total === 0 ? 0 : entry.count * 2 * Math.PI * 72 / total;
              const offset = accumulated;
              accumulated += segment;
              return <circle key={entry.name} cx="110" cy="110" r="72" fill="none"
                stroke={COLORS[i % COLORS.length]} strokeWidth="21"
                strokeDasharray={`${segment} ${2 * Math.PI * 72 - segment}`}
                strokeDashoffset={-offset} transform="rotate(-90 110 110)"/>;
            })}
            <text x="110" y="108" textAnchor="middle" fill="currentColor" fontWeight="720" fontSize="36">{total}</text>
            <text x="110" y="130" textAnchor="middle" fill="currentColor" opacity=".55" fontSize="11">accounts</text>
          </svg>
        </div>
        <div className="aq-overview__class-legend">
          {classes.map((entry, i) => <div key={entry.name}>
            <span><i style={{ backgroundColor: COLORS[i % COLORS.length] }}/>{entry.name}</span>
            <strong>{entry.count}</strong>
          </div>)}
        </div>
      </section>
    </div>
    <div className="aq-overview__bottom">
      <section className="aq-overview__panel" aria-labelledby="aq-activity-heading">
        <div className="aq-overview__panel-title">
          <div><h3 id="aq-activity-heading">Illustrative journal activity</h3>
            <p>Example entries only · no cloud ledger records</p></div>
          <button type="button" className="aq-overview__text-action" onClick={() => onNavigate("ledger")}>
            Open ledger <ArrowUpRight size={15} aria-hidden="true"/></button>
        </div>
        <div className="aq-overview__activity">
          {journals.slice(-3).reverse().map((journal) => {
            const debits = sumSampleMinor(journal.lines.map((line) => line.debitMinor));
            return <div className="aq-overview__activity-row" key={journal.id}>
              <span className="aq-overview__activity-icon"><ReceiptText size={17} aria-hidden="true"/></span>
              <div><strong>{journal.id}</strong><small>{journal.businessDate} · {journal.lines.length} lines</small></div>
              <span className="aq-overview__activity-amount">{formatMinorForPreview(debits)}</span>
            </div>;
          })}
          {!journals.length && <p>No illustrative journals are available.</p>}
        </div>
      </section>
      <section className="aq-overview__panel aq-overview__next" aria-labelledby="aq-next-heading">
        <div><span className="aq-finance__eyebrow">REVIEW WORKFLOW</span>
          <h3 id="aq-next-heading">Know your accounting periods</h3>
          <p>Inspect closed and open periods before preparing a journal. No period mutations or posting are available.</p>
        </div>
        <button type="button" className="aq-overview__next-button" onClick={() => onNavigate("periods")}>
          View fiscal periods <ArrowUpRight size={16} aria-hidden="true"/>
        </button>
      </section>
    </div>
    <p className="aq-overview__disclosure">Illustrative data only · not financial advice, a live company balance, or a posted ERP report.</p>
  </section>;
};
