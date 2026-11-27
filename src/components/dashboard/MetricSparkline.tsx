import React, { useMemo } from "react";
import { EChart } from "../charts/EChart";
import { useChartTheme } from "../charts/useChartTheme";

export function MetricSparkline({ values, label, tone }: { values: number[]; label: string; tone: "default" | "positive" | "negative" }) {
  const colors = useChartTheme();
  const option = useMemo(() => {
    const color = tone === "positive" ? colors.income : tone === "negative" ? colors.expense : colors.result;
    return { grid: { left: 0, right: 0, top: 6, bottom: 4 }, xAxis: { type: "category", show: false, data: values.map((_, i) => i) }, yAxis: { type: "value", show: false, scale: false }, series: [{ type: "line", data: values, symbol: "none", color, lineStyle: { width: 1.7 }, areaStyle: { opacity: .06 }, silent: true }] };
  }, [values, colors, tone]);
  return <div className="sp-sparkline"><EChart option={option} height={42} label={`${label} trend across the selected period. Exact amounts in Cash flow data.`} /></div>;
}
