import React, { useState } from "react";
import { Modal } from "./Modal";
import { Transaction } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { formatBusinessDateTime } from "../../regional/format";
import { getCurrencyConfig } from "../../regional/currencies";
import { useRegion } from "../../regional/region";
import { useI18n } from "../../i18n";
import { TransactionPrintReceipt } from "./TransactionPrintReceipt";
import { TransactionReceiptDetails } from "./TransactionReceiptDetails";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
  Scale,
  Copy,
  Check,
  ShieldCheck,
  Ban,
  Edit2,
  Trash2,
  Printer,
  RotateCcw,
} from "lucide-react";

export interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  canManage?: boolean;
  onEdit?: (tx: Transaction) => void;
  onVoid?: (tx: Transaction) => void;
  onRestore?: (tx: Transaction) => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  isOpen,
  onClose,
  canManage = false,
  onEdit,
  onVoid,
  onRestore,
}) => {
  const { region } = useRegion();
  const { t } = useI18n();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!transaction) return null;

  const isVoided = transaction.status === "voided";
  const isIncome = transaction.type === "income";
  const isExpense = transaction.type === "expense";
  const isCapital = transaction.type === "capital_in";
  const isWithdrawal = transaction.type === "withdrawal";

  const handleCopy = (field: string, text: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const typeLabel =
    isIncome ? "Income"
    : isExpense ? "Expense"
    : isCapital ? "Capital In"
    : isWithdrawal ? "Withdrawal"
    : "Adjustment";
  const receiptDescription = transaction.raw_text || transaction.category_name || typeLabel;
  const handlePrint = () => window.print();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction Receipt"
      description={`ID: ${transaction.id.slice(0, 8)}...`}
      maxWidth="lg"
    >
      <div className="space-y-5">
        <TransactionPrintReceipt
          transaction={transaction}
          typeLabel={typeLabel}
          isExpense={isExpense}
          isVoided={isVoided}
          receiptDescription={receiptDescription}
        />

        {/* Header Hero Card */}
        <div
          className={`flex items-center justify-between rounded-xl border p-4 ${
            isVoided
              ? "border-border-standard bg-surface-container-low/70 opacity-80"
              : isIncome
              ? "border-success-border bg-success-bg/40"
              : isExpense
              ? "border-danger-border bg-danger-bg/40"
              : "border-primary/20 bg-primary/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                isVoided
                  ? "bg-surface-container-high text-text-muted"
                  : isIncome
                  ? "bg-success-bg text-success"
                  : isExpense
                  ? "bg-danger-bg text-danger"
                  : "bg-surface-container-low text-primary"
              }`}
            >
              {isIncome ? (
                <ArrowDownLeft className="h-5 w-5" />
              ) : isExpense ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : isCapital ? (
                <Landmark className="h-5 w-5" />
              ) : isWithdrawal ? (
                <Wallet className="h-5 w-5" />
              ) : (
                <Scale className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface">
                  {transaction.category_name || typeLabel}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    isVoided
                      ? "bg-danger-bg text-danger border border-danger-border"
                      : "bg-success-bg text-success border border-success-border"
                  }`}
                >
                  {isVoided ? "Voided" : "Active"}
                </span>
              </div>
              <p className="text-xs text-text-muted">{typeLabel}</p>
            </div>
          </div>

          <div className="text-right">
            <p
              className={`font-mono text-xl font-bold tabular-nums ${
                isVoided
                  ? "line-through text-text-muted"
                  : isIncome
                  ? "text-success"
                  : isExpense
                  ? "text-danger"
                  : "text-on-surface"
              }`}
            >
              {isExpense ? "−" : ""}
              {formatPaisa(transaction.amount_paisa)}
            </p>
            <p className="text-[10px] text-text-muted">{getCurrencyConfig(region.currency)?.name || region.currency}</p>
          </div>
        </div>

        {/* Void Alert Banner */}
        {isVoided && (
          <div className="rounded-xl border border-danger-border bg-danger-bg p-3.5 text-xs text-danger">
            <div className="flex items-start gap-2.5">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="space-y-1">
                <p className="font-semibold">{t("transaction.voided")}</p>
                <p className="text-danger/90">
                  <span className="font-medium">{t("transaction.reason")} </span>
                  {transaction.void_reason || "No reason specified"}
                </p>
                {transaction.voided_at && (
                  <p className="text-[11px] text-danger/80">
                    Voided at: {formatBusinessDateTime(transaction.voided_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <TransactionReceiptDetails transaction={transaction} />

        {/* Audit & System Metadata */}
        <div className="rounded-xl border border-border-standard bg-surface-container-low/20 p-4 text-xs space-y-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-secondary text-[11px] uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Audit & System Metadata
          </div>

          <div className="flex items-center justify-between py-1 border-b border-border-standard/50">
            <span className="text-text-muted">{t("transaction.id")}</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-on-surface">{transaction.id}</span>
              <button
                onClick={() => handleCopy("id", transaction.id)}
                className="p-1 text-text-muted hover:text-on-surface rounded hover:bg-surface-container-high transition-colors"
                title="Copy Transaction ID"
              >
                {copiedField === "id" ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          {transaction.idempotency_key && (
            <div className="flex items-center justify-between py-1 border-b border-border-standard/50">
              <span className="text-text-muted">{t("transaction.idempotency")}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-on-surface truncate max-w-[200px]">
                  {transaction.idempotency_key}
                </span>
                <button
                  onClick={() => handleCopy("key", transaction.idempotency_key)}
                  className="p-1 text-text-muted hover:text-on-surface rounded hover:bg-surface-container-high transition-colors"
                  title="Copy Idempotency Key"
                >
                  {copiedField === "key" ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}

          {transaction.created_at && (
            <div className="flex items-center justify-between py-1 border-b border-border-standard/50">
              <span className="text-text-muted">{t("transaction.createdAt")}</span>
              <span className="font-mono text-[11px] text-on-surface">
                {formatBusinessDateTime(transaction.created_at)}
              </span>
            </div>
          )}

          {transaction.updated_at && (
            <div className="flex items-center justify-between py-1">
              <span className="text-text-muted">{t("transaction.updatedAt")}</span>
              <span className="font-mono text-[11px] text-on-surface">
                {formatBusinessDateTime(transaction.updated_at)}
              </span>
            </div>
          )}
        </div>

        {/* Receipt actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-standard pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-secondary transition-colors hover:bg-surface-container-low"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Print
            </button>

            {canManage && !isVoided && onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(transaction);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-secondary transition-colors hover:bg-surface-container-low"
              >
                <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </button>
            )}

            {canManage && !isVoided && onVoid && (
              <button
                type="button"
                title="Remove this entry from active cashbook (audit history is retained)"
                onClick={() => {
                  onClose();
                  onVoid(transaction);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-danger-border bg-danger-bg px-3 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg/80"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            )}

            {canManage && isVoided && onRestore && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRestore(transaction);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-standard bg-surface-bright px-3 text-xs font-semibold text-primary transition-colors hover:bg-surface-container-low"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Restore
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-lg bg-on-surface px-4 text-xs font-semibold text-surface-bright transition-colors hover:bg-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
