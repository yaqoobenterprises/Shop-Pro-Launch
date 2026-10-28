import React, { useState } from "react";
import { Select } from "../common/Select";
import { LedgerAccount, Transaction, TransactionDraft } from "../../types/ledger";
import { formatPaisa } from "../../lib/money";
import { formatKarachiTime } from "../../lib/dates";
import { useI18n } from "../../i18n";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
  Scale,
  RotateCcw,
  Check,
} from "lucide-react";
import { TransactionDetailModal } from "../common/TransactionDetailModal";
import { ChatFeedEmptyState } from "./ChatFeedEmptyState";

interface ChatFeedProps {
  transactions: Transaction[];
  drafts: TransactionDraft[];
  accounts: LedgerAccount[];
  canManageTransactions: boolean;
  onEdit: (tx: Transaction) => void;
  onVoid: (tx: Transaction) => void;
  onRestore: (tx: Transaction) => void;
  onAssignDraft: (draft: TransactionDraft, accountId: string) => Promise<void>;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  transactions,
  drafts,
  accounts,
  canManageTransactions,
  onEdit,
  onVoid,
  onRestore,
  onAssignDraft,
}) => {
  const { t } = useI18n();
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [savingDraftIds, setSavingDraftIds] = useState<Set<string>>(new Set());
  const [selectedDetailTx, setSelectedDetailTx] = useState<Transaction | null>(null);

  const assignDraft = async (draft: TransactionDraft) => {
    const accountId = selectedAccounts[draft.id] || draft.pending_account_id || "";
    if (!accountId || savingDraftIds.has(draft.id)) return;
    setSavingDraftIds((current) => new Set(current).add(draft.id));
    try {
      await onAssignDraft(draft, accountId);
    } finally {
      setSavingDraftIds((current) => {
        const next = new Set(current);
        next.delete(draft.id);
        return next;
      });
    }
  };

  if (transactions.length === 0 && drafts.length === 0) {
    return <ChatFeedEmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6">
      <div className="mx-auto w-full max-w-4xl divide-y divide-border-standard">
        {drafts.length > 0 && (
          <section className="space-y-2 py-4" aria-labelledby="drafts-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="drafts-heading" className="text-sm font-semibold text-on-surface">
                  Needs an account
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  These entries are saved, but have not changed any account balance yet.
                </p>
              </div>
              <span className="rounded-full border border-warning-border bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
                {drafts.length} pending
              </span>
            </div>
            <div className="space-y-2">
              {drafts.map((draft, index) => {
                const isExpense = draft.type === "expense" || draft.type === "withdrawal";
                const selectedAccountId = selectedAccounts[draft.id] || draft.pending_account_id || "";
                const isSaving = savingDraftIds.has(draft.id);
                return (
                  <article
                    key={draft.id}
                    className={`ledger-entry-row ${index < 5 ? "ledger-entry-row--enter" : ""} rounded-xl border border-warning-border bg-warning-bg/50 p-3 sm:p-4`}
                    style={index < 5 ? { "--entry-animation-delay": `${index * 36}ms` } as React.CSSProperties : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-warning-border bg-surface-bright px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                            {draft.type.replace("_", " ")}
                          </span>
                          <span className="text-xs text-text-muted">
                            {draft.created_by_name} · {formatKarachiTime(draft.device_entry_time)}
                          </span>
                        </div>
                        <p className="mt-1.5 truncate text-sm font-semibold text-on-surface">
                          {draft.category_name || draft.type.replace("_", " ")}
                        </p>
                        <p className="mt-0.5 break-words text-xs text-secondary">
                          {draft.raw_text}
                        </p>
                        {draft.note && (
                          <p className="mt-1 text-xs text-text-muted">{draft.note}</p>
                        )}
                      </div>
                      <p className={`shrink-0 font-mono text-sm font-bold tabular-nums ${isExpense ? "text-danger" : "text-primary"}`}>
                        {isExpense ? "−" : "+"}{formatPaisa(draft.amount_paisa)}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label={`Account for ${draft.category_name || draft.type} entry`}
                        value={selectedAccountId}
                        onChange={(event) => setSelectedAccounts((current) => ({
                          ...current,
                          [draft.id]: event.target.value,
                        }))}
                        disabled={isSaving || accounts.length === 0}
                        className="min-h-10 min-w-0 flex-1 rounded-lg border border-border-standard bg-surface-bright px-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                      >
                        <option value="">{t("chat.selectAccountToPost")}</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {account.type.replace("_", " ")}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => void assignDraft(draft)}
                        disabled={!selectedAccountId || isSaving}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {isSaving ? "Posting…" : "Post to account"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {transactions.map((tx, index) => {
          const isVoided = tx.status === "voided";
          const isIncome = tx.type === "income";
          const isExpense = tx.type === "expense";
          const isCapital = tx.type === "capital_in";
          const isWithdrawal = tx.type === "withdrawal";
          const categoryName = tx.category_name || tx.type.replace("_", " ");

          const typeTone =
            isIncome ? "text-primary"
            : isExpense ? "text-danger"
            : isWithdrawal ? "text-warning"
            : isCapital ? "text-primary"
            : "text-secondary";

          return (
            <article
              key={tx.id}
              className={`ledger-entry-row ${index < 5 ? "ledger-entry-row--enter" : ""} border-b-0 ${isVoided ? "opacity-60" : ""}`}
              style={index < 5 ? { "--entry-animation-delay": `${index * 36}ms` } as React.CSSProperties : undefined}
            >
              <button
                type="button"
                onClick={() => setSelectedDetailTx(tx)}
                aria-label={`Open receipt for ${categoryName} transaction`}
                title="View transaction receipt"
                className="group flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3.5 text-left transition-colors hover:bg-surface-container-low/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-container-low ${typeTone}`}
                    aria-hidden="true"
                  >
                    {isIncome ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : isExpense ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : isCapital ? (
                      <Landmark className="h-4 w-4" />
                    ) : isWithdrawal ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <Scale className="h-4 w-4" />
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-on-surface">
                      {categoryName}
                    </span>
                    {isVoided && (
                      <span className="shrink-0 rounded-sm bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        Voided
                      </span>
                    )}
                  </span>
                </span>

                <span
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums sm:text-base ${
                    isVoided ? "line-through text-text-muted"
                    : isIncome ? "text-primary"
                    : isExpense ? "text-danger"
                    : "text-on-surface"
                  }`}
                >
                  {isExpense ? "−" : ""}
                  {formatPaisa(tx.amount_paisa)}
                </span>
              </button>
            </article>
          );
        })}
      </div>

      <TransactionDetailModal
        transaction={selectedDetailTx}
        isOpen={Boolean(selectedDetailTx)}
        onClose={() => setSelectedDetailTx(null)}
        canManage={canManageTransactions}
        onEdit={onEdit}
        onVoid={onVoid}
        onRestore={onRestore}
      />
    </div>
  );
};
