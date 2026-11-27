import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

const openDialogs: HTMLElement[] = [];
const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
)).filter((element) =>
  element.tabIndex >= 0 && !element.matches(":disabled, [aria-disabled='true']") &&
  !element.closest("[hidden], [inert]") && getComputedStyle(element).visibility !== "hidden" &&
  getComputedStyle(element).display !== "none",
);

export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, description, children, maxWidth = "lg",
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel) return;
    const previousFocus = document.activeElement;
    openDialogs.push(panel);
    closeRef.current?.focus();
    const isTop = () => openDialogs.at(-1) === panel;
    const containFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !panel.contains(event.target)) {
        (focusable(panel)[0] ?? panel).focus();
      }
    };
    const containTab = (event: KeyboardEvent) => {
      if (!isTop() || event.key !== "Tab" || event.defaultPrevented) return;
      const controls = focusable(panel);
      const first = controls[0];
      const last = controls.at(-1);
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("focusin", containFocus);
    document.addEventListener("keydown", containTab);
    return () => {
      const wasTop = isTop();
      const index = openDialogs.lastIndexOf(panel);
      if (index >= 0) openDialogs.splice(index, 1);
      document.removeEventListener("focusin", containFocus);
      document.removeEventListener("keydown", containTab);
      if (wasTop && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key !== "Escape" || event.defaultPrevented || !panel ||
          openDialogs.at(-1) !== panel || panel.querySelector("[data-shop-plus-popover]")) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const widthClasses = {
    sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl",
    "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-3 sm:p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        data-shop-plus-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[90dvh] w-full flex-col rounded-[var(--radius-dialog)] border border-border-standard bg-surface-bright shadow-level-3",
          widthClasses[maxWidth],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-standard px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-on-surface">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-text-muted">{description}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
};
