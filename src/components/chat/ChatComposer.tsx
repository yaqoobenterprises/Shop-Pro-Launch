import React, { useState, useRef, useEffect } from "react";
import { CalendarDays, Minus, Plus, Send } from "lucide-react";
import { SeedCategory } from "../../parser";
import { useI18n } from "../../i18n";

interface ChatComposerProps {
  onSend: (text: string) => void | Promise<void>;
  categories: SeedCategory[];
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  focusRequestId?: number;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  categories,
  disabled = false,
  placeholder,
  autoFocus = true,
  focusRequestId = 0,
}) => {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
    if (focusRequestId > 0) textareaRef.current?.focus();
  }, [autoFocus, focusRequestId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled || submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSend(trimmed);
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "This entry could not be reviewed. Your text is still here.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow up to 120px
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const insertChip = (chipText: string) => {
    setText((prev) => (prev ? `${prev} ${chipText}` : chipText));
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="ledger-composer border-t border-border-standard px-3 py-2.5 sm:px-5 sm:py-3">
      <div className="mx-auto mb-2 flex w-full max-w-4xl items-center gap-2 overflow-x-auto pb-1 text-xs">
        {categories.length > 0 ? categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() =>
              insertChip(
                `${category.name}${category.kind === "expense" ? " - " : " "}`,
              )
            }
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-standard bg-surface-bright px-3 text-secondary transition-colors hover:bg-surface-container-low"
          >
            {category.kind === "expense" ? (
              <Minus className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            )}
            {category.name}
          </button>
        )) : null}
        <button
          type="button"
          onClick={() => insertChip("yesterday")}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border-standard bg-surface-bright px-3 text-secondary transition-colors hover:bg-surface-container-low"
        >
          <CalendarDays
            className="h-3.5 w-3.5 text-text-muted"
            aria-hidden="true"
          />{" "}
          {t("chat.yesterday")}
        </button>
      </div>

      {/* Input Row */}
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mx-auto flex w-full max-w-4xl items-end gap-2"
      >
        <div className="ledger-composer__input relative min-w-0 flex-1 rounded-lg border border-border-standard bg-surface-bright transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            ref={textareaRef}
            id="ledger-entry"
            aria-describedby="ledger-entry-hint"
            aria-keyshortcuts="Enter Shift+Enter"
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={disabled || isSubmitting}
            placeholder={placeholder || t("chat.placeholder")}
            aria-label={t("chat.ledgerEntry")}
            className="max-h-32 min-h-12 w-full resize-none bg-transparent px-3.5 py-3 text-sm text-on-surface placeholder:text-text-muted focus:outline-none sm:text-base"
          />
        </div>

        {/* Send Button (48px Touch Target for Mobile Ergonomics) */}
        <button
          type="submit"
          disabled={!text.trim() || disabled || isSubmitting}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          title={t("chat.sendHotkey")}
          aria-label={t("chat.sendEntry")}
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
      {submitError && (
        <p role="alert" className="mx-auto mt-2 w-full max-w-4xl text-xs text-danger">
          {submitError} Your entry has not been cleared.
        </p>
      )}
      <div
        id="ledger-entry-hint"
        className="mx-auto mt-2 flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-text-muted"
      >
        <span className="hidden sm:inline">{t("chat.enterHint")}</span>
      </div>
    </div>
  );
};
