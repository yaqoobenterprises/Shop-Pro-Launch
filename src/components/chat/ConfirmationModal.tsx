import React, { useEffect, useRef, useState } from "react";
import { Select } from "../common/Select";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Layers,
  X,
} from "lucide-react";
import { ParseResult, ClarificationOption, SeedCategory } from "../../parser";
import { formatPaisa, parseInputToPaisa } from "../../lib/money";
import { getKarachiBusinessDate, getYesterdayKarachiDate } from "../../lib/dates";
import { LedgerAccount, TransactionType } from "../../types/ledger";
import { useI18n } from "../../i18n";
import { DatePicker } from "../common/DatePicker";

interface EntryDraft {
  entry: ParseResult;
  type: TransactionType;
  categoryId: string;
  amount: string;
  businessDate: string;
  note: string;
  adjustmentDir: "in" | "out" | "";
  accountId: string;
  selectedOption: ClarificationOption | null;
}

interface ConfirmationModalProps {
  result: ParseResult | null;
  batchEntries?: ParseResult[];
  accounts: LedgerAccount[];
  categories: SeedCategory[];
  onConfirmSingle: (entry: ParseResult, accountId: string) => Promise<void>;
  onConfirmBatch: (entries: ParseResult[], accountIds: string[]) => Promise<void>;
  batchError?: string | null;
  isSavingBatch?: boolean;
  onCancel: () => void;
}

const transactionTypes: { value: TransactionType; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "capital_in", label: "Capital In" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "adjustment", label: "Adjustment" },
];

function makeEntryDraft(
  entry: ParseResult,
  accounts: LedgerAccount[],
  categories: SeedCategory[] = [],
): EntryDraft {
  const activeAccounts = accounts.filter((account) => account.is_active !== false);
  const defaultAccount =
    activeAccounts.find((account) => account.is_default) ||
    activeAccounts[0] ||
    accounts[0];

  let resolvedCategoryId = entry.categoryId || "";
  if (categories.length > 0) {
    const existing = categories.find((c) => c.id === resolvedCategoryId);
    if (!existing) {
      const matchByName = categories.find(
        (c) =>
          c.kind === entry.type &&
          (c.name.toLowerCase() === (entry.categoryName || "").toLowerCase() ||
           c.name.toLowerCase().includes((entry.categoryName || "").toLowerCase()) ||
           (entry.categoryName || "").toLowerCase().includes(c.name.toLowerCase()))
      );
      if (matchByName) {
        resolvedCategoryId = matchByName.id;
      } else {
        const firstKind = categories.find((c) => c.kind === entry.type);
        if (firstKind) resolvedCategoryId = firstKind.id;
      }
    }
  }

  return {
    entry,
    type: entry.type,
    categoryId: resolvedCategoryId,
    amount: entry.amountPaisa === null ? "" : String(entry.amountPaisa / 100),
    businessDate: entry.businessDate,
    note: entry.note || "",
    adjustmentDir: "",
    accountId: defaultAccount?.id || "",
    selectedOption: null,
  };
}

