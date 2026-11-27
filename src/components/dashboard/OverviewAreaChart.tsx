import React, { useMemo, useState } from "react";
import { formatRecordedPaisa as formatPaisa } from "../../lib/money";
import type { ReportTrendBucket } from "../../lib/reportAnalytics";

interface Props {
  rows: ReportTrendBucket[];
  range: string;
}

const W = 760;
const H = 286;
const LEFT = 70;
const TOP = 14;
const PLOT_W = W - LEFT - 16;
const PLOT_H = H - TOP - 36;

const linePath = (points: Array<[number, number]>): string => points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

export const OverviewAreaChart: React.FC<Props> = ({ rows, range }) => {
  const [active, setActive] = useState<number | null>(null);
  const model = useMemo(() => {
    const upper = Math.max(1, ...rows.map((r) => Math.max(0, r.income_paisa, r.expense_paisa)));
    const max = upper * 1.08;
    const positions = rows.map((row, i) => {
      const x = LEFT + (i / Math.max(rows.length - 1, 1)) * PLOT_W;
      const yIncome = TOP + PLOT_H * (1 - row.income_paisa / max);
      const yExpense = TOP + PLOT_H * (1 - row.expense_paisa / max);
      return { x, yIncome, yExpense };
    });
    const income = linePath(positions.map((p) => [p.x, p.yIncome]));
    const expense = linePath(positions.map((p) => [p.x, p.yExpense]));
    return {
      max,
      positions,
      income,
      expense,
    };
  }, [rows]);

  if (!rows.length) return <p className="aq-chart__empty">No entries recorded for this range.</p>;
  const selected = active === null ? null : rows[active];

  return (
    <div className="aq-chart">
      <div className="aq-chart__legend" aria-hidden="true">
        <span><i className="aq-chart__key aq-chart__key--income" />Income</span>
        <span><i className="aq-chart__key aq-chart__key--expense" />Expenses</span>
      </div>
      <svg className="aq-chart__canvas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Income and expenses trend for ${range}`} preserveAspectRatio="xMidYMid meet">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = Math.round(model.max * (4 - tick) / 4);
          const y = TOP + tick * PLOT_H / 4;
          return (
            <g key={tick}>
              <line x1={LEFT} x2={W - 12} y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray="4 5" />
              <text x={LEFT - 10} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{formatPaisa(value)}</text>
            </g>
          );
        })}
        <path d={model.income} stroke="var(--chart-lavender)" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        <path d={model.expense} stroke="var(--chart-teal)" strokeDasharray="6 4" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        {model.positions.map((point, i) => (
          <g key={rows[i].key}>
            <circle cx={point.x} cy={point.yIncome} r={active === i ? 5 : 2} fill="var(--chart-lavender)" tabIndex={0}
              aria-label={`${rows[i].title} income: ${formatPaisa(rows[i].income_paisa)}`}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}><title>{`Income: ${formatPaisa(rows[i].income_paisa)}`}</title></circle>
            <circle cx={point.x} cy={point.yExpense} r={active === i ? 5 : 2} fill="var(--chart-teal)" tabIndex={0}
              aria-label={`${rows[i].title} expenses: ${formatPaisa(rows[i].expense_paisa)}`}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}><title>{`Expenses: ${formatPaisa(rows[i].expense_paisa)}`}</title></circle>
          </g>
        ))}
        {model.positions.map((point, i) => i % Math.max(1, Math.ceil(rows.length / 6)) === 0 || i === rows.length - 1 ? (
          <text key={rows[i].key} x={point.x} y={H - 6} textAnchor="middle" fill="var(--muted)" fontSize="11">{rows[i].label}</text>
        ) : null)}
      </svg>
      <div className="aq-chart__tooltip" aria-live="polite">
        {selected ? <span><strong>{selected.title}</strong> · Income {formatPaisa(selected.income_paisa)} · Expenses {formatPaisa(selected.expense_paisa)}</span>
          : <span>Focus or hover over a point to inspect amounts.</span>}
      </div>
      <div className="sr-only" aria-hidden="true">
        {rows.map((row) => (
          <React.Fragment key={row.key}>
            <span title={`Income: ${formatPaisa(row.income_paisa)}`} />
            <span title={`Expenses: ${formatPaisa(row.expense_paisa)}`} />
          </React.Fragment>
        ))}
      </div>
      <table className="sr-only" aria-label="Income and expenses by period">
        <caption>Recorded cashbook activity for {range}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Income</th><th scope="col">Expenses</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.title}</th><td>{formatPaisa(row.income_paisa)}</td><td>{formatPaisa(row.expense_paisa)}</td></tr>)}</tbody>
      </table>
    </div>
  );
};
