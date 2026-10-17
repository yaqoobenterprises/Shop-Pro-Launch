import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface MonthPickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  id?: string;
}

const locale = () => document.documentElement.lang || undefined;
const monthValue = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;

export const MonthPicker: React.FC<MonthPickerProps> = ({ value, onChange, ariaLabel, className, id }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 });
  const selectedMonth = Math.min(11, Math.max(0, (Number(value.slice(5, 7)) || 1) - 1));
  const formatter = new Intl.DateTimeFormat(locale(), { month: "long" });
  const monthNames = Array.from({ length: 12 }, (_, month) => formatter.format(new Date(2024, month, 1)));
  const isUrdu = locale()?.toLowerCase().startsWith("ur");
  const displayValue = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(
    new Date(Number(value.slice(0, 4)) || year, selectedMonth, 1),
  );

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(300, window.innerWidth - 24);
    const height = 324;
    const below = window.innerHeight - rect.bottom;
    const top = below >= height || rect.top < height ? rect.bottom + 8 : rect.top - height - 8;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const focusFrame = window.requestAnimationFrame(() => monthRefs.current[selectedMonth]?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, selectedMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setIsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  const chooseMonth = (month: number) => {
    onChange(monthValue(year, month) + "-01");
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const moveMonthFocus = (event: React.KeyboardEvent<HTMLButtonElement>, month: number) => {
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3,
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = (month + offset + 12) % 12;
    monthRefs.current[next]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={cn("workspace-control inline-flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-left text-sm", className)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          setYear(Number(value.slice(0, 4)) || new Date().getFullYear());
          setIsOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " " || event.key === "ArrowDown") && !isOpen) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span>{displayValue}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          className="date-picker-popover fixed z-[90] w-[280px] rounded-xl border border-border-standard bg-surface-bright p-3 text-on-surface shadow-level-3"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setYear((current) => current - 1)} className="date-picker-nav" aria-label={isUrdu ? "پچھلا سال" : "Previous year"}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <strong className="text-sm font-semibold">{year}</strong>
            <button type="button" onClick={() => setYear((current) => current + 1)} className="date-picker-nav" aria-label={isUrdu ? "اگلا سال" : "Next year"}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`${year} months`}>
            {monthNames.map((name, month) => (
              <button
                ref={(element) => { monthRefs.current[month] = element; }}
                key={name}
                type="button"
                aria-pressed={Number(value.slice(0, 4)) === year && month === selectedMonth}
                onKeyDown={(event) => moveMonthFocus(event, month)}
                onClick={() => chooseMonth(month)}
                className={cn(
                  "min-h-10 rounded-lg px-2 text-xs font-medium capitalize transition-colors hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  Number(value.slice(0, 4)) === year && month === selectedMonth && "bg-primary text-on-primary hover:bg-primary-hover",
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end border-t border-border-standard pt-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const currentMonth = monthValue(now.getFullYear(), now.getMonth());
                onChange(`${currentMonth}-01`);
                setIsOpen(false);
              }}
              className="text-xs font-semibold text-primary hover:text-primary-hover"
            >
              {isUrdu ? "اس مہینے" : "This month"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
