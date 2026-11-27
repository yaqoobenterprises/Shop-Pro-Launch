import React from "react";
import { formatRecordedPaisa as formatPaisa } from "../../lib/money";

interface AnimatedAmountProps {
  amountPaisa: number;
  loading?: boolean;
  error?: boolean;
}

/** Retain the component API; financial amounts are never interpolated or invented. */
export const AnimatedAmount: React.FC<AnimatedAmountProps> = ({
  amountPaisa,
  loading = false,
  error = false,
}) => {
  if (loading) return <span className="finance-skeleton finance-skeleton--amount" role="status"><span className="sr-only">Loading…</span></span>;
  if (error || !Number.isSafeInteger(amountPaisa)) {
    return <span aria-label="Amount unavailable">—</span>;
  }
  return <span className="animated-amount-value tabular-nums">{formatPaisa(amountPaisa)}</span>;
};
