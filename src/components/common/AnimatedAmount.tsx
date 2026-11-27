import React from "react";
import { formatPaisa } from "../../lib/money";
import { Skeleton } from "../ui/skeleton";
interface AnimatedAmountProps { amountPaisa: number; loading?: boolean; error?: boolean }
/** Financial figures are immediately exact; motion never counts through invented amounts. */
export const AnimatedAmount: React.FC<AnimatedAmountProps> = ({ amountPaisa, loading = false, error = false }) => {
  if (loading) return <><Skeleton className="inline-block h-[1em] w-28 align-middle" /><span className="sr-only">Loading amount</span></>;
  if (error || !Number.isSafeInteger(amountPaisa)) return <span aria-label="Amount unavailable">—</span>;
  return <span className="tabular-nums">{formatPaisa(amountPaisa, { showPaisaIfFraction: true })}</span>;
};
