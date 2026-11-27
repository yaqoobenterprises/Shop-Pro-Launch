import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, ChartNoAxesCombined } from "lucide-react";
import type { ReportTrendBucket } from "../../lib/reportAnalytics";
import { formatPaisa } from "../../lib/money";
import { niceScale, monotonePath } from "../../design-system/chartGeometry";
const exactMoney = (value: number) => formatPaisa(value, { showPaisaIfFraction: true });

type Mode = "bars" | "lines" | "result";
interface Props { rows: ReportTrendBucket[]; range: string; initialMode?: Mode; resultOnly?: boolean }
const axisAmount = (value: number) => value !== 0 && Math.abs(value) < 100 ? (value / 100).toFixed(2) : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100);

/** Shared live-data chart. Exact values are always available without hover. */
export const CashFlowChart: React.FC<Props> = ({ rows, range, initialMode = "bars", resultOnly = false }) => {
  const ref = useRef<HTMLDivElement>(null), id = useId();
  const [width, setWidth] = useState(680), [active, setActive] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(resultOnly ? "result" : initialMode);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(host); return () => observer.disconnect();
  }, []);
  useEffect(() => { setActive(null); setPinned(false); }, [rows]);
  const model = useMemo(() => {
    const keys = mode === "result" ? ["net_profit_paisa"] as const : ["income_paisa", "expense_paisa"] as const;
    const scale = niceScale(rows.flatMap(r => keys.map(k => r[k])));
    const left = 48, right = width - 18, top = 20, bottom = 236;
    const slot = (right - left) / Math.max(1, rows.length);
    const x = (i: number) => left + slot * (i + .5);
    const y = (v: number) => bottom - (v - scale.lo) / (scale.hi - scale.lo) * (bottom - top);
    return { keys, scale, left, right, top, bottom, slot, x, y };
  }, [rows, width, mode]);
  const selectedIndex = active === null ? null : Math.min(active, rows.length - 1);
  const selected = selectedIndex === null ? null : rows[selectedIndex];
  const hasActivity = rows.some(r => r.income_paisa !== 0 || r.expense_paisa !== 0 || r.net_profit_paisa !== 0);
  const pick = (i: number) => { setActive(Math.max(0, Math.min(rows.length - 1, i))); setPinned(true); };
  const color = (key: string) => key === "income_paisa" ? "var(--sp-chart-income)" : key === "expense_paisa" ? "var(--sp-chart-expense)" : "var(--sp-primary)";
  const label = (key: string) => key === "income_paisa" ? "Income" : key === "expense_paisa" ? "Expenses" : "Net result";
  return <div className="clarity-chart" ref={ref}>
    {!hasActivity ? <div className="clarity-chart-empty"><ChartNoAxesCombined size={28} aria-hidden="true" /><span>No income or expenses for this period.</span></div> : <>
      <div className="clarity-chart-toolbar">
        <div className="clarity-chart-legend">{model.keys.map(key => <span key={key}><i style={{ background: color(key) }} />{label(key)}</span>)}</div>
        {!resultOnly && <div className="clarity-segment" role="group" aria-label="Chart style">{(["bars", "lines", "result"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "result" ? "Net result" : value === "lines" ? "Lines" : "Bars"}</button>)}</div>}
      </div>
      <div className="clarity-chart-plot">
        <svg viewBox={`0 0 ${width} 280`} className="clarity-chart-canvas" role="img" tabIndex={0}
          aria-label={`${mode === "result" ? "Net result" : "Income and expenses"} trend for ${range}. Use left and right arrow keys to select a date.`}
          aria-describedby={`${id}-selection`}
          onKeyDown={e => {
            if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) e.preventDefault();
            if (e.key === "ArrowLeft") pick((selectedIndex ?? rows.length) - 1);
            if (e.key === "ArrowRight") pick((selectedIndex ?? -1) + 1);
            if (e.key === "Home") pick(0);
            if (e.key === "End") pick(rows.length - 1);
            if (e.key === "Escape") { setActive(null); setPinned(false); }
          }}>
          {model.scale.ticks.map(value => <g key={value}>
            <line x1={model.left} x2={model.right} y1={model.y(value)} y2={model.y(value)} className={value === 0 ? "clarity-chart-zero" : "clarity-chart-grid"} />
            <text x={model.left - 10} y={model.y(value) + 4} textAnchor="end">{axisAmount(value)}</text>
          </g>)}
          {selectedIndex !== null && <rect x={model.x(selectedIndex) - model.slot / 2} y={model.top} width={model.slot} height={model.bottom - model.top} fill="var(--sp-surface-selected)" />}
          {model.keys.map((key, ki) => {
            const points = rows.map((r, i) => ({ x: model.x(i), y: model.y(r[key]) }));
            const d = monotonePath(points), bar = Math.min(20, model.slot * .28), zero = model.y(0);
            return <g key={key}>
              {mode === "result" && points.length > 1 && <path d={`${d} L ${points[points.length - 1].x} ${zero} L ${points[0].x} ${zero} Z`} fill={color(key)} opacity=".07" />}
              {mode !== "bars" && <path d={d} fill="none" stroke={color(key)} strokeWidth="2.5" strokeLinecap="round" />}
              {rows.map((row, i) => mode === "bars" ? <rect key={row.key} x={model.x(i) + (ki ? 3 : -bar - 3)} y={Math.min(zero, model.y(row[key]))} width={bar} height={Math.abs(model.y(row[key]) - zero)} rx="2.5" fill={color(key)}><title>{`${label(key)}: ${exactMoney(row[key])}`}</title></rect>
                : <circle key={row.key} cx={model.x(i)} cy={model.y(row[key])} r={selectedIndex === i ? 4.5 : rows.length <= 10 ? 3 : 1.5} fill={color(key)}><title>{`${label(key)}: ${exactMoney(row[key])}`}</title></circle>)}
            </g>;
          })}
          {rows.map((row, i) => <g key={row.key}>
            {(i % Math.max(1, Math.ceil(rows.length / Math.max(2, width / 90))) === 0 || i === rows.length - 1) && <text x={model.x(i)} y="262" textAnchor="middle">{row.label}</text>}
            <rect x={model.x(i) - model.slot / 2} y={model.top} width={model.slot} height={model.bottom - model.top} fill="transparent"
              onPointerEnter={() => { if (!pinned) setActive(i); }} onPointerLeave={() => { if (!pinned) setActive(null); }} onClick={() => pick(i)} />
          </g>)}
        </svg>
        {selected && <div className="clarity-chart-tooltip" aria-hidden="true"><strong>{selected.title}</strong>{model.keys.map(key => <span key={key}>{label(key)}<b>{exactMoney(selected[key])}</b></span>)}</div>}
      </div>
      <div className="clarity-chart-navigation">
        <span id={`${id}-selection`} aria-live="polite">{selected ? `${selected.title} · ${model.keys.map(k => `${label(k)} ${exactMoney(selected[k])}`).join(" · ")}` : "Select a date"}</span>
        <button type="button" aria-label="Previous chart date" onClick={() => pick((selectedIndex ?? rows.length) - 1)}><ChevronLeft size={16} /></button>
        <button type="button" aria-label="Next chart date" onClick={() => pick((selectedIndex ?? -1) + 1)}><ChevronRight size={16} /></button>
        <button type="button" aria-label="Clear chart selection" onClick={() => { setActive(null); setPinned(false); }}><X size={16} /></button>
      </div>
    </>}
    {rows.length > 0 && <details className="clarity-chart-data"><summary>Data table</summary><div><table><caption className="sr-only">Exact chart amounts for {range}</caption><thead><tr><th scope="col">Date</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net result</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.title}</th><td title={`Income: ${exactMoney(row.income_paisa)}`}>{exactMoney(row.income_paisa)}</td><td title={`Expenses: ${exactMoney(row.expense_paisa)}`}>{exactMoney(row.expense_paisa)}</td><td title={`Net result: ${exactMoney(row.net_profit_paisa)}`}>{exactMoney(row.net_profit_paisa)}</td></tr>)}</tbody></table></div></details>}
  </div>;
};
