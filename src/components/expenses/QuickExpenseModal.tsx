import React, { useState, useEffect } from "react";
import { Select } from "../common/Select";
import { Modal } from "../common/Modal";
import { Input } from "../common/Input";
import { DatePicker } from "../common/DatePicker";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { Button } from "../common/Button";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { expenseRepo, accountRepo } from "../../services";
import { ExpenseCategory, PaymentAccount } from "../../types";
import { formatCurrency } from "../../lib/utils";
import { getKarachiBusinessDate } from "../../lib/dates";
import { useI18n } from "../../i18n";
import { Check, AlertCircle } from "lucide-react";

export const QuickExpenseModal: React.FC = () => {
  const { t } = useI18n();
  const { organization, user } = useAuth();
  const { isQuickExpenseOpen, setIsQuickExpenseOpen, refreshData, showToast } =
    useApp();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);

  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [date, setDate] = useState(getKarachiBusinessDate());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isQuickExpenseOpen) {
      let isCurrent = true;
      async function loadMeta() {
        setIsLoadingMetadata(true);
        setMetadataError("");
        try {
          const [cats, accs] = await Promise.all([
            expenseRepo.getCategories(organization.id),
            accountRepo.getAccounts(organization.id),
          ]);
          if (!isCurrent) return;
          setCategories(cats);
          setAccounts(accs);
          setCategoryId((current) =>
            cats.some((category) => category.id === current)
              ? current
              : cats[0]?.id || "",
          );
          setAccountId((current) =>
            accs.some((account) => account.id === current)
              ? current
              : (accs.find((account) => account.is_default) || accs[0])?.id || "",
          );
        } catch (error) {
          console.error("Could not load expense categories and accounts:", error);
          if (isCurrent) {
            setMetadataError(
              "Expense categories and accounts could not be loaded. Close this form and try again.",
            );
          }
        } finally {
          if (isCurrent) setIsLoadingMetadata(false);
        }
      }
      void loadMeta();
      setAmount("");
      setDescription("");
      setReferenceNumber("");
      setNotes("");
      setDate(getKarachiBusinessDate());
      return () => {
        isCurrent = false;
      };
    }
  }, [isQuickExpenseOpen, organization.id]);

  if (!isQuickExpenseOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      showToast(
        "error",
        "Invalid Amount",
        "Please enter a positive expense amount.",
      );
      return;
    }
    if (!description.trim()) {
      showToast(
        "error",
        "Description Required",
        "Please explain what this expense was for.",
      );
      return;
    }
    let targetCategoryId = categoryId;
    if (!targetCategoryId && categories.length > 0) {
      targetCategoryId = categories[0].id;
    }
    let targetAccountId = accountId;
    if (!targetAccountId && accounts.length > 0) {
      targetAccountId = (accounts.find((a) => a.is_default) || accounts[0]).id;
    }

    if (!targetCategoryId || !targetAccountId) {
      showToast(
        "error",
        "Missing Selection",
        "Please select both a category and payment account.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const exp = await expenseRepo.createExpense(organization.id, {
        category_id: targetCategoryId,
        account_id: targetAccountId,
        amount: numAmount,
        description: description.trim(),
        reference_number: referenceNumber.trim() || undefined,
        date,
        notes: notes.trim() || undefined,
        entered_by: getProfileDisplayName(user),
      });

      showToast(
        "success",
        "Expense Recorded",
        `${formatCurrency(exp.amount, organization.currency_symbol)} paid from ${exp.account_name}`,
      );
      setIsQuickExpenseOpen(false);
      refreshData();
    } catch (err: any) {
      showToast(
        "error",
        "Expense Failed",
        err.message || "Could not record expense",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <Modal
      isOpen={isQuickExpenseOpen}
      onClose={() => setIsQuickExpenseOpen(false)}
      title="Log Business Expense"
      description="Record a business expense and its payment source."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
      {metadataError && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger">
          {metadataError}
        </p>
      )}
      {!isLoadingMetadata && !metadataError && categories.length === 0 && (
        <p role="status" className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning">
          No expense categories are configured for this shop yet.
        </p>
      )}
      {!isLoadingMetadata && !metadataError && accounts.length === 0 && (
        <p role="status" className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning">
          Add an active payment account before recording an expense.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className="block space-y-1 text-xs font-semibold text-secondary">
          <span>{t("expenses.category")}</span>
          <Select
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={isLoadingMetadata || categories.length === 0}
            className="workspace-control h-10 w-full px-3 text-sm font-normal text-on-surface focus:border-primary focus:outline-none disabled:opacity-60"
          >
            <option value="">
              {isLoadingMetadata ? "Loading categories…" : "Select category"}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1 text-xs font-semibold text-secondary">
          <span>{t("expenses.paidFrom")}</span>
          <Select
            required
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            disabled={isLoadingMetadata || accounts.length === 0}
            className="workspace-control h-10 w-full px-3 text-sm font-normal text-on-surface focus:border-primary focus:outline-none disabled:opacity-60"
          >
            <option value="">
              {isLoadingMetadata ? "Loading accounts…" : "Select account"}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
        {/* Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <Input
              label={`Amount (${organization.currency_symbol})`}
              type="number"
              step="any"
              required
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono text-base font-bold text-danger"
            />
          </div>

          <div>
            <label className="block w-full space-y-1.5 text-left">
              <span className="block text-xs font-semibold text-on-surface">Expense Date</span>
              <DatePicker
                value={date}
                onChange={setDate}
                ariaLabel="Expense date"
                required
              />
            </label>
          </div>
        </div>
        {/* Description */}
        <Input
          label="Description / Purpose"
          required
          placeholder="e.g. Restocking, transport, maintenance"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <details className="rounded-lg border border-border-standard px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-secondary">
            Add receipt reference or notes
          </summary>
          <div className="mt-3 space-y-3">
          <Input
            label="Bill / Receipt Ref # (Optional)"
            placeholder="e.g. INV-12345"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
          />

          <Input
            label="Additional Notes / Payee (Optional)"
            placeholder="e.g. Supplier or payee"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          </div>
        </details>
        {/* Impact Notice */}
        <div className="flex items-start gap-2 rounded-lg border border-border-standard bg-surface p-3 text-xs text-text-muted">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Recording this expense will immediately deduct from{" "}
            <strong className="text-on-surface">
              {selectedAccount ? selectedAccount.name : "the selected account"}
            </strong>{" "}
            and update the shop&rsquo;s financial records.
          </span>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-standard pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsQuickExpenseOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            disabled={
              isLoadingMetadata ||
              Boolean(metadataError) ||
              categories.length === 0 ||
              accounts.length === 0
            }
          >
            <Check className="h-4 w-4" />
            <span>{t("expenses.save")}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
