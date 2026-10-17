import React, {
  ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { readSelectOptions, SelectOption } from "./selectOptions";
import { getSelectPosition } from "./selectPosition";

interface SelectProps {
  value?: string | number;
  onChange?: (event: { target: { value: string } }) => void;
  children: ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  title?: string;
}

export const Select: React.FC<SelectProps> = ({
  value = "",
  onChange,
  children,
  id,
  className,
  disabled = false,
  required = false,
  searchable = false,
  searchPlaceholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  title,
}) => {
  const instanceId = useId();
  const listboxId = `select-listbox-${instanceId}`;
  const errorId = `select-error-${instanceId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInvalid, setIsInvalid] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240, maxHeight: 280 });
  const options = useMemo(() => readSelectOptions(children), [children]);
  const stringValue = String(value);
  const isUrdu = typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("ur");
  const resolvedSearchPlaceholder = searchPlaceholder || (isUrdu ? "اختیارات تلاش کریں" : "Search options…");
  const selectedOption = options.find((option) => option.value === stringValue);
  const visibleOptions = options.filter((option) =>
    !searchable || option.searchText.includes(query.trim().toLocaleLowerCase()),
  );

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(getSelectPosition(rect, window.innerWidth, window.innerHeight));
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const focusTarget = window.requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else optionRefs.current[activeIndex]?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusTarget);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, searchable, activeIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!required || disabled) return;
    const form = triggerRef.current?.closest("form");
    if (!form) return;
    const validateRequired = (event: Event) => {
      if (String(value) !== "") return;
      event.preventDefault();
      event.stopPropagation();
      setIsInvalid(true);
      setIsOpen(true);
      triggerRef.current?.focus();
    };
    form.addEventListener("submit", validateRequired, true);
    return () => form.removeEventListener("submit", validateRequired, true);
  }, [required, disabled, value]);

  useEffect(() => {
    if (!visibleOptions.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, visibleOptions.length - 1));
  }, [query, options.length, visibleOptions.length]);

  const chooseOption = (option: SelectOption) => {
    if (option.disabled) return;
    onChange?.({ target: { value: option.value } });
    setIsInvalid(false);
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const openMenu = (index = Math.max(0, visibleOptions.findIndex((option) => option.value === stringValue))) => {
    if (disabled) return;
    setActiveIndex(index);
    setIsOpen(true);
  };

  const moveActive = (direction: number) => {
    if (!visibleOptions.length) return;
    let next = activeIndex;
    for (let tries = 0; tries < visibleOptions.length; tries += 1) {
      next = (next + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[next].disabled) break;
    }
    setActiveIndex(next);
    if (!searchable) optionRefs.current[next]?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openMenu(event.key === "ArrowUp" ? visibleOptions.length - 1 : undefined);
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if ((event.key === "Enter" || event.key === " ") && !isOpen) {
      event.preventDefault();
      openMenu();
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const handlePopupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : visibleOptions.length - 1;
      setActiveIndex(index);
      if (!searchable) optionRefs.current[index]?.focus();
    } else if (event.key === "Enter" && visibleOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(visibleOptions[activeIndex]);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        aria-invalid={isInvalid || undefined}
        aria-describedby={isInvalid ? errorId : undefined}
        disabled={disabled}
        title={title}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "workspace-control flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
          disabled && "cursor-not-allowed opacity-60",
          isInvalid && "border-danger focus:border-danger",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selectedOption?.label ?? <span className="text-text-muted">Select an option</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
      </button>
      {isInvalid && <span id={errorId} role="alert" className="mt-1 block text-[11px] text-danger">{isUrdu ? "ایک اختیار منتخب کریں" : "Choose an option."}</span>}
      {isOpen && createPortal(
        <div
          ref={popupRef}
          className="custom-select-popover fixed z-[120] overflow-hidden rounded-xl border border-border-standard bg-surface-bright text-on-surface shadow-level-3"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          onKeyDown={handlePopupKeyDown}
        >
          {searchable && (
            <div className="border-b border-border-standard p-2">
              <label className="flex min-h-9 items-center gap-2 rounded-lg border border-border-standard bg-surface-container-low px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder={resolvedSearchPlaceholder}
                  aria-label={resolvedSearchPlaceholder}
                  aria-controls={listboxId}
                  aria-activedescendant={visibleOptions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-text-muted"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                />
              </label>
            </div>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel || "Options"}
            className="overflow-y-auto p-1.5"
            style={{ maxHeight: Math.max(112, position.maxHeight - (searchable ? 58 : 0)) }}
          >
            {visibleOptions.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-text-muted">No matching options</p>
            ) : visibleOptions.map((option, index) => {
              const isSelected = option.value === stringValue;
              return (
                <button
                  ref={(element) => { optionRefs.current[index] = element; }}
                  key={`${option.value}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  data-option-index={index}
                  onFocus={() => setActiveIndex(index)}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => chooseOption(option)}
                  className={cn(
                    "flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    activeIndex === index && "bg-surface-container-low",
                    isSelected && "font-semibold text-primary",
                    option.disabled && "cursor-not-allowed opacity-50",
                    !option.disabled && "hover:bg-surface-container-low",
                  )}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
