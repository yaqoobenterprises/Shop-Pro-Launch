import React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "danger"
    | "ghost"
    | "teal"
    | "indigo"
    | "emerald";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 select-none cursor-pointer";

    const variants = {
      primary:
        "bg-primary hover:bg-primary-hover text-on-primary border border-primary",
      indigo:
        "bg-primary hover:bg-primary-hover text-on-primary border border-primary",
      secondary:
        "bg-surface-bright hover:bg-surface-container-low text-on-surface border border-border-standard",
      outline:
        "bg-surface-bright border border-border-standard hover:bg-surface-container-low text-on-surface",
      ghost:
        "bg-transparent text-text-muted hover:text-on-surface hover:bg-surface-container-low",
      danger:
        "bg-danger hover:bg-danger/90 text-on-error border border-danger",
      teal: "bg-primary hover:bg-primary-hover text-on-primary border border-primary",
      emerald:
        "bg-primary hover:bg-primary-hover text-on-primary border border-primary",
    };

    const sizes = {
      sm: "min-h-10 px-3 text-xs gap-1.5 rounded-[var(--radius-control-sm)]",
      md: "min-h-11 px-4 text-sm gap-2 rounded-[var(--radius-control)]",
      lg: "min-h-12 px-5 text-base gap-2.5 rounded-[var(--radius-control)]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ?
          <svg
            className="animate-spin motion-reduce:animate-none h-4 w-4 text-current"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        : null}
        {children}
        {isLoading && <span className="sr-only">Processing</span>}
      </button>
    );
  },
);
Button.displayName = "Button";
