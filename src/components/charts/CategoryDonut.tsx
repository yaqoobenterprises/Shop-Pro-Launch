import React, { useMemo, useState } from "react";
import { ChartPie } from "lucide-react";
import { useChartTheme } from "./useChartTheme";
import { EChart } from "./EChart";
import { categoryOptions, exactMoney, type ChartItem } from "./echartsOptions";
interface Props { items: ChartItem[]; label?: string; listLabel?: string }
export const CategoryDonut: React.FC<Props> = ({ items, label = "Expenses", listLabel = "Expense totals by category" }) => {
  const colors = useChartTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const positive = useMemo(() => items.filter(item => Number.isSafeInteger(item.amountPaisa) && item.amountPaisa > 0), [items]);
  const option = useMemo(() => categoryOptions(positive, colors, selected), [positive, colors, selected]);
  const totalBig = positive.reduce((n, i) => n + BigInt(i.amountPaisa), 0n);
  if (items.some(i => !Number.isSafeInteger(i.amountPaisa)) || totalBig > BigInt(Number.MAX_SAFE_INTEGER)) return <p role="status">Category total unavailable.</p>;
  if (!positive.length) return <div className="clarity-chart-empty"><ChartPie size={28} aria-hidden="true" /><strong>No expenses for this period.</strong></div>;
  const total = Number(totalBig), active = positive.find(i => i.key === selected), ranked = positive.length > 6;
  return <div className="clarity-donut">
    <div className="clarity-donut-figure">
      <EChart option={option} label={`${label} category distribution. Total ${exactMoney(total)}. Exact amounts and shares in the legend.`} height={ranked ? Math.min(420, positive.length * 32 + 32) : 224} onSelect={i => setSelected(current => current === positive[i]?.key ? null : positive[i]?.key ?? null)} />
      {!ranked && <div className="clarity-donut-center"><span>{active?.label || label}</span><strong aria-label={exactMoney(active?.amountPaisa ?? total)}>{exactMoney(active?.amountPaisa ?? total)}</strong><small>{active ? `${(active.amountPaisa / total * 100).toFixed(1)}% of total` : `${positive.length} categories`}</small></div>}
    </div>
    <ul className="clarity-donut-legend" aria-label={listLabel}>{positive.map((item, i) => <li key={item.key}><button type="button" aria-pressed={selected === item.key} onClick={() => setSelected(selected === item.key ? null : item.key)}><i style={{ background: `var(--sp-chart-${i % 6 + 1})` }} aria-hidden="true" /><span>{item.label}<small>{(item.amountPaisa / total * 100).toFixed(1)}%</small></span><strong>{exactMoney(item.amountPaisa)}</strong></button></li>)}</ul>
  </div>;
};
