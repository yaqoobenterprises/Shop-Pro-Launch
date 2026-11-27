import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DailySummary } from "../../types/ledger";
import { useApp } from "../../context/AppContext";
import { ledgerService } from "../../services/ledgerService";
import { updateSyncedAiAccountantMessage } from "../../services/aiAccountantChatService";
import { tryDirectLedgerAnswer } from "../../services/ledgerMateDirectAnswer";
import { buildLedgerMateContext } from "../../services/ledgerMateContext";
import { prepareLedgerMateAction, type PendingAction } from "../../services/ledgerMateActionService";
import { useLedgerMateChatHistory } from "../../services/useLedgerMateChatHistory";
import { makeLocalId, now, type ChatMessage, type LocalThread } from "../../services/ledgerMateChatUtils";
import { checkLedgerMateHealth, sendLedgerMateMessage, type LedgerMateAiHealth } from "../../services/ledgerMateAiService";
import { LedgerMateSurface } from "./LedgerMateSurface";
import "./LedgerMate.css";

export const AiAccountantPanel: React.FC<{
  summary: DailySummary;
  userId: string;
  organizationId: string;
  isCloudAccount: boolean;
  currency?: string;
  canPrepareActions?: boolean;
}> = ({ summary, userId, organizationId, isCloudAccount, currency = "PKR", canPrepareActions = false }) => {
  const { showToast } = useApp();
  const chat = useLedgerMateChatHistory({ userId, organizationId, isCloudAccount });
  const [input, setInput] = useState("");
  const [health, setHealth] = useState<LedgerMateAiHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showActionDetails, setShowActionDetails] = useState(false);
  const activeThreadRef = chat.activeThreadRef;
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const workRef = useRef(false);
  const online = health?.status === "ready";

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    try { setHealth(await checkLedgerMateHealth()); }
    catch { setHealth({ status: "offline", model: "openai/gpt-oss-20b", provider: "Groq" }); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => { mounted.current = true; void refreshHealth(); return () => { mounted.current = false; abortRef.current?.abort(); }; }, [refreshHealth]);
  useEffect(() => { const scroller = endRef.current?.closest(".lm-messages");
    if (scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 220) endRef.current?.scrollIntoView({ behavior: "instant", block: "end" }); }, [chat.messages]);

  const createThread = async () => {
    if (workRef.current || sending || actionBusy || pendingAction?.submitted) return;
    workRef.current = true;
    setPendingAction(null);
    setLastFailed(null);
    setInput("");
    try {
      await chat.createThread();
      textareaRef.current?.focus();
    } finally {
      workRef.current = false;
    }
  };

  const chooseThread = async (thread: LocalThread) => {
    if (thread.id === chat.activeThreadId) { setHistoryOpen(false); return; }
    if (workRef.current || sending || actionBusy || pendingAction?.submitted) return;
    workRef.current = true;
    setPendingAction(null);
    setLastFailed(null);
    setHistoryOpen(false);
    try { await chat.activateThread(thread); } finally { workRef.current = false; }
  };

  const confirmPendingAction = async () => {
    if (!canPrepareActions || !actionsEnabled || !pendingAction || actionBusy || workRef.current) return;
    workRef.current = true;
    setActionBusy(true);
    chat.setError(null);
    setPendingAction((current) => current ? { ...current, submitted: true } : current);
    try {
      let response: string;
      let queued = false;
      if (pendingAction.kind === "create") {
        const draft = pendingAction.draftId
          ? { id: pendingAction.draftId }
          : await ledgerService.createTransactionDraft(pendingAction.payload, userId);
        if (!pendingAction.draftId) setPendingAction((current) => current?.kind === "create" ? { ...current, draftId: draft.id } : current);
        const posted = await ledgerService.postTransactionDraft(draft.id, pendingAction.accountId);
        if (!posted.transaction && !posted.isQueuedOffline) throw new Error("Transaction could not be verified after posting.");
        queued = posted.isQueuedOffline;
        response = posted.isQueuedOffline
          ? "Entry offline queue mein save ho gayi hai. Internet aane par Shop Plus sync karega."
          : "Transaction Shop Plus ledger mein save ho gayi hai.";
      } else if (pendingAction.kind === "edit") {
        await ledgerService.editTransaction(pendingAction.transaction.id, { amount_paisa: pendingAction.amountPaisa }, pendingAction.transaction.updated_at);
        response = "Transaction update ho gayi hai. Audit history bhi record ho gayi.";
      } else {
        await ledgerService.voidTransaction(pendingAction.transaction.id, "Voided by user through LedgerMate AI", pendingAction.transaction.updated_at);
        response = "Transaction void ho gayi hai. Permanent delete nahi ki; audit history record rahegi.";
      }
      const synced = await chat.syncMessage({ role: "assistant", content: response, createdAt: now() });
      chat.setMessages((current) => [...current, synced]);
      setPendingAction(null);
      showToast(queued ? "warning" : "success", queued ? "Entry queued" : "Ledger updated", queued ? "Awaiting synchronization." : "Shop Plus confirmed the transaction action.");
    } catch (actionError) {
      chat.setError(actionError instanceof Error ? `${actionError.message} No success was reported.` : "Ledger action failed. No success was reported.");
    } finally {
      setActionBusy(false);
      workRef.current = false;
    }
  };

  const runAssistant = async (question: string, baseMessages: ChatMessage[], replaceIndex?: number, lockHeld = false) => {
    if ((workRef.current && !lockHeld) || (sending && !lockHeld) || !question.trim() || !online) return;
    if (!lockHeld) workRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const threadId = activeThreadRef.current;
    setLastFailed(null);
    setSending(true);
    chat.setError(null);
    const assistantId = makeLocalId();
    const previousMessage = replaceIndex === undefined ? undefined : chat.messagesRef.current[replaceIndex];
    const draftMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: now(), transient: true };
    if (replaceIndex === undefined) chat.setMessages(baseMessages);
    // Retain the previous complete response during regeneration.

    try {
      const direct = isCloudAccount ? await tryDirectLedgerAnswer(question,currency,summary.business_date) : null;
      const context = direct ? "" : await buildLedgerMateContext(question, baseMessages.slice(0, -1), summary.business_date, currency);
      controller.signal.throwIfAborted();
      let result: Awaited<ReturnType<typeof sendLedgerMateMessage>>;
      try {
        result = direct ? {reply:direct,model:"application"} : await sendLedgerMateMessage(baseMessages.filter(item => !item.transient && item.content.trim()), context, (delta) => {
          if (controller.signal.aborted || !mounted.current || activeThreadRef.current !== threadId) return;
          chat.setMessages((current) => {
            if (replaceIndex !== undefined) return current;
            const exists = current.some((item) => item.id === assistantId);
            return exists ? current.map((item) => item.id === assistantId ? { ...item, content: item.content + delta } : item) : [...current, { ...draftMessage, content: delta }];
          });
        }, controller.signal);
      } catch (providerError) {
        if (!controller.signal.aborted) setLastFailed(question);
        throw providerError;
      }
      controller.signal.throwIfAborted();
      if (!mounted.current || activeThreadRef.current !== threadId) return;
      abortRef.current = null;
      if (!direct) setHealth({ status: "ready", provider: "Groq", model: result.model });
      const finalMessage: ChatMessage = replaceIndex === undefined
        ? { ...draftMessage, content: result.reply, transient: false }
        : { ...previousMessage!, content: result.reply, createdAt: now() };
      if (replaceIndex !== undefined && finalMessage.id && !finalMessage.id.startsWith("local-")) {
        try {
          await updateSyncedAiAccountantMessage({ userId, organizationId }, threadId!, finalMessage.id, finalMessage.content);
          chat.setSyncStatus("synced");
        } catch (syncError) {
          chat.setSyncStatus("error");
          chat.setError(syncError instanceof Error ? `${syncError.message} The regenerated answer is saved on this device.` : "Regenerated answer could not sync.");
        }
      } else {
        const saved = await chat.syncMessage(finalMessage);
        finalMessage.id = saved.id || finalMessage.id;
      }
      chat.setMessages((current) => replaceIndex === undefined
        ? (current.some(item => item.id === assistantId) ? current.map((item) => item.id === assistantId ? finalMessage : item) : [...current, finalMessage])
        : current.map((item, index) => index === replaceIndex ? finalMessage : item));
    } catch (requestError) {
      if (mounted.current && activeThreadRef.current === threadId) {
        if (replaceIndex === undefined) chat.setMessages((current) => current.filter((item) => item.id !== assistantId));
        else if (previousMessage) chat.setMessages((current) => current.map((item, index) => index === replaceIndex ? previousMessage : item));
        setLastFailed(question);
        chat.setError(controller.signal.aborted ? "Response stopped. No incomplete answer was saved." : requestError instanceof Error ? requestError.message : "LedgerMate could not complete this request. Please try again.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (mounted.current && activeThreadRef.current === threadId) setSending(false);
      if (!lockHeld) workRef.current = false;
    }
  };

  const handleSend = async (event?: React.FormEvent, suggested?: string) => {
    event?.preventDefault();
    const content = (suggested || input).trim();
    if (!content || workRef.current || sending || pendingAction || chat.syncStatus === "loading") return;
    if (!online) {
      chat.setError("LedgerMate is offline. Reconnect and retry your question; no message was sent.");
      return;
    }
    workRef.current = true;
    setSending(true);
    chat.setError(null);
    const userMessage: ChatMessage = { role: "user", content, createdAt: now() };
    const nextMessages = [...chat.messages, userMessage];
    chat.setMessages(nextMessages);
    setInput("");
    const syncedUser = await chat.syncMessage(userMessage);
    if (syncedUser.id) {
      nextMessages[nextMessages.length - 1] = syncedUser;
      chat.setMessages(nextMessages.slice());
    }
    try {
      const action = actionsEnabled && canPrepareActions ? await prepareLedgerMateAction(content, chat.messages, summary) : null;
      if (action && "clarification" in action) {
        const synced = await chat.syncMessage({ role: "assistant", content: action.clarification, createdAt: now() });
        chat.setMessages((current) => [...current, synced]);
        return;
      }
      if (action && "pending" in action) {
        setPendingAction(action.pending);
        const synced = await chat.syncMessage({ role: "assistant", content: "Please review the transaction details below. Shop Plus will make no ledger change unless you press Confirm.", createdAt: now() });
        chat.setMessages((current) => [...current, synced]);
        return;
      }
      if (!actionsEnabled && /^(?:please\s+)?(?:add|record|enter|save|edit|change|update|delete|remove|void)\s+(?:a\s+|the\s+)?(?:sale|income|expense|transaction|entry)\b/i.test(content)) {
        const reply = await chat.syncMessage({role:"assistant",content:"LedgerMate is in read-only mode. No entry was created or changed. Use Cashbook or Transactions, or enable reviewed ledger actions if available.",createdAt:now()});
        chat.setMessages(current => [...current,reply]);
        return;
      }
      await runAssistant(content, nextMessages, undefined, true);
    } catch (sendError) {
      setLastFailed(content);
      chat.setError(sendError instanceof Error ? sendError.message : "Could not prepare your request.");
    } finally {
      workRef.current = false;
      if (mounted.current) setSending(false);
    }
  };

  const regenerate = async (index: number) => {
    if (workRef.current || sending || pendingAction || chat.messages[index]?.role !== "assistant") return;
    let userIndex = index - 1;
    while (userIndex >= 0 && chat.messages[userIndex].role !== "user") userIndex -= 1;
    if (userIndex < 0) return;
    await runAssistant(chat.messages[userIndex].content, [...chat.messages.slice(0, index)], index);
  };

  const copyMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      showToast("success", "Copied", "Response copied to clipboard.");
    } catch {
      chat.setError("Clipboard access is unavailable in this browser.");
    }
  };

  return <LedgerMateSurface
    activeThread={chat.activeThread}
    threads={chat.threads}
    messages={chat.messages}
    error={chat.error}
    online={online}
    checking={checking}
    sending={sending}
    actionBusy={actionBusy}
    syncStatus={chat.syncStatus}
    actionsEnabled={actionsEnabled}
    canPrepareActions={canPrepareActions}
    canRetry={Boolean(lastFailed)}
    canStop={Boolean(abortRef.current)}
    onToggleActions={() => { if (!workRef.current && !pendingAction) setActionsEnabled(value => !value); }}
    onStop={() => abortRef.current?.abort()}
    onRetry={() => { if (lastFailed && !workRef.current) { const last = chat.messages.at(-1); if (last?.role === "user" && last.content === lastFailed) void runAssistant(lastFailed, chat.messages); else setInput(lastFailed); } }}
    input={input}
    pendingAction={pendingAction}
    historyOpen={historyOpen}
    showActionDetails={showActionDetails}
    endRef={endRef}
    textareaRef={textareaRef}
    setInput={setInput}
    setError={chat.setError}
    setHistoryOpen={setHistoryOpen}
    setShowActionDetails={setShowActionDetails}
    onCreateThread={() => { void createThread(); }}
    onChooseThread={(thread) => { void chooseThread(thread); }}
    onClearHistory={() => { if (!workRef.current && !pendingAction) void chat.clearHistory(sending, actionBusy); }}
    onSend={(event, suggestion) => { void handleSend(event, suggestion); }}
    onCopy={(content) => { void copyMessage(content); }}
    onRegenerate={(index) => { void regenerate(index); }}
    onConfirmAction={() => { void confirmPendingAction(); }}
    onCancelAction={() => setPendingAction(null)}
    onRefresh={() => { void refreshHealth(); }}
  />;
};
