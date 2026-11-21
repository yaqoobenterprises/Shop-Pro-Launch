import React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  shortcutHint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      error,
      leftIcon,
      rightIcon,
      shortcutHint,
      id,
      "aria-describedby": describedBy,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const inputId = id || (label ? `input-${reactId}` : undefined);
    const errorId = error ? `error-${reactId}` : undefined;
    const descriptionIds = [describedBy, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full space-y-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-on-surface"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            ref={ref}
            aria-invalid={error ? true : ariaInvalid}
            aria-describedby={descriptionIds}
            className={cn(
              "min-h-11 w-full rounded-lg border border-border-standard bg-surface-bright px-3 py-2 font-sans text-sm text-on-surface shadow-xs transition-all duration-150 placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-9",
              (rightIcon || shortcutHint) && "pr-12",
              error &&
                "border-danger focus:border-danger focus:ring-danger/15",
              className,
            )}
            {...props}
          />
          {shortcutHint && !rightIcon && (
            <div className="pointer-events-none absolute right-2.5 flex items-center">
              <kbd className="rounded border border-border-standard bg-surface-container-low px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                {shortcutHint}
              </kbd>
            </div>
          )}
          {rightIcon && (
            <div className="pointer-events-none absolute right-3 flex items-center text-text-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p id={errorId} role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";
