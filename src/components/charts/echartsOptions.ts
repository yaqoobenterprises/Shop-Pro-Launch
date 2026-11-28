import type { EChartsCoreOption } from "echarts/core";
import type { ReportTrendBucket } from "../../lib/reportAnalytics";
import { formatPaisa } from "../../lib/money";
export type ChartMode = "bars" | "lines" | "result";
export interface ChartTheme { text: string; muted: string; grid: string; zero: string; surface: string; border: string; income: string; expense: string; result: string; palette: string[]; font: string }
export const exactMoney = (value: number) => formatPaisa(value, { showPaisaIfFraction: true });
export const axisAmount = (value: number) => value !== 0 && Math.abs(value) < 100 ? (value / 100).toFixed(2) : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100);
export function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(`--sp-${name}`).trim();
  return { text: value("text"), muted: value("text-secondary"), grid: value("chart-grid"), zero: value("chart-zero"), surface: value("surface-raised"), border: value("border"), income: value("chart-income"), expense: value("chart-expense"), result: value("chart-result"), palette: Array.from({ length: 6 }, (_, i) => value(`chart-${i + 1}`)), font: value("font") };
}
export function cashFlowOptions(rows: ReportTrendBucket[], mode: ChartMode, theme: ChartTheme): EChartsCoreOption {
  const keys = mode === "result" ? ["net_profit_paisa"] as const : ["income_paisa", "expense_paisa"] as const;
  const labels = { income_paisa: "Income", expense_paisa: "Expenses", net_profit_paisa: "Net result" };
  const colors = { income_paisa: theme.income, expense_paisa: theme.expense, net_profit_paisa: theme.result };
  return {
    textStyle: { fontFamily: theme.font, color: theme.muted, fontSize: 12 },
    grid: { left: 4, right: 12, top: 20, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", confine: true, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { fontFamily: theme.font, color: theme.text, fontSize: 12 }, valueFormatter: (v: unknown) => exactMoney(Number(v)) },
    xAxis: { type: "category", data: rows.map(r => r.label), boundaryGap: true, axisLine: { lineStyle: { color: theme.zero } }, axisTick: { show: false }, axisLabel: { margin: 16, hideOverlap: true, color: theme.muted } },
    yAxis: { type: "value", scale: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { formatter: axisAmount, color: theme.muted }, splitLine: { lineStyle: { color: theme.grid, type: "dashed" } } },
    series: keys.map(key => ({ name: labels[key], type: mode === "bars" ? "bar" : "line", data: rows.map(r => r[key]), color: colors[key], barMaxWidth: 22, barGap: "35%", itemStyle: { borderRadius: mode === "bars" ? [3, 3, 0, 0] : 0 }, lineStyle: { width: 2.5 }, symbol: "circle", symbolSize: rows.length <= 10 ? 5 : 3, showSymbol: rows.length <= 10, smooth: false, areaStyle: mode === "result" ? { opacity: .08 } : undefined, emphasis: { focus: "series" }, markLine: mode === "result" ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: theme.zero, type: "solid" }, data: [{ yAxis: 0 }] } : undefined })),
  };
}
export interface ChartItem { key: string; label: string; amountPaisa: number }
export function categoryOptions(items: ChartItem[], theme: ChartTheme, selectedKey: string | null = null): EChartsCoreOption {
  const ranked = items.length > 6;
  return {
    color: theme.palette,
    textStyle: { fontFamily: theme.font, color: theme.muted },
    tooltip: { trigger: "item", renderMode: "richText", confine: true, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { color: theme.text, fontFamily: theme.font }, valueFormatter: (v: unknown) => exactMoney(Number(v)) },
    ...(ranked ? { grid: { top: 8, left: 4, right: 12, bottom: 8, containLabel: true }, xAxis: { type: "value", axisLabel: { formatter: axisAmount, color: theme.muted }, splitLine: { lineStyle: { color: theme.grid } } }, yAxis: { type: "category", inverse: true, data: items.map(i => i.label), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { width: 100, overflow: "truncate", color: theme.muted } } } : {}),
    series: ranked ? [{ type: "bar", data: items.map((i, index) => ({ value: i.amountPaisa, name: i.label, itemStyle: { color: theme.palette[index % 6], borderRadius: [0, 3, 3, 0] } })), barMaxWidth: 12 }] : [{ type: "pie", radius: ["69%", "87%"], center: ["50%", "50%"], startAngle: 90, padAngle: 0, avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false }, selectedMode: "single", selectedOffset: 4, emphasis: { scale: true, scaleSize: 3 }, data: items.map(i => ({ id: i.key, name: i.label, value: i.amountPaisa, selected: i.key === selectedKey })) }],
  };
}
