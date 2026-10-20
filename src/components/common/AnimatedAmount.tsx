import React, { useEffect, useRef, useState } from "react";
import { formatPaisa } from "../../lib/money";

interface AnimatedAmountProps {
  amountPaisa: number;
  loading?: boolean;
  error?: boolean;
}

const DURATION_MS = 720;

/** A restrained count-up for headline totals; detailed ledger figures stay static. */
export const AnimatedAmount: React.FC<AnimatedAmountProps> = ({
  amountPaisa,
  loading = false,
  error = false,
}) => {
  const [displayAmount, setDisplayAmount] = useState(0);
  const displayAmountRef = useRef(0);

  useEffect(() => {
    if (loading || error) return;

    const target = Number.isFinite(amountPaisa) ? Math.round(amountPaisa) : 0;
    const startAmount = displayAmountRef.current;
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const finish = () => {
      displayAmountRef.current = target;
      setDisplayAmount(target);
    };

    if (!motionPreference || motionPreference.matches || startAmount === target) {
      finish();
      return;
    }

    let frame = 0;
    let startTime: number | null = null;
    const animate = (time: number) => {
      startTime ??= time;
      const progress = Math.min((time - startTime) / DURATION_MS, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextAmount = Math.round(startAmount + (target - startAmount) * easedProgress);
      displayAmountRef.current = nextAmount;
      setDisplayAmount(nextAmount);

      if (progress < 1) frame = window.requestAnimationFrame(animate);
      else finish();
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        window.cancelAnimationFrame(frame);
        finish();
      }
    };

    frame = window.requestAnimationFrame(animate);
    motionPreference.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      window.cancelAnimationFrame(frame);
      motionPreference.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, [amountPaisa, error, loading]);

  if (loading) return <>Loading…</>;
  if (error) return <>—</>;

  const accessibleAmount = Number.isFinite(amountPaisa) ? amountPaisa : 0;

  return (
    <span>
      <span aria-hidden="true" className="animated-amount-value">
        {formatPaisa(displayAmount)}
      </span>
      <span className="sr-only">{formatPaisa(accessibleAmount)}</span>
    </span>
  );
};
