import React from "react";
import { LoaderCircle } from "lucide-react";
import { Button as PrimitiveButton } from "../ui/button";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "teal" | "indigo" | "emerald";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}
/** Compatibility boundary: every existing form now uses the shared shadcn button. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => (
    <PrimitiveButton ref={ref} variant={variant === "danger" ? "destructive" : variant === "ghost" || variant === "secondary" || variant === "outline" ? variant : "default"}
      size={size === "md" ? "default" : size} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...props}>
      {isLoading && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {children}{isLoading && <span className="sr-only">Processing</span>}
    </PrimitiveButton>
  ),
);
Button.displayName = "Button";
