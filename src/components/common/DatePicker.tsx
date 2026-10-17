import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || isoDate(date) !== value ? null : date;
}

function formatDate(value: string): string {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date)
    : "";
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  ariaLabel,
  id,
  min,
  max,
  required = false,
  disabled = false,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const [month, setMonth] = useState(() => {
    const selected = parseDate(value);
    return selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const [position, setPosition] = useState({ top: 0, left: 0, width: 292 });

  const updatePosition = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(292, window.innerWidth - 24);
    const estimatedHeight = 330;
    const below = window.innerHeight - rect.bottom;
    const top = below >= estimatedHeight || rect.top < estimatedHeight
      ? rect.bottom + 8
      : rect.top - estimatedHeight - 8;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !inputRef.current?.parentElement?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!required || disabled) return;
    const form = inputRef.current?.closest("form");
    if (!form) return;
    const validateRequired = (event: Event) => {
      if (value) return;
      event.preventDefault();
      event.stopPropagation();
      setIsInvalid(true);
      setIsOpen(true);
      inputRef.current?.focus();
    };
    form.addEventListener("submit", validateRequired, true);
    return () => form.removeEventListener("submit", validateRequired, true);
  }, [required, disabled, value]);

  const changeMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const days = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1),
  ];
  const locale = document.documentElement.lang || undefined;
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, index + 1)),
  );
  const copy = locale?.toLowerCase().startsWith("ur")
    ? { choose: "تاریخ منتخب کریں", open: "کیلنڈر کھولیں", previous: "پچھلا مہینہ", next: "اگلا مہینہ", none: "کوئی تاریخ منتخب نہیں", today: "آج", invalid: "تاریخ منتخب کریں" }
    : { choose: "Choose a date", open: "Open calendar", previous: "Previous month", next: "Next month", none: "No date selected", today: "Today", invalid: "Choose a date" };

  const openCalendar = () => {
    if (disabled) return;
    const selected = parseDate(value);
    const currentMonth = selected ?? new Date();
    setMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
    setIsOpen((open) => !open);
  };

  return (
    <>
      <div className="relative w-full">
        <input
          ref={inputRef}
          id={id}
          type="text"
          readOnly
          disabled={disabled}
          value={formatDate(value)}
          placeholder={copy.choose}
          aria-label={ariaLabel}
          aria-invalid={isInvalid || undefined}
          aria-describedby={isInvalid ? `${id || "date-picker"}-error` : undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? `${id || "date-picker"}-calendar` : undefined}
          onClick={openCalendar}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
              event.preventDefault();
              if (!isOpen) openCalendar();
            }
          }}
          className={cn("workspace-control w-full cursor-pointer px-3 pe-10 text-sm", className)}
        />
        <button
          type="button"
          onClick={openCalendar}
          disabled={disabled}
          aria-label={`${copy.open}: ${ariaLabel}`}
          className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-text-muted transition-colors hover:text-primary disabled:cursor-not-allowed"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      {isInvalid && <span id={`${id || "date-picker"}-error`} role="alert" className="mt-1 block text-[11px] text-danger">{copy.invalid}</span>}
      {isOpen && createPortal(
        <div
          id={`${id || "date-picker"}-calendar`}
          ref={popoverRef}
          role="dialog"
          aria-label={`${ariaLabel} calendar`}
          className="date-picker-popover fixed z-[90] w-[292px] rounded-xl border border-border-standard bg-surface-bright p-3 text-on-surface shadow-level-3"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => changeMonth(-1)} className="date-picker-nav" aria-label={copy.previous}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <strong className="text-sm font-semibold">{monthLabel}</strong>
            <button type="button" onClick={() => changeMonth(1)} className="date-picker-nav" aria-label={copy.next}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day, index) => (
              <span key={`${day}-${index}`} className="pb-1 text-[10px] font-semibold uppercase text-text-muted">{day}</span>
            ))}
            {days.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />;
              const candidate = new Date(month.getFullYear(), month.getMonth(), day);
              const key = isoDate(candidate);
              const selected = key === value;
              const isToday = key === isoDate(new Date());
              const isDisabled = Boolean((min && key < min) || (max && key > max));
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isDisabled}
                  aria-label={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(candidate)}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(key);
                    setIsInvalid(false);
                    setIsOpen(false);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "date-picker-day",
                    selected && "date-picker-day--selected",
                    isToday && !selected && "date-picker-day--today",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border-standard pt-2">
            <span className="text-[11px] text-text-muted">{value ? formatDate(value) : copy.none}</span>
            <button
              type="button"
              onClick={() => {
                const today = isoDate(new Date());
                if ((min && today < min) || (max && today > max)) return;
                onChange(today);
                setIsOpen(false);
              }}
              disabled={Boolean((min && isoDate(new Date()) < min) || (max && isoDate(new Date()) > max))}
              className="text-xs font-semibold text-primary hover:text-primary-hover disabled:opacity-50"
            >
              {copy.today}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