function toParseResult(
  draft: EntryDraft,
  categories: SeedCategory[],
): ParseResult | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(draft.amount.trim())) {
    return null;
  }
  const parsedAmount = parseInputToPaisa(draft.amount);
  const amountPaisa = parsedAmount.paisa;
  if (!parsedAmount.isValid || !Number.isSafeInteger(amountPaisa)) {
    return null;
  }
  if (
    (draft.type === "income" || draft.type === "expense") &&
    categories.length > 0 &&
    !draft.categoryId
  ) {
    return null;
  }
  if (draft.type === "adjustment" && (!draft.adjustmentDir || !draft.note.trim())) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.businessDate)) return null;
  const date = new Date(`${draft.businessDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.businessDate) {
    return null;
  }
  if (draft.businessDate > getKarachiBusinessDate()) return null;

  const category = categories.find((item) => item.id === draft.categoryId);
  if (
    (draft.type === "income" || draft.type === "expense") &&
    categories.length > 0 &&
    draft.categoryId &&
    category &&
    category.kind !== draft.type
  ) {
    return null;
  }
  return {
    ...draft.entry,
    type: draft.type,
    categoryId: draft.categoryId || null,
    categoryName: category?.name || draft.type.replace("_", " "),
    amountPaisa,
    businessDate: draft.businessDate,
    note: draft.note.trim() || null,
    adjustmentDir: draft.adjustmentDir || null,
    canAutoSave: false,
    options: draft.entry.options,
  };
}

function updateDraft(
  draft: EntryDraft,
  field: Partial<EntryDraft>,
): EntryDraft {
  return { ...draft, ...field };
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  result,
  batchEntries,
  accounts,
  categories,
  onConfirmSingle,
  onConfirmBatch,
  batchError,
  isSavingBatch = false,
  onCancel,
}) => {
  const { t } = useI18n();
  const isBatch = Boolean(batchEntries?.length);
  const [single, setSingle] = useState<EntryDraft | null>(null);
  const [rows, setRows] = useState<EntryDraft[]>([]);
  const [isSavingSingle, setIsSavingSingle] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const cancelRef = useRef(onCancel);
  const savingRef = useRef(false);
  cancelRef.current = onCancel;
  savingRef.current = isSavingSingle || isSavingBatch;

  useEffect(() => {
    setSingle(result ? makeEntryDraft(result, accounts, categories) : null);
    setValidationError(null);
  }, [result, accounts, categories]);

  useEffect(() => {
    setRows(batchEntries?.map((entry) => makeEntryDraft(entry, accounts, categories)) || []);
    setValidationError(null);
  }, [batchEntries, accounts, categories]);

  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog
      ?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')
      ?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        cancelRef.current();
      }
      if (event.key === "Tab" && dialog) {
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        );
        const first = focusable.item(0);
        const last = focusable.item(focusable.length - 1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, batchEntries]);

  if (!result && !isBatch) return null;

  const renderEditor = (
    draft: EntryDraft,
    onChange: (next: EntryDraft) => void,
    compact = false,
  ) => {
    const needsClassification =
      Boolean(draft.entry.options?.length) && !draft.selectedOption;
    const eligibleCategories = categories.filter(
      (category) => category.kind === draft.type,
    );
    const selectedCategory = categories.find(
      (category) => category.id === draft.categoryId,
    );
    const strictAmount =
      /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(draft.amount.trim());
    const invalidAmount = !strictAmount || !toParseResult(draft, categories);

    return (
      <div className={compact ? "space-y-2" : "space-y-4"}>
        {draft.entry.clarificationPrompt && (
          <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
            {draft.entry.clarificationPrompt}
          </p>
        )}
        {draft.entry.reason && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-border bg-warning-bg p-3 text-xs text-on-surface">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{draft.entry.reason}</span>
          </div>
        )}
        {draft.entry.options && draft.entry.options.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Choose the correct classification
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {draft.entry.options.map((option, index) => (
                <button
                  key={`${option.label}-${index}`}
                  type="button"
                  aria-pressed={draft.selectedOption === option}
                  onClick={() =>
                    onChange(
                      updateDraft(draft, {
                        selectedOption: option,
                        type: option.type,
                        categoryId: option.categoryId || "",
                        amount: String(option.amountPaisa / 100),
                        note: option.note ?? draft.note,
                        businessDate:
                          /yesterday/i.test(option.label)
                            ? getYesterdayKarachiDate()
                            : /today/i.test(option.label)
                              ? getKarachiBusinessDate()
                              : draft.businessDate,
                      }),
                    )
                  }
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                    draft.selectedOption === option
                      ? "border-primary bg-primary/10 font-semibold text-on-surface"
                      : "border-border-standard bg-surface-bright text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {formatPaisa(option.amountPaisa)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="settings-field">
            Transaction type
            <Select
              value={draft.type}
              onChange={(event) =>
                onChange(
                  updateDraft(draft, {
                    type: event.target.value as TransactionType,
                    categoryId: "",
                  }),
                )
              }
              className="workspace-control px-3 text-sm"
            >
              {transactionTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="settings-field">
            Amount
            <input
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) =>
                onChange(updateDraft(draft, { amount: event.target.value }))
              }
              aria-invalid={!draft.amount || invalidAmount}
              className="workspace-control px-3 text-sm tabular-nums"
            />
          </label>
          {(draft.type === "income" || draft.type === "expense") && (
            <label className="settings-field">
              Category
              <Select
                value={draft.categoryId}
                onChange={(event) =>
                  onChange(
                    updateDraft(draft, { categoryId: event.target.value }),
                  )
                }
                className="workspace-control px-3 text-sm"
              >
                <option value="">{t("entry.chooseCategory")}</option>
                {eligibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {!eligibleCategories.length && (
                <span className="text-xs text-danger">
                  Set up an active {draft.type} category before posting.
                </span>
              )}
            </label>
          )}
          <label className="settings-field">
            Business date
            <DatePicker
              value={draft.businessDate}
              ariaLabel="Business date"
              max={getKarachiBusinessDate()}
              onChange={(businessDate) =>
                onChange(updateDraft(draft, { businessDate }))
              }
            />
          </label>
          {draft.type === "adjustment" && (
            <label className="settings-field">
              Adjustment direction
              <Select
                value={draft.adjustmentDir}
                onChange={(event) =>
                  onChange(
                    updateDraft(draft, {
                      adjustmentDir: event.target.value as "in" | "out" | "",
                    }),
                  )
                }
                className="workspace-control px-3 text-sm"
              >
                <option value="">{t("entry.chooseDirection")}</option>
                <option value="in">{t("entry.increaseBalance")}</option>
                <option value="out">{t("entry.decreaseBalance")}</option>
              </Select>
            </label>
          )}
          <label className="settings-field sm:col-span-2">
            Description
            <input
              value={draft.note}
              onChange={(event) =>
                onChange(updateDraft(draft, { note: event.target.value }))
              }
              className="workspace-control px-3 text-sm"
            />
          </label>
          <label className="settings-field sm:col-span-2">
            Payment account
            <Select
              value={draft.accountId}
              onChange={(event) =>
                onChange(updateDraft(draft, { accountId: event.target.value }))
              }
              className="workspace-control px-3 text-sm"
              disabled={!accounts.length}
            >
              <option value="">{t("entry.chooseActiveAccount")}</option>
              {accounts
                .filter((account) => account.is_active)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.type.replace("_", " ")}
                  </option>
                ))}
            </Select>
          </label>
        </div>
        {needsClassification && (
          <p role="alert" className="text-xs font-medium text-danger">
            Select a classification before this entry can be posted.
          </p>
        )}
        {draft.categoryId && selectedCategory && selectedCategory.kind !== draft.type && (
          <p role="alert" className="text-xs font-medium text-danger">
            {t("entry.categoryHint")}
          </p>
        )}
      </div>
    );
  };

  if (!isBatch && result && single) {
    const hasOptions = Boolean(result.options?.length);
    const resolved = toParseResult(single, categories);
    const category = categories.find((item) => item.id === single.categoryId);
    const categoryMatches =
      !category ||
      (single.type !== "income" && single.type !== "expense") ||
      category.kind === single.type;
    const effectiveAccountId =
      single.accountId ||
      accounts.find((a) => a.is_default && a.is_active)?.id ||
      accounts.find((a) => a.is_active)?.id ||
      accounts[0]?.id ||
      "";
    const canSubmit =
      Boolean(resolved) &&
      /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(single.amount.trim()) &&
      Boolean(effectiveAccountId && accounts.some(
        (account) => account.id === effectiveAccountId && account.is_active,
      )) &&
      (!hasOptions || Boolean(single.selectedOption)) &&
      categoryMatches &&
      Boolean(single.businessDate) &&
      (!single.entry.reason || single.selectedOption || !hasOptions);

    const submitSingle = async () => {
      if (!resolved || !canSubmit || isSavingSingle) return;
      setIsSavingSingle(true);
      setValidationError(null);
      try {
        await onConfirmSingle(resolved, effectiveAccountId);
      } catch (error) {
        setValidationError(
          error instanceof Error ? error.message : "Entry could not be posted.",
        );
      } finally {
        setIsSavingSingle(false);
      }
    };

    const heading =
      result.isConflict ? "Review sign and category"
      : result.isUnusualAmount ? "Review unusual amount"
      : result.isDuplicate ? "Check possible duplicate"
      : result.isFuzzyOrPhonetic ? "Confirm suggested category"
      : hasOptions ? "Clarify transaction"
      : "Review transaction";
    const Icon =
      result.isConflict ? AlertCircle
      : result.isUnusualAmount || result.isDuplicate ? AlertTriangle
      : hasOptions ? HelpCircle
      : CheckCircle;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSavingSingle) onCancel();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="transaction-entry-title"
          className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-standard bg-surface-bright shadow-level-3"
        >
          <header className="flex items-center justify-between border-b border-border-standard bg-surface-container-low px-5 py-4">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="transaction-entry-title" className="text-base font-bold text-on-surface">
                {heading}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close transaction review"
              disabled={isSavingSingle}
              onClick={onCancel}
              className="rounded-lg p-2 text-text-muted hover:bg-surface-container-high"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
            <div className="rounded-xl border border-border-standard bg-surface-container-low p-3">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Original entry
              </span>
              <p className="break-words font-mono text-sm font-semibold text-on-surface">
                {result.raw}
              </p>
            </div>
            {renderEditor(single, setSingle)}
            {!accounts.some((account) => account.is_active) && (
              <p role="alert" className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-on-surface">
                No active shop accounts are available. Connect to the shop or ask an administrator to set up an account before posting.
              </p>
            )}
            {validationError && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-on-surface">
                {validationError}
              </p>
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border-standard bg-surface-container-low px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSavingSingle}
                onClick={onCancel}
                className="min-h-10 rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-container-high"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitSingle()}
                disabled={!canSubmit || isSavingSingle}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                {isSavingSingle ? "Posting…" : "Confirm & post"}
              </button>
            </div>
          </footer>
        </section>
      </div>
    );
  }

  if (isBatch && batchEntries) {
    const hasInvalidRows = rows.length !== batchEntries.length || rows.some((row) => {
      const parsed = toParseResult(row, categories);
      const category = categories.find((item) => item.id === row.categoryId);
      return (
        !parsed ||
        !row.accountId ||
        !accounts.some((account) => account.id === row.accountId && account.is_active) ||
        (Boolean(row.entry.options?.length) && !row.selectedOption) ||
        (category && (row.type === "income" || row.type === "expense") && category.kind !== row.type)
      );
    });

    const submitBatch = async () => {
      if (hasInvalidRows || isSavingBatch) return;
      const entries = rows.map((row) => toParseResult(row, categories));
      const validEntries = entries.filter(
        (entry): entry is ParseResult => entry !== null,
      );
      if (validEntries.length !== entries.length) return;
      setValidationError(null);
      try {
        await onConfirmBatch(
          validEntries,
          rows.map((row) => row.accountId),
        );
      } catch (error) {
        setValidationError(
          error instanceof Error ? error.message : "Some entries could not be posted.",
        );
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-5">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-entry-title"
          className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border-standard bg-surface-bright shadow-level-3"
        >
          <header className="flex items-center justify-between border-b border-border-standard bg-surface-container-low px-5 py-4">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="batch-entry-title" className="text-base font-bold text-on-surface">
                Review {batchEntries.length} entries together
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close batch review"
              disabled={isSavingBatch}
              onClick={onCancel}
              className="rounded-lg p-2 text-text-muted hover:bg-surface-container-high"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
            {batchError && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-on-surface">
                {batchError}
              </p>
            )}
            {validationError && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-on-surface">
                {validationError}
              </p>
            )}
            {rows.map((row, index) => (
              <article
                key={`${row.entry.raw}-${index}`}
                className="space-y-3 rounded-xl border border-border-standard bg-surface p-3 sm:p-4"
              >
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Entry {index + 1}
                  </span>
                  <p className="mt-1 break-words font-mono text-sm font-semibold text-on-surface">
                    {row.entry.raw}
                  </p>
                </div>
                {renderEditor(row, (updated) =>
                  setRows((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? updated : item,
                    ),
                  ),
                  true,
                )}
              </article>
            ))}
            {!accounts.some((account) => account.is_active) && (
              <p role="alert" className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-on-surface">
                No active shop accounts are available to post these entries.
              </p>
            )}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border-standard bg-surface-container-low px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={isSavingBatch}
              onClick={onCancel}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-container-high"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitBatch()}
              disabled={hasInvalidRows || isSavingBatch}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              {isSavingBatch
                ? "Posting…"
                : hasInvalidRows
                  ? "Complete required fields"
                  : "Confirm & post all"}
            </button>
          </footer>
        </section>
      </div>
    );
  }

  return null;
};
