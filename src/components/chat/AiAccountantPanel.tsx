import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DailySummary } from "../../types/ledger";
import { ledgerService } from "../../services/ledgerService";
import {
  appendSyncedAiAccountantMessage,
  clearSyncedAiAccountantHistory,
  loadSyncedAiAccountantHistory,
  reconcileAiAccountantHistory,
} from "../../services/aiAccountantChatService";
import {
  checkLocalAiHealth,
  sendLocalAiMessage,
  type LocalAiHealth,
  type LocalAiMessage,
} from "../../services/localAiService";

const HISTORY_KEY = "shop-pro.ai-accountant.chat.v1";
const MAX_SAVED_MESSAGES = 100;

type AiActionTransaction = Awaited<ReturnType<typeof ledgerService.getAllFilteredTransactions>>[number];
type PendingAiAction =
  | { kind: "create"; payload: Parameters<typeof ledgerService.createTransactionDraft>[0]; accountId: string; preview: string }
  | { kind: "edit"; transaction: AiActionTransaction; amountPaisa: number; preview: string }
  | { kind: "void"; transaction: AiActionTransaction; preview: string };

function getRequestedBusinessDate(question: string, currentDate: string): string | null {
  const q = question.toLowerCase();
  const shiftDate = (date: string, days: number) => {
    const value = new Date(date + "T12:00:00Z");
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const validDate = (year: number, month: number, day: number): string | null => {
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
      ? parsed.toISOString().slice(0, 10)
      : null;
  };
  if (/\b(yesterday|kal|guzishta kal)\b/.test(q)) return shiftDate(currentDate, -1);
  if (/\b(today|aaj|aj)\b/.test(q)) return currentDate;

  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Numeric dates: 1/12/2026, 1-12-2026, or "1 12 2026".
  const dmy = q.match(/\b([0-2]?\d|3[01])[-\/.\s]([01]?\d)[-\/.\s](20\d{2})\b/);
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const namedDmy = q.match(/\b([0-2]?\d|3[01])\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[,]?\s+(20\d{2})\b/);
  if (namedDmy) return validDate(Number(namedDmy[3]), months[namedDmy[2].replace(/\.$/, "")], Number(namedDmy[1]));

  const namedMdy = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+([0-2]?\d|3[01])[,]?\s+(20\d{2})\b/);
  if (namedMdy) return validDate(Number(namedMdy[3]), months[namedMdy[1].replace(/\.$/, "")], Number(namedMdy[2]));

  return null;
}

function formatLedgerTransactions(transactions: Awaited<ReturnType<typeof ledgerService.getAllFilteredTransactions>>): string {
  return transactions.slice(0, 250).map((tx) => [
    `Date: ${tx.business_date}`, `Type: ${tx.type}`, `Amount: ${tx.amount_paisa} paisa`,
    `Category: ${tx.category_name || "Uncategorised"}`, `Account: ${tx.account_name || "Unknown"}`,
    `Note: ${tx.note || tx.raw_text || "No note"}`, `Status: ${tx.status}`, `ID: ${tx.id}`,
    `Updated: ${tx.updated_at || "unknown"}`,
  ].join("; ")).join("\n");
}

function readHistory(historyKey: string): LocalAiMessage[] {
  try {
    const value = localStorage.getItem(historyKey);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalAiMessage =>
        typeof item === "object" &&
        item !== null &&
        ((item as LocalAiMessage).role === "user" || (item as LocalAiMessage).role === "assistant") &&
        typeof (item as LocalAiMessage).content === "string",
    ).slice(-MAX_SAVED_MESSAGES);
  } catch {
    return [];
  }
}

