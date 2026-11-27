import React, { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, ChartNoAxesCombined, ChartColumn, ChartLine, TrendingUp } from "lucide-react";
import type { ReportTrendBucket } from "../../lib/reportAnalytics";
import { useChartTheme } from "./useChartTheme";
import { EChart } from "./EChart";
import { cashFlowOptions, exactMoney, type ChartMode } from "./echartsOptions";

interface Props { rows: ReportTrendBucket[]; range: string; initialMode?: ChartMode; resultOnly?: boolean }
export const CashFlowChart: React.FC<Props> = ({ rows, range, initialMode = "bars", resultOnly = false }) => {
  const colors = useChartTheme();
  const id = useId();
  const [mode, setMode] = useState<ChartMode>(resultOnly ? "result" : initialMode);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const index = rows.findIndex(r => r.key === selectedKey);
  const selected = rows[index];
  const pick = (i: number) => setSelectedKey(rows[Math.max(0, Math.min(rows.length - 1, i))]?.key ?? null);
  const option = useMemo(() => cashFlowOptions(rows, mode, colors), [rows, mode, colors]);
  const invalid = rows.some(r => [r.income_paisa, r.expense_paisa, r.net_profit_paisa].some(v => !Number.isSafeInteger(v)));
  const activity = rows.some(r => r.income_paisa || r.expense_paisa || r.net_profit_paisa);
  const labels = mode === "result" ? [{ name: "Net result", key: "net_profit_paisa" as const, color: "var(--sp-chart-result)" }] : [{ name: "Income", key: "income_paisa" as const, color: "var(--sp-chart-income)" }, { name: "Expenses", key: "expense_paisa" as const, color: "var(--sp-chart-expense)" }];
  if (invalid) return <p role="status">Chart amounts unavailable.</p>;
  return <div className="clarity-chart">
    {!activity ? <div className="clarity-chart-empty"><ChartNoAxesCombined size={28} aria-hidden="true" /><strong>No income or expenses for this period.</strong><span>Recorded activity will appear here.</span></div> : <>
      <div className="clarity-chart-toolbar"><div className="clarity-chart-legend">{labels.map(l => <span key={l.key}><i style={{ background: l.color }} />{l.name}</span>)}</div>
        {!resultOnly && <div className="clarity-segment" role="group" aria-label="Chart style">{([{ value: "bars", name: "Bars", Icon: ChartColumn }, { value: "lines", name: "Lines", Icon: ChartLine }, { value: "result", name: "Net result", Icon: TrendingUp }] as const).map(({ value, name, Icon }) => <button key={value} type="button" aria-label={name} title={name} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon size={15} /><span>{name}</span></button>)}</div>}
      </div>
      <EChart option={option} label={`Cash flow · ${range}. Use arrow keys to explore exact values.`} descriptionId={`${id}-selection`} onSelect={pick} onKeyDown={e => {
        if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) e.preventDefault();
        if (e.key === "ArrowLeft") pick((index < 0 ? rows.length : index) - 1);
        if (e.key === "ArrowRight") pick(index + 1);
        if (e.key === "Home") pick(0);
        if (e.key === "End") pick(rows.length - 1);
        if (e.key === "Escape") setSelectedKey(null);
      }} />
      <div className="clarity-chart-navigation"><span id={`${id}-selection`} aria-live="polite">{selected ? `${selected.title} · ${labels.map(l => `${l.name} ${exactMoney(selected[l.key])}`).join(" · ")}` : "Select a date"}</span><button type="button" aria-label="Previous chart date" onClick={() => pick((index < 0 ? rows.length : index) - 1)}><ChevronLeft size={15} /></button><button type="button" aria-label="Next chart date" onClick={() => pick(index + 1)}><ChevronRight size={15} /></button><button type="button" aria-label="Clear chart selection" onClick={() => setSelectedKey(null)}><X size={15} /></button></div>
    </>}
    {rows.length > 0 && <details className="clarity-chart-data"><summary>View data</summary><div><table><caption className="sr-only">Exact chart amounts for {range}</caption><thead><tr><th scope="col">Date</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net result</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.title}</th><td title={`Income: ${exactMoney(row.income_paisa)}`}>{exactMoney(row.income_paisa)}</td><td title={`Expenses: ${exactMoney(row.expense_paisa)}`}>{exactMoney(row.expense_paisa)}</td><td title={`Net result: ${exactMoney(row.net_profit_paisa)}`}>{exactMoney(row.net_profit_paisa)}</td></tr>)}</tbody></table></div></details>}
  </div>;
};
