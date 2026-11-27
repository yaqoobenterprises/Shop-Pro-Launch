import React, { useState } from "react";
import { ChartPie } from "lucide-react";
import { formatPaisa } from "../../lib/money";
const exactMoney = (value: number) => formatPaisa(value, { showPaisaIfFraction: true });

interface Item { key: string; label: string; amountPaisa: number }
interface Props { items: Item[]; label?: string; listLabel?: string }
const palette = Array.from({ length: 6 }, (_, i) => `var(--sp-chart-${i + 1})`);

export const CategoryDonut: React.FC<Props> = ({ items, label = "Expenses", listLabel = "Expense totals by category" }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const positive = items.filter(item => Number.isSafeInteger(item.amountPaisa) && item.amountPaisa > 0);
  const totalBig = positive.reduce((n, item) => n + BigInt(item.amountPaisa), 0n);
  if (items.some(item => !Number.isSafeInteger(item.amountPaisa)) || totalBig > BigInt(Number.MAX_SAFE_INTEGER)) return <p role="status">Category total unavailable.</p>;
  const total = Number(totalBig);
  const selectedKey = positive.some(item => item.key === selected) ? selected : null;
  if (!positive.length) return <div className="clarity-chart-empty"><ChartPie size={28} aria-hidden="true" /><span>No expenses for this period.</span></div>;
  const compact = total >= 100_000_000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(total / 100) : null;
  const fallback = positive.length > 6;
  let offset = 0;
  return <div className={`clarity-donut ${fallback ? "clarity-donut--ranked" : ""}`}>
    {!fallback && <div className="clarity-donut-figure">
      <svg viewBox="0 0 192 192" role="img" aria-label={`${label} category distribution. Total ${exactMoney(total)}`}>
        <circle cx="96" cy="96" r="70" fill="none" stroke="var(--sp-border)" strokeWidth="24" />
        {positive.map((item, i) => {
          const share = item.amountPaisa / total * 100, start = offset; offset += share;
          return <circle key={item.key} cx="96" cy="96" r="70" fill="none" pathLength="100" stroke={palette[i % 6]} strokeWidth="24"
            strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 96 96)"
            opacity={selectedKey && selectedKey !== item.key ? .25 : 1}><title>{`${item.label}: ${exactMoney(item.amountPaisa)}`}</title></circle>;
        })}
      </svg>
      <div className="clarity-donut-center"><span>{label}</span><strong aria-label={exactMoney(total)}>{compact ? `${exactMoney(0).replace(/[\d.,\s]+/gu, "")} ${compact}` : exactMoney(total)}</strong><small>Selected period</small></div>
    </div>}
    {fallback && <p className="clarity-donut-total">{label}<strong>{exactMoney(total)}</strong></p>}
    <ul className="clarity-donut-legend" aria-label={listLabel}>{positive.map((item, i) => <li key={item.key}>
      <button type="button" aria-pressed={selectedKey === item.key} onClick={() => setSelected(selected === item.key ? null : item.key)}>
        <i style={{ background: palette[i % 6] }} aria-hidden="true" /><span>{item.label}</span><small>{(item.amountPaisa / total * 100).toFixed(1)}%</small><strong>{exactMoney(item.amountPaisa)}</strong>
        {fallback && <span className="clarity-ranked-track" aria-hidden="true"><i style={{ width: `${item.amountPaisa / total * 100}%`, background: palette[i % 6] }} /></span>}
      </button>
    </li>)}</ul>
  </div>;
};
