import React, { useEffect, useRef } from "react";
import { init, use as registerECharts, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent, AriaComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useReducedMotion } from "motion/react";
registerECharts([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, AriaComponent, SVGRenderer]);
interface Props { option: EChartsCoreOption; label: string; height?: number; onSelect?: (index: number) => void; onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>; descriptionId?: string }
/** One lifecycle for all charts: real data, SVG, responsive resize and deterministic disposal. */
export function EChart({ option, label, height = 280, onSelect, onKeyDown, descriptionId }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<EChartsType | null>(null);
  const optionRef = useRef(option); optionRef.current = option;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => {
      if (element.clientWidth <= 0) return;
      if (!instance.current) {
        instance.current = init(element, undefined, { renderer: "svg" });
        instance.current.on("click", params => { if (typeof params.dataIndex === "number") selectRef.current?.(params.dataIndex); });
        instance.current.setOption({ ...optionRef.current, animation: !reduced, animationDuration: 320, animationDurationUpdate: 260, aria: { enabled: false } });
      } else instance.current.resize();
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); instance.current?.dispose(); instance.current = null; };
  }, [reduced]);
  useEffect(() => { instance.current?.setOption({ ...option, animation: !reduced, animationDuration: 320, animationDurationUpdate: 260 }, { notMerge: true }); }, [option, reduced]);
  return <div role="img" aria-label={label} aria-describedby={descriptionId} tabIndex={onKeyDown ? 0 : undefined} onKeyDown={onKeyDown} className="sp-echart" style={{ height }}><div ref={host} aria-hidden="true" style={{ width: "100%", height: "100%" }} /></div>;
}
