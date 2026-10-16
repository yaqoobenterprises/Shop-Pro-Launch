import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { ParseResult, SeedCategory, parseMessage } from "../../parser";
import { getKarachiBusinessDate } from "../../lib/dates";
import { parseLocalizedMoneyInput } from "../../regional/format";
import { useI18n } from "../../i18n";

interface StandardEntryFormProps {
  categories: SeedCategory[];
  onReview: (entry: ParseResult) => void;
  onAddCategory: () => void;
  focusRequestId?: number;
}

export const StandardEntryForm: React.FC<StandardEntryFormProps> = ({
  categories,
  onReview,
  onAddCategory,
  focusRequestId = 0,
}) => {
  const { t } = useI18n();
  const [type, setType] = useState<"income" | "expense">("income");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequestId > 0) amountInputRef.current?.focus();
  }, [focusRequestId]);

  const availableCategories = useMemo(
    () => categories.filter((category) => category.kind === type),
    [categories, type],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = parseLocalizedMoneyInput(amount);
    const category = availableCategories.find((item) => item.id === categoryId);
    if (!parsedAmount.isValid || !category) {
      setError(!parsedAmount.isValid ? t("entry.amountRequired") : t("entry.chooseCategory"));
      return;
    }

    setError(null);
    const parsed = parseMessage(
      `${type === "expense" ? "-" : ""}${category.name} ${(parsedAmount.minor / 100).toFixed(2)}`,
      [],
      new Date(),
      categories,
    ).entries[0];
    if (!parsed || parsed.type !== type || parsed.categoryId !== category.id) {
      setError(t("entry.chooseCategory"));
      return;
    }
    const entry: ParseResult = {
      ...parsed,
      amountPaisa: parsedAmount.minor,
      businessDate: getKarachiBusinessDate(),
      note: note.trim() || parsed.note,
    };
    onReview(entry);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto my-4 grid w-full max-w-3xl gap-4 rounded-xl border border-border-standard bg-surface-bright p-4 sm:grid-cols-2 sm:p-5"
      aria-label={t("entry.standard")}
    >
      <div>
        <label htmlFor="standard-entry-type" className="mb-1 block text-xs font-semibold text-secondary">
          {t("entry.type")}
        </label>
        <select
          id="standard-entry-type"
          value={type}
          onChange={(event) => {
            const nextType = event.target.value;
            if (nextType !== "income" && nextType !== "expense") return;
            setType(nextType);
            setCategoryId("");
          }}
          className="workspace-control min-h-10 w-full px-3 py-2 text-sm"
        >
          <option value="income">{t("entry.income")}</option>
          <option value="expense">{t("entry.expense")}</option>
        </select>
      </div>

      <div>
        <label htmlFor="standard-entry-category" className="mb-1 block text-xs font-semibold text-secondary">
          {t("entry.category")}
        </label>
        <select
          id="standard-entry-category"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="workspace-control min-h-10 w-full px-3 py-2 text-sm"
        >
          <option value="">{t("entry.chooseCategory")}</option>
          {availableCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        {availableCategories.length === 0 && (
          <button type="button" onClick={onAddCategory} className="mt-1 text-xs font-semibold text-primary underline">
            {t("entry.addCategory")}
          </button>
        )}
      </div>

      <div>
        <label htmlFor="standard-entry-amount" className="mb-1 block text-xs font-semibold text-secondary">
          {t("entry.amount")}
        </label>
        <input
          ref={amountInputRef}
          id="standard-entry-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="workspace-control min-h-10 w-full px-3 py-2 text-sm"
          dir="ltr"
        />
      </div>

      <div>
        <label htmlFor="standard-entry-note" className="mb-1 block text-xs font-semibold text-secondary">
          {t("entry.note")}
        </label>
        <input
          id="standard-entry-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="workspace-control min-h-10 w-full px-3 py-2 text-sm"
        />
      </div>

      {error && <p role="alert" className="text-xs text-danger sm:col-span-2">{error}</p>}
      <button
        type="submit"
        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primary-hover sm:col-span-2"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {t("entry.review")}
      </button>
    </form>
  );
};
