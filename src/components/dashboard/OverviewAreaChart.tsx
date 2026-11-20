import React, { useId, useMemo, useState } from "react";
import { formatPaisa } from "../../lib/money";
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

const smoothPath = (points: Array<[number, number]>): string => {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  const pieces = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const dx = (point[0] - prev[0]) / 2;
    pieces.push(`C ${prev[0] + dx} ${prev[1]}, ${point[0] - dx} ${point[1]}, ${point[0]} ${point[1]}`);
  }
  return pieces.join(" ");
};

export const OverviewAreaChart: React.FC<Props> = ({ rows, range }) => {
  const id = useId().replace(/:/g, "");
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
    const income = smoothPath(positions.map((p) => [p.x, p.yIncome]));
    const expense = smoothPath(positions.map((p) => [p.x, p.yExpense]));
    const base = TOP + PLOT_H;
    return {
      max,
      positions,
      income,
      expense,
      incomeArea: income ? `${income} L ${positions[positions.length - 1].x} ${base} L ${positions[0].x} ${base} Z` : "",
      expenseArea: expense ? `${expense} L ${positions[positions.length - 1].x} ${base} L ${positions[0].x} ${base} Z` : "",
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
        <defs>
          <linearGradient id={`income-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-lavender)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--chart-lavender)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`expense-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-teal)" stopOpacity=".20" />
            <stop offset="100%" stopColor="var(--chart-teal)" stopOpacity="0" />
          </linearGradient>
        </defs>
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
        {model.incomeArea && <path d={model.incomeArea} fill={`url(#income-${id})`} />}
        {model.expenseArea && <path d={model.expenseArea} fill={`url(#expense-${id})`} />}
        <path d={model.income} stroke="var(--chart-lavender)" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        <path d={model.expense} stroke="var(--chart-teal)" fill="none" strokeWidth="2.6" strokeLinecap="round" />
        {model.positions.map((point, i) => (
          <g key={rows[i].key}>
            <circle cx={point.x} cy={point.yIncome} r={active === i ? 5 : 2} fill="var(--chart-lavender)" title={`Income: ${formatPaisa(rows[i].income_paisa)}`} tabIndex={0}
              aria-label={`${rows[i].title} income: ${formatPaisa(rows[i].income_paisa)}`}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
            <circle cx={point.x} cy={point.yExpense} r={active === i ? 5 : 2} fill="var(--chart-teal)" title={`Expenses: ${formatPaisa(rows[i].expense_paisa)}`} tabIndex={0}
              aria-label={`${rows[i].title} expenses: ${formatPaisa(rows[i].expense_paisa)}`}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
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
      <table className="sr-only" aria-label="Income and expenses by period">
        <caption>Recorded cashbook activity for {range}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Income</th><th scope="col">Expenses</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th scope="row">{row.title}</th><td>{formatPaisa(row.income_paisa)}</td><td>{formatPaisa(row.expense_paisa)}</td></tr>)}</tbody>
      </table>
    </div>
  );
};
