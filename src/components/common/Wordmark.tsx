import React from "react";
/** Typography-only product identity; installed applications use the separate monogram. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`sp-wordmark ${className}`} aria-label="Shop Pro">Shop<span>Pro</span><i aria-hidden="true">.</i></span>;
}