export const AiAccountantPanel: React.FC<{ summary: DailySummary; userId: string; organizationId: string; isCloudAccount: boolean }> = ({ summary, userId, organizationId, isCloudAccount }) => {
  const historyKey = userId && organizationId ? `${HISTORY_KEY}.${organizationId}.${userId}` : `${HISTORY_KEY}.local`;
  const [messages, setMessages] = useState<LocalAiMessage[]>(() => readHistory(historyKey));
  const [input, setInput] = useState("");
  const [health, setHealth] = useState<LocalAiHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "local" | "error">("loading");
  const [pendingAction, setPendingAction] = useState<PendingAiAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkLocalAiHealth();
      setHealth(result);
    } catch {
      setHealth({ status: "offline", model: "Groq", provider: "Groq" });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    let cancelled = false;
    conversationIdRef.current = null;
    setMessages(readHistory(historyKey));
    if (!isCloudAccount || !userId || !organizationId) {
      setSyncStatus("local");
      return () => { cancelled = true; };
    }
    setSyncStatus("loading");
    void loadSyncedAiAccountantHistory({ userId, organizationId }, MAX_SAVED_MESSAGES)
      .then(async (history) => {
        if (cancelled) return;
        if (!history) { setSyncStatus("local"); return; }
        conversationIdRef.current = history.conversationId;
        const localHistory = readHistory(historyKey);
        const reconciled = reconcileAiAccountantHistory(history.messages, localHistory, MAX_SAVED_MESSAGES);
        setMessages(reconciled.messages);
        setSyncStatus("synced");
        setError(null);
        for (const pendingMessage of reconciled.pending) {
          try {
            await appendSyncedAiAccountantMessage(
              { userId, organizationId },
              history.conversationId,
              pendingMessage,
            );
          } catch (syncError) {
            if (cancelled) return;
            setSyncStatus("error");
            setError(syncError instanceof Error ? syncError.message : "Some local chat messages still need syncing.");
            return;
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setSyncStatus("error");
        setError(err instanceof Error ? err.message : "Cloud chat history could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [isCloudAccount, userId, organizationId, historyKey]);

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
    } catch {
      setError("Chat history could not be saved in this browser.");
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, historyKey]);

  const preparePendingAction = async (content: string): Promise<{ pending: PendingAiAction } | { clarification: string } | null> => {
    const q = content.toLowerCase();
    const isCreate = /\b(add|record|enter|save|jama|likh\s*do)\b/.test(q);
    const isEdit = /\b(edit|change|update|correct|tabdeel|theek\s*kar)\b/.test(q) || /\b[\d,]+(?:\.\d{1,2})?\s*(?:to|se|ko)\s*[\d,]+(?:\.\d{1,2})?\s*(?:kar\s*do)?\b/.test(q);
    const isVoid = /\b(delete|remove|void|hata|hatao|cancel|mita)\b/.test(q);
    if (!isCreate && !isEdit && !isVoid) return null;

    const date = getRequestedBusinessDate(content, summary.business_date);
    const moneyPattern = /(?:rs\.?|pkr|rupees?)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|pkr|rupees?)/gi;
    const moneyValues = [...content.matchAll(moneyPattern)]
      .map((match) => Number((match[1] || match[2]).replace(/,/g, "")))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value * 100));

    if (isCreate) {
      const amountPaisa = moneyValues[0];
      if (!amountPaisa) {
        return { clarification: "Entry add kar dunga — lekin amount missing hai. 20 copies quantity hai; total Rs. kitne hue?" };
      }
      const type: "income" | "expense" | null = /\b(expense|kharcha|kharch|purchase|bought|buy)\b/.test(q)
        ? "expense"
        : /\b(income|sale|sales|earning|kamai|bikri|received|copy|photocopy|printing|print|stamp)\b/.test(q)
          ? "income"
          : null;
      if (!type) return { clarification: "Ye income/sale hai ya expense? Confirm kar do." };
      const [categories, accounts] = await Promise.all([
        ledgerService.getCategories(),
        ledgerService.getPaymentAccounts(),
      ]);
      const categoryHint = q.includes("stamp") ? "stamp"
        : q.includes("lamination") ? "lamination"
          : q.includes("paper") ? "paper"
            : q.includes("print") || q.includes("copy") || q.includes("photocopy") || q.includes("b/w") ? "print"
              : "";
      const category = (categoryHint
        ? categories.find((item) => item.kind === type && item.name.toLowerCase().includes(categoryHint))
        : undefined)
        || categories.find((item) => item.kind === type && item.is_default)
        || categories.find((item) => item.kind === type);
      const account = accounts.find((item) => item.is_default) || accounts[0];
      if (!category) return { clarification: "Is type ki active category nahi mili. Pehle Shop Pro mein category add/select karo." };
      if (!account) return { clarification: "Koi active payment account nahi mila. Pehle Cash/Bank account set karo." };
      if (!date && /\\b20\\d{2}\\b/.test(q)) {
        return { clarification: "Date ka format samajh nahi aaya. 21 Nov 2025 ya 21/11/2025 likh do." };
      }
      const businessDate = date || summary.business_date;
      const payload = {
        type,
        amountPaisa,
        categoryId: category.id,
        categoryName: category.name,
        businessDate,
        note: content.trim(),
        rawText: content.trim(),
        createdByName: "AI Accountant",
      };
      const amount = (amountPaisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return { pending: { kind: "create", payload, accountId: account.id, preview: "New " + type + " · Rs. " + amount + " · " + category.name + " · " + businessDate + " · " + account.name } };
    }

    if (!date) return { clarification: "Kis date wali transaction? Date likho, jaise 21 Nov 2025." };
    if (isEdit) {
      const change = content.match(/(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:to|se|ko)\s*(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d{1,2})?)/i);
      if (!change) return { clarification: "Edit ke liye old amount aur new amount likho. Example: 21 Nov 2025 ki Rs. 500 wali entry Rs. 700 kar do." };
      const oldPaisa = Math.round(Number(change[1].replace(/,/g, "")) * 100);
      const newPaisa = Math.round(Number(change[2].replace(/,/g, "")) * 100);
      if (!Number.isSafeInteger(oldPaisa) || !Number.isSafeInteger(newPaisa) || oldPaisa <= 0 || newPaisa <= 0) {
        return { clarification: "Amounts valid nahi lag rahe. Old aur new amount dobara likho." };
      }
      const transactions = await ledgerService.getAllFilteredTransactions({ startDate: date, endDate: date, status: "active" });
      const matches = transactions.filter((tx) => Number(tx.amount_paisa) === oldPaisa);
      if (matches.length !== 1) return { clarification: matches.length ? "Is date par same amount ki multiple entries hain. Category ya note bhi bata do." : "Is date par ye old amount wali active transaction nahi mili." };
      const transaction = matches[0];
      return { pending: { kind: "edit", transaction, amountPaisa: newPaisa, preview: "Edit " + transaction.type + " · " + transaction.business_date + " · " + (transaction.category_name || "Uncategorised") + " · Rs. " + (oldPaisa / 100).toLocaleString("en-PK") + " → Rs. " + (newPaisa / 100).toLocaleString("en-PK") } };
    }

    const amount = moneyValues[0] || (() => {
      const loose = content.match(/\b([\d,]+)\s*(?:wali|ka|ki)\s*(?:transaction|entry|sale|expense)\b/i);
      return loose ? Math.round(Number(loose[1].replace(/,/g, "")) * 100) : undefined;
    })();
    const transactions = await ledgerService.getAllFilteredTransactions({ startDate: date, endDate: date, status: "active" });
    const matches = amount ? transactions.filter((tx) => Number(tx.amount_paisa) === amount) : transactions;
    if (matches.length !== 1) return { clarification: matches.length ? "Is date par multiple transactions hain. Amount ya category/note bata do taake ghalat entry remove na ho." : "Is date par matching active transaction nahi mili." };
    const transaction = matches[0];
    return { pending: { kind: "void", transaction, preview: "Remove (void) " + transaction.type + " · " + transaction.business_date + " · " + (transaction.category_name || "Uncategorised") + " · Rs. " + (Number(transaction.amount_paisa) / 100).toLocaleString("en-PK") } };
  };

  const confirmPendingAction = async () => {
    if (!pendingAction || actionBusy) return;
    setActionBusy(true);
    try {
      if (pendingAction.kind === "create") {
        const draft = await ledgerService.createTransactionDraft(pendingAction.payload, userId);
        const posted = await ledgerService.postTransactionDraft(draft.id, pendingAction.accountId);
        if (!posted.transaction && !posted.isQueuedOffline) throw new Error("Transaction could not be verified after posting.");
        setMessages((current) => [...current, { role: "assistant", content: posted.isQueuedOffline
          ? "Entry offline queue mein save ho gayi hai. Internet aane par sync hogi."
          : "Transaction database mein successfully save ho gayi hai." }]);
      } else if (pendingAction.kind === "edit") {
        await ledgerService.editTransaction(
          pendingAction.transaction.id,
          { amount_paisa: pendingAction.amountPaisa },
          pendingAction.transaction.updated_at,
        );
        setMessages((current) => [...current, { role: "assistant", content: "Transaction database mein update ho gayi hai. Audit history bhi record ho gayi." }]);
      } else {
        await ledgerService.voidTransaction(
          pendingAction.transaction.id,
          "Voided by user through AI Accountant",
          pendingAction.transaction.updated_at,
        );
        setMessages((current) => [...current, { role: "assistant", content: "Transaction void ho gayi hai. Permanent delete nahi ki; audit history محفوظ hai." }]);
      }
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ledger action failed. No success was reported.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const userMessage: LocalAiMessage = { role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    if (conversationIdRef.current && isCloudAccount) {
      try {
        await appendSyncedAiAccountantMessage({ userId, organizationId }, conversationIdRef.current, userMessage);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }
    setInput("");
    setSending(true);
    setError(null);

    try {
      const actionPreparation = await preparePendingAction(content);
      if (actionPreparation && "clarification" in actionPreparation) {
        setMessages((current) => [...current, { role: "assistant", content: actionPreparation.clarification }]);
        return;
      }
      if (actionPreparation && "pending" in actionPreparation) {
        setPendingAction(actionPreparation.pending);
        setMessages((current) => [...current, { role: "assistant", content: "Action preview ready hai. Details check karo, phir Confirm dabao. Bina confirmation database change nahi hoga." }]);
        return;
      }

      const verifiedContext = [
        "Verified Shop Pro daily summary. Currency: PKR. Amount fields are integer paisa; divide by 100 for rupees.",
        `Business date: ${summary.business_date}`,
        `Income: ${summary.income_paisa} paisa`,
        `Expense: ${summary.expense_paisa} paisa`,
        `Net profit (income minus expense): ${summary.net_profit_paisa} paisa`,
        `Capital received: ${summary.capital_in_paisa} paisa`,
        `Owner withdrawals: ${summary.withdrawal_paisa} paisa`,
        `Adjustments in: ${summary.adjustment_in_paisa} paisa`,
        `Adjustments out: ${summary.adjustment_out_paisa} paisa`,
        `Transaction count: ${summary.transaction_count}`,
        "This is only the currently loaded business-date summary. Do not present it as a monthly, yearly, cash-balance, bank-balance, or full financial statement. If asked for another date or a report not supplied here, say that data is not connected yet.",
      ].join("\n");
      const asksAboutEntries = /transaction|transactions|entry|entries|payment|record|hisab|len.?den|sale|sales|income|earning|kamai|stamp|copy|printing|expense|kharcha/i.test(content);
      const requestedDate = getRequestedBusinessDate(content, summary.business_date);
      const [monthlyReport, paymentAccounts, categoryBreakdown, requestedTransactions] = await Promise.all([
        ledgerService.getMonthlyReport(Number(summary.business_date.slice(0, 4))),
        ledgerService.getPaymentAccounts(),
        requestedDate === summary.business_date ? ledgerService.getCategoryBreakdown(summary.business_date) : Promise.resolve([]),
        asksAboutEntries && requestedDate
          ? ledgerService.getAllFilteredTransactions({ startDate: requestedDate, endDate: requestedDate, status: "active" })
          : Promise.resolve([]),
      ]);
      const monthlyContext = monthlyReport.map((month) => [
        `Month: ${month.year}-${String(month.month).padStart(2, "0")}`,
        `Income: ${month.income_paisa} paisa`,
        `Expense: ${month.expense_paisa} paisa`,
        `Net result: ${month.net_profit_paisa} paisa`,
        `Capital received: ${month.capital_in_paisa} paisa`,
        `Owner withdrawals: ${month.withdrawal_paisa} paisa`,
      ].join("; ")).join("\n");
      const accountContext = paymentAccounts.map((account) =>
        `Account ${account.name} (${account.type}): current balance ${account.balance_paisa} paisa`
      ).join("\n");
      const categoryContext = categoryBreakdown.map((item) => `${item.type}: ${item.category_name}; total ${item.total_paisa} paisa; entries ${item.entry_count}`).join("\n");
      const transactionContext = formatLedgerTransactions(requestedTransactions);
      const serviceTerm = content.toLowerCase().match(/stamp(?:\s*paper)?|black\s*(?:and|&|n)\s*white|b\/?w|colour(?:ed)?\s*print(?:ing)?|photocopy|spiral\s*binding|lamination|printing/i)?.[0];
      const matchingServiceTransactions = serviceTerm
        ? requestedTransactions.filter((tx) => `${tx.category_name || ""} ${tx.note || ""} ${tx.raw_text || ""}`.toLowerCase().includes(serviceTerm.toLowerCase()))
        : requestedTransactions;
      const serviceIncomePaisa = matchingServiceTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount_paisa || 0), 0);
      const serviceExpensePaisa = matchingServiceTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount_paisa || 0), 0);
      const dayIncomePaisa = requestedTransactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + Number(tx.amount_paisa || 0), 0);
      const dayExpensePaisa = requestedTransactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Number(tx.amount_paisa || 0), 0);
      const completeContext = [
        verifiedContext,
        "Monthly summaries for the calendar year of the current business date (only months returned by Shop Pro):",
        monthlyContext || "No monthly report rows returned.",
        "Payment accounts currently visible to this signed-in Shop Pro session (balance_paisa is integer paisa):",
        accountContext || "No payment account rows returned.",
        `Category breakdown for ${summary.business_date}:`,
        categoryContext || "No category rows returned for this date.",
        asksAboutEntries && requestedDate
          ? `All active transactions retrieved for ${requestedDate} (${requestedTransactions.length} records; context displays up to 250):\n${transactionContext || "No active transactions found for this date."}`
          : asksAboutEntries
            ? "Transaction-level records were requested but no date could be resolved. Ask the user which date they mean; do not guess."
            : "Transaction-level records were not requested and are not included.",
        serviceTerm
          ? `Service keyword detected: ${serviceTerm}. Matching active records: ${matchingServiceTransactions.length}; income total: ${serviceIncomePaisa} paisa; expense total: ${serviceExpensePaisa} paisa.`
          : "No specific service keyword was detected.",
        asksAboutEntries && requestedDate ? `Verified date totals across all ${requestedTransactions.length} active records: income ${dayIncomePaisa} paisa; expenses ${dayExpensePaisa} paisa.` : "No date-specific transaction totals were calculated.",
        "Never claim a transaction is missing unless the requested date was queried and returned zero active records. If more than 250 records exist, say the context display is capped. Amounts are paisa. Account balances are current balances, not profit. These summaries are not a complete double-entry trial balance or balance sheet.",
      ].join("\n\n");
      const result = await sendLocalAiMessage(nextMessages, completeContext);
      const assistantMessage: LocalAiMessage = { role: "assistant", content: result.reply };
      setMessages((current) => [...current, assistantMessage]);
      if (conversationIdRef.current && isCloudAccount) {
        try {
          await appendSyncedAiAccountantMessage({ userId, organizationId }, conversationIdRef.current, assistantMessage);
          setSyncStatus("synced");
        } catch {
          setSyncStatus("error");
        }
      }
      setHealth((current) => current ? { ...current, status: "ready", model: result.model } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Cloud AI.");
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear AI Accountant chat history from all synced devices?")) return;
    try {
      if (isCloudAccount && !conversationIdRef.current) {
        throw new Error("Cloud history is not confirmed as loaded. Retry sync before clearing so no remote messages are left behind.");
      }
      if (conversationIdRef.current && isCloudAccount) {
        await clearSyncedAiAccountantHistory({ userId, organizationId }, conversationIdRef.current);
      }
      setMessages([]);
      setError(null);
      setSyncStatus(conversationIdRef.current ? "synced" : "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear synced chat history.");
      setSyncStatus("error");
    }
  };

  const isReady = health?.status === "ready";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface" aria-label="AI Accountant">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-standard px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-on-surface">AI Accountant</h2>
          <p className="mt-0.5 text-xs text-text-muted">Cloud AI · Selected ledger data is sent to Groq · {syncStatus === "loading" ? "Loading cloud history…" : syncStatus === "synced" ? "Chat synced across your devices" : syncStatus === "error" ? "Cloud sync needs attention" : "Chat saved on this device only"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {checking ? "Checking…" : isReady ? `Online · ${health?.model}` : "Cloud AI offline"}
          </span>
          <button type="button" onClick={() => void refreshHealth()} className="min-h-9 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-bright">
            Retry
          </button>
          <button type="button" onClick={() => void clearHistory()} className="min-h-9 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-bright">
            Clear chat
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${message.role === "user" ? "bg-primary text-white" : "border border-border-standard bg-surface-bright text-on-surface"}`}>
              {message.content}
            </div>
          </div>
        ))}
        {pendingAction && (
          <div className="mx-auto w-full max-w-[88%] rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900 sm:max-w-[75%]">
            <p className="font-semibold">Confirm ledger change</p>
            <p className="mt-1">{pendingAction.preview}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void confirmPendingAction()} disabled={actionBusy} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {actionBusy ? "Saving…" : "Confirm"}
              </button>
              <button type="button" onClick={() => setPendingAction(null)} disabled={actionBusy} className="rounded-lg border border-border-standard px-4 py-2 text-xs font-semibold text-secondary disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
        {sending && <p className="text-xs text-text-muted">AI is thinking…</p>}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="px-4 pb-2 text-xs text-danger sm:px-6">{error}</p>}

      <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-border-standard bg-surface-bright p-3 sm:p-4">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask an accounting question…"
          rows={2}
          maxLength={12000}
          disabled={sending || syncStatus === "loading"}
          className="min-h-12 flex-1 resize-y rounded-xl border border-border-standard bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-50"
        />
        <button type="submit" disabled={!input.trim() || !isReady || sending || syncStatus === "loading"} className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  );
};
