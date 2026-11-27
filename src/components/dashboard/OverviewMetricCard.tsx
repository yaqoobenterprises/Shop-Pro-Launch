import React from "react";
import type { LucideIcon } from "lucide-react";
import { MetricSparkline } from "./MetricSparkline";
import { AnimatedAmount } from "../common/AnimatedAmount";

type FinancialMetricState = "loading" | "ready" | "unavailable";

interface OverviewMetricCardProps {
  label: string;
  scope: string;
  amountPaisa: number;
  icon: LucideIcon;
  state: FinancialMetricState;
  previous?: number;
  trend?: number[];
  tone?: "default" | "positive" | "negative";
}

/** A source-backed metric: never turn missing financial data into a fabricated zero. */
export const OverviewMetricCard: React.FC<OverviewMetricCardProps> = ({
  label,
  scope,
  amountPaisa,
  icon: Icon,
  state,
  tone = "default", previous, trend,
}) => (
  <article className={`metric aq-metric aq-metric--${tone}`}>
    <div className="metric-top">
      <span>{label}</span>
      <Icon aria-hidden="true" />
    </div>
    <strong className="metric-amount num">
      {state === "unavailable" ? (
        <span aria-label="Amount unavailable">—</span>
      ) : (
        <AnimatedAmount amountPaisa={amountPaisa} loading={state === "loading"} />
      )}
    </strong>
    <span className="aq-metric__scope">{scope}</span>
    {state === "ready" && previous !== undefined && <span className="sp-metric-trend">{previous === 0 ? (amountPaisa === 0 ? "No change" : "No prior activity") : <><b>{amountPaisa >= previous ? "+" : ""}{((amountPaisa - previous) / Math.abs(previous) * 100).toFixed(1)}%</b> vs previous period</>}</span>}
    {state === "ready" && trend && trend.length > 1 && <MetricSparkline values={trend} label={label} tone={tone} />}
  </article>
);
