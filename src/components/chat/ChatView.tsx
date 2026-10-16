import React, { useState, useEffect, useCallback, useRef } from "react";
import { TodayStrip } from "./TodayStrip";
import { ChatFeed } from "./ChatFeed";
import { ChatComposer } from "./ChatComposer";
import { ConfirmationModal } from "./ConfirmationModal";
import { UndoToast } from "./UndoToast";
import { VoidModal } from "./VoidModal";
import { EditModal } from "./EditModal";
import { StandardEntryForm } from "./StandardEntryForm";
import { InstallHelpModal } from "./InstallHelpModal";
import { useEntryInputMode } from "./useEntryInputMode";
import {
  ledgerService,
  OFFLINE_SYNC_COMPLETE_EVENT,
} from "../../services/ledgerService";
import { parseMessage, ParseResult, SeedCategory } from "../../parser";
import {
  LedgerAccount,
  Transaction,
  TransactionDraft,
  DailySummary,
} from "../../types/ledger";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { getKarachiBusinessDate } from "../../lib/dates";
import { hasPermission } from "../../lib/permissions";
import { useI18n } from "../../i18n";

interface UndoState {
  transactionId: string;
  categoryName: string;
  amountPaisa: number;
  updatedAt: string;
}

export const ChatView: React.FC = () => {
  const { user } = useAuth();
  const { showToast, setCurrentView, entryMode, newEntryRequestId } = useApp();
  const { t } = useI18n();
  const currentUserId = user?.id || "offline-user";
  const currentUserName =
    user?.full_name && !user.full_name.includes("@")
      ? user.full_name
      : user?.full_name?.split("@")[0]?.replace(/[._+-]/g, " ") || "Shop Brother";
  const canManageTransactions = hasPermission(user?.role, "VOID_EXPENSE");

  // State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [parserCategories, setParserCategories] = useState<SeedCategory[]>([]);
  const [suggestedCategories, setSuggestedCategories] = useState<SeedCategory[]>([]);
  const [summary, setSummary] = useState<DailySummary>({
    business_date: getKarachiBusinessDate(),
    income_paisa: 0,
    expense_paisa: 0,
    net_profit_paisa: 0,
    capital_in_paisa: 0,
    withdrawal_paisa: 0,
    adjustment_in_paisa: 0,
    adjustment_out_paisa: 0,
    transaction_count: 0,
  });

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [queuedCount, setQueuedCount] = useState(0);
  const [dayLoadError, setDayLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  // Modals & Popups
  const [activeClarification, setActiveClarification] =
    useState<ParseResult | null>(null);
  const [batchEntries, setBatchEntries] = useState<ParseResult[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [voidingTransaction, setVoidingTransaction] =
    useState<Transaction | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const { activeEntryInput, setActiveEntryInput } = useEntryInputMode(
    entryMode,
    newEntryRequestId,
  );

  // Load data
  const loadDayData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    try {
      const todayStr = getKarachiBusinessDate();
      const [txs, sum, pendingDrafts, categories] = await Promise.all([
        ledgerService.getTransactionsForDate(todayStr),
        ledgerService.getDailySummary(todayStr),
        ledgerService.getTransactionDrafts(todayStr),
        ledgerService.getParserCategories(),
      ]);
      const availableAccounts = await ledgerService.getPaymentAccounts();
      if (requestId !== loadRequestId.current) return;
      const categorySuggestions =
        await ledgerService.getSuggestedParserCategories(categories);
      if (requestId !== loadRequestId.current) return;
      setTransactions(txs);
      setDrafts(pendingDrafts);
      setAccounts(availableAccounts);
      setParserCategories(categories);
      setSuggestedCategories(categorySuggestions);
      setSummary(sum);

      const currentQueuedCount = await ledgerService.getPendingTransactionCount();
      if (requestId !== loadRequestId.current) return;
      setQueuedCount(currentQueuedCount);
      setDayLoadError(null);
    } catch (err) {
      console.error("Error loading ledger data:", err);
      if (requestId === loadRequestId.current) {
        setDayLoadError(
          err instanceof Error
            ? err.message
            : "Today’s ledger could not be refreshed. Retry before relying on these totals.",
        );
      }
    }
  }, []);

  // Sync / Online listener + Refetch on foreground
  useEffect(() => {
    loadDayData();

    const handleOnline = async () => {
      setIsOnline(true);
      loadDayData();
    };

    const handleOfflineSyncComplete = () => {
      loadDayData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadDayData();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handleOfflineSyncComplete);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Supabase Realtime Subscription across all 3 brothers
    const unsubscribe = ledgerService.subscribeToLiveTransactions(() => {
      loadDayData();
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handleOfflineSyncComplete);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribe();
    };
  }, [loadDayData]);

  // Execute Save Transaction
  const executeSave = async (
    entry: ParseResult,
    accountId: string,
  ): Promise<boolean> => {
    try {
      if (entry.amountPaisa === null) {
        throw new Error("Enter and verify a transaction amount.");
      }
      let targetAccountId = accountId;
      if (!targetAccountId) {
        const defaultAcc =
          accounts.find((a) => a.is_default && a.is_active) ||
          accounts.find((a) => a.is_active) ||
          accounts[0];
        if (defaultAcc) targetAccountId = defaultAcc.id;
      }
      if (!targetAccountId) {
        const freshAccounts = await ledgerService.getPaymentAccounts();
        const defaultAcc =
          freshAccounts.find((a) => a.is_default && a.is_active) ||
          freshAccounts.find((a) => a.is_active) ||
          freshAccounts[0];
        if (defaultAcc) targetAccountId = defaultAcc.id;
      }
      if (!targetAccountId) throw new Error("Choose an account before posting.");

      let resolvedCategoryId = entry.categoryId;
      if (parserCategories.length > 0) {
        const matchingCat = parserCategories.find(
          (c) =>
            c.id === resolvedCategoryId ||
            (c.kind === entry.type &&
              (c.name.toLowerCase() === (entry.categoryName || "").toLowerCase() ||
               c.name.toLowerCase().includes((entry.categoryName || "").toLowerCase()) ||
               (entry.categoryName || "").toLowerCase().includes(c.name.toLowerCase())))
        );
        if (matchingCat) {
          resolvedCategoryId = matchingCat.id;
        }
      }

      const draft = await ledgerService.createTransactionDraft(
        {
          type: entry.type,
          categoryId: resolvedCategoryId,
          categoryName: entry.categoryName || entry.type,
          amountPaisa: entry.amountPaisa,
          adjustmentDir: entry.adjustmentDir,
          businessDate: entry.businessDate,
          rawText: entry.raw,
          createdByName: currentUserName,
          note: entry.note,
        },
        currentUserId,
      );
      const posting = await ledgerService.postTransactionDraft(draft.id, targetAccountId);
      await loadDayData();
      if (
        canManageTransactions &&
        !posting.isQueuedOffline &&
        posting.transaction?.updated_at
      ) {
        setUndoState({
          transactionId: posting.transaction.id,
          categoryName: entry.categoryName || entry.type,
          amountPaisa: entry.amountPaisa,
          updatedAt: posting.transaction.updated_at,
        });
      }
      if (entry.isFuzzyOrPhonetic && entry.categoryId && entry.suggestedAlias) {
        try {
          await ledgerService.learnAlias(entry.categoryId, entry.suggestedAlias);
        } catch (error) {
          console.error("Could not save confirmed category alias:", error);
        }
      }
      showToast(
        posting.isQueuedOffline ? "warning" : "success",
        posting.isQueuedOffline ? "Posting queued offline" : "Transaction posted",
        posting.isQueuedOffline
          ? "The saved entry is waiting for a connection. It will be posted to the selected account when synchronization succeeds."
          : `${entry.categoryName || entry.type} was posted to ${accounts.find((account) => account.id === accountId)?.name || "the selected account"}.`,
      );
      return true;
    } catch (err) {
      console.error("Failed to record transaction:", err);
      showToast(
        "error",
        "Transaction not posted",
        err instanceof Error ? err.message : "Please check the entry and try again.",
      );
      return false;
    }
  };

  // Handler for text sent from ChatComposer
  const handleSendMessage = async (rawInput: string) => {
    // Recent transactions for duplicate checking (< 3 min)
    const recent = transactions.map((t) => ({
      categoryId: t.category_id,
      amountPaisa: t.amount_paisa,
      entryTimeUtc: t.device_entry_time,
      type: t.type,
    }));

    const categories = await ledgerService.getParserCategories();
    setParserCategories(categories);
    setSuggestedCategories(
      await ledgerService.getSuggestedParserCategories(categories),
    );
    const parsed = parseMessage(rawInput, recent, new Date(), categories);

    if (parsed.isBatch) {
      setBatchError(null);
      setBatchEntries(parsed.entries);
      return;
    }

    if (parsed.entries.length === 1) {
      setActiveClarification(parsed.entries[0]);
    }
  };

  // Confirmation modal callbacks
  const handleConfirmSingle = (
    entry: ParseResult,
    accountId: string,
  ): Promise<void> => {
    return executeSave(entry, accountId).then((saved) => {
      if (!saved) throw new Error("The transaction was not posted. Review the error and try again.");
      setActiveClarification(null);
    });
  };

  const handleConfirmBatch = async (entries: ParseResult[], accountIds: string[]) => {
    setBatchError(null);
    setIsSavingBatch(true);
    const failedEntries: ParseResult[] = [];

    try {
      for (const [index, entry] of entries.entries()) {
        if (!(await executeSave(entry, accountIds[index]))) failedEntries.push(entry);
      }
    } finally {
      setIsSavingBatch(false);
    }

    if (failedEntries.length > 0) {
      const savedCount = entries.length - failedEntries.length;
      setBatchEntries(failedEntries);
      setBatchError(
        `${savedCount} saved; ${failedEntries.length} failed. Only failed entries are shown for retry.`,
      );
    } else {
      setBatchEntries(null);
    }
  };

  const handleAssignDraft = async (draft: TransactionDraft, accountId: string) => {
    try {
      const result = await ledgerService.postTransactionDraft(draft.id, accountId);
      await loadDayData();
      showToast(
        "success",
        result.isQueuedOffline ? "Posting queued" : "Balance updated",
        result.isQueuedOffline
          ? "This entry will post to the selected account when you reconnect."
          : `${draft.category_name || draft.type} was posted to the selected account.`,
      );
    } catch (error) {
      console.error("Could not post transaction draft:", error);
      showToast("error", "Could not update balance", "Check the account and try again.");
    }
  };

  // Undo Action
  const handleUndo = async (transactionId: string) => {
    if (!undoState) return;
    try {
      await ledgerService.voidTransaction(
        transactionId,
        "6-second immediate undo",
        undoState.updatedAt,
      );
      setUndoState(null);
      await loadDayData();
    } catch (err) {
      console.error("Failed to undo transaction:", err);
      showToast(
        "error",
        "Could not undo transaction",
        err instanceof Error ? err.message : "Refresh the ledger and try again.",
      );
    }
  };

  // Void Action
  const handleConfirmVoid = async (
    id: string,
    reason: string,
    currentUpdatedAt: string,
  ) => {
    await ledgerService.voidTransaction(id, reason, currentUpdatedAt);
    await loadDayData();
  };

  // Restore Action
  const handleRestore = async (tx: Transaction) => {
    try {
      await ledgerService.restoreTransaction(tx.id, tx.updated_at);
      await loadDayData();
      showToast("success", "Transaction restored", "The account balance has been updated.");
    } catch (err) {
      console.error("Failed to restore transaction:", err);
      showToast(
        "error",
        "Transaction not restored",
        err instanceof Error ? err.message : "Reconnect and try again.",
      );
    }
  };

  // Edit Action
  const handleConfirmEdit = async (
    id: string,
    updates: { amount_paisa?: number; note?: string | null },
    currentUpdatedAt: string,
  ) => {
    await ledgerService.editTransaction(id, updates, currentUpdatedAt);
    await loadDayData();
  };

  return (
    <div className="ledger-page relative flex h-full flex-col overflow-hidden bg-surface">
      {/* 1. Today Strip with Income, Expense, Net */}
      <TodayStrip
        summary={summary}
        isOnline={isOnline}
        queuedCount={queuedCount}
        onOpenInstallHelp={() => setShowInstallHelp(true)}
      />

      {dayLoadError && (
        <div
          role="alert"
          className="mx-3 flex items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger sm:mx-5"
        >
          <span>
            Ledger data could not be refreshed. Entries and totals may be incomplete. {dayLoadError}
          </span>
          <button
            type="button"
            onClick={() => void loadDayData()}
            className="min-h-9 shrink-0 rounded-md border border-danger-border bg-surface-bright px-3 font-semibold text-danger hover:bg-danger-bg"
          >
            Retry
          </button>
        </div>
      )}

      {accounts.length === 0 && !dayLoadError && (
        <div
          role="status"
          className="mx-3 my-2 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-on-surface sm:mx-5"
        >
          <span>
            Set up your shop's cash drawer or bank account to begin posting transactions directly to accounts.
          </span>
          <button
            type="button"
            onClick={() => setCurrentView("settings")}
            className="min-h-8 shrink-0 rounded-md border border-primary/30 bg-surface-bright px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            Configure Accounts
          </button>
        </div>
      )}

      {/* 2. Chat Feed (Bubbles) */}
      <ChatFeed
        transactions={transactions}
        drafts={drafts}
        accounts={accounts}
        canManageTransactions={canManageTransactions}
        onEdit={(tx) => setEditingTransaction(tx)}
        onVoid={(tx) => setVoidingTransaction(tx)}
        onRestore={handleRestore}
        onAssignDraft={handleAssignDraft}
      />

      {entryMode === "both" && (
        <div role="group" aria-label={t("entry.switchMode")} className="mx-auto mt-2 flex w-full max-w-4xl gap-2 px-3 sm:px-5">
          {(["chat", "standard"] as const).map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={activeEntryInput === method}
              onClick={() => setActiveEntryInput(method)}
              className={`min-h-10 rounded-lg border px-4 text-xs font-semibold ${
                activeEntryInput === method
                  ? "border-primary/30 bg-primary/[0.07] text-primary"
                  : "border-border-standard bg-surface-bright text-secondary"
              }`}
            >
              {method === "chat" ? t("entry.chat") : t("entry.standard")}
            </button>
          ))}
        </div>
      )}

      {activeEntryInput === "chat" ? (
        <ChatComposer
          onSend={handleSendMessage}
          categories={suggestedCategories}
          onAddCategory={() => setCurrentView("settings")}
          disabled={isSavingBatch}
          focusRequestId={newEntryRequestId}
        />
      ) : (
        <StandardEntryForm
          categories={parserCategories}
          onReview={setActiveClarification}
          onAddCategory={() => setCurrentView("settings")}
          focusRequestId={newEntryRequestId}
        />
      )}

      {/* 4. Undo Toast (6-Second countdown) */}
      {undoState && (
        <UndoToast
          transactionId={undoState.transactionId}
          categoryName={undoState.categoryName}
          amountPaisa={undoState.amountPaisa}
          onUndo={handleUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}

      {/* 5. Confirmation / Clarification / Batch Modal */}
      {(activeClarification || batchEntries) && (
        <ConfirmationModal
          result={activeClarification}
          batchEntries={batchEntries || undefined}
          accounts={accounts}
          categories={parserCategories}
          onConfirmSingle={handleConfirmSingle}
          onConfirmBatch={handleConfirmBatch}
          batchError={batchError}
          isSavingBatch={isSavingBatch}
          onCancel={() => {
            setActiveClarification(null);
            setBatchEntries(null);
            setBatchError(null);
          }}
        />
      )}

      {/* 6. Void Modal */}
      {voidingTransaction && (
        <VoidModal
          transaction={voidingTransaction}
          onConfirmVoid={handleConfirmVoid}
          onClose={() => setVoidingTransaction(null)}
        />
      )}

      {/* 7. Edit Modal */}
      {editingTransaction && (
        <EditModal
          transaction={editingTransaction}
          onConfirmEdit={handleConfirmEdit}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      {/* 8. Install Help Modal */}
      {showInstallHelp && (
        <InstallHelpModal onClose={() => setShowInstallHelp(false)} />
      )}
    </div>
  );
};
