import React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "indigo"
    | "blue"
    | "cyan"
    | "teal"
    | "purple"
    | "amber"
    | "emerald"
    | "rose"
    | "slate"
    | "primary"
    | "neutral"
    | "success"
    | "warning"
    | "danger";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "teal",
  size = "md",
  children,
  ...props
}) => {
  const variants = {
    indigo: "bg-primary/10 text-primary border-primary/20",
    primary: "bg-primary/10 text-primary border-primary/20",
    blue: "bg-surface-container-low text-on-surface-variant border-outline-variant",
    cyan: "bg-primary/10 text-primary border-primary/20",
    teal: "bg-success-bg text-success border-success-border",
    emerald: "bg-success-bg text-success border-success-border",
    success: "bg-success-bg text-success border-success-border",
    purple: "bg-tertiary-container text-on-tertiary-container border-tertiary/20",
    amber: "bg-warning-bg text-warning border-warning-border",
    warning: "bg-warning-bg text-warning border-warning-border",
    rose: "bg-danger-bg text-danger border-danger-border",
    danger: "bg-danger-bg text-danger border-danger-border",
    slate: "bg-surface-container-low text-secondary border-border-standard",
    neutral: "bg-surface-container-low text-secondary border-border-standard",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-[11px] font-medium leading-none",
    md: "px-2.5 py-1 text-xs font-medium leading-none",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border tracking-normal whitespace-nowrap select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
