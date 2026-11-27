import React from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatedAmount } from "../common/AnimatedAmount";

type FinancialMetricState = "loading" | "ready" | "unavailable";

interface OverviewMetricCardProps {
  label: string;
  scope: string;
  amountPaisa: number;
  icon: LucideIcon;
  state: FinancialMetricState;
  tone?: "default" | "positive" | "negative";
}

/** A source-backed metric: never turn missing financial data into a fabricated zero. */
export const OverviewMetricCard: React.FC<OverviewMetricCardProps> = ({
  label,
  scope,
  amountPaisa,
  icon: Icon,
  state,
  tone = "default",
}) => (
  <article className={`metric aq-metric aq-metric--${tone}`} title={scope}>
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
    <span className="sr-only">{scope}</span>
  </article>
);
