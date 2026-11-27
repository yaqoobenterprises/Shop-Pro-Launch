import React from "react";
import { cn } from "../../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className,
  hoverable,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border-standard bg-surface-bright p-4 text-on-surface transition-colors duration-150 sm:p-5",
        hoverable && "cursor-pointer hover:border-primary/40",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "mb-4 flex items-center justify-between border-b border-border-standard pb-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3
      className={cn(
        "text-base font-semibold tracking-tight text-on-surface",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  );
};
