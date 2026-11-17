import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  appendSyncedAiAccountantMessage,
  clearSyncedAiAccountantHistory,
  createSyncedAiAccountantConversation,
  listSyncedAiAccountantConversations,
  loadSyncedAiAccountantHistory,
  reconcileAiAccountantHistory,
} from "./aiAccountantChatService";
import {
  CHAT_HISTORY_LIMIT,
  LOCAL_THREADS_LIMIT,
  makeLocalId,
  now,
  readMessages,
  readThreads,
  titleFor,
  type ChatMessage,
  type LocalThread,
} from "./ledgerMateChatUtils";

interface UseLedgerMateChatHistoryOptions {
  userId: string;
  organizationId: string;
  isCloudAccount: boolean;
}

export function useLedgerMateChatHistory({ userId, organizationId, isCloudAccount }: UseLedgerMateChatHistoryOptions) {
  const { showToast } = useApp();
  const scopeKey = userId && organizationId ? `${organizationId}.${userId}` : "local";
  const storageRoot = `shop-pro.ledgermate.v1.${scopeKey}`;
  const threadListKey = `${storageRoot}.threads`;
  const legacyHistoryKey = `shop-pro.ai-accountant.chat.v1.${scopeKey}`;
  const [threads, setThreads] = useState<LocalThread[]>(() => readThreads(threadListKey));
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "local" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  const threadsRef = useRef(threads);
  const messagesRef = useRef(messages);
  useEffect(() => { threadsRef.current = threads; }, [threads]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) || null, [threads, activeThreadId]);
  const saveThreads = useCallback((items: LocalThread[]) => {
    const limited = items.slice(0, LOCAL_THREADS_LIMIT);
    setThreads(limited);
    try { localStorage.setItem(threadListKey, JSON.stringify(limited)); } catch { /* optional local index */ }
  }, [threadListKey]);
  const saveMessages = useCallback((threadId: string, items: ChatMessage[]) => {
    try { localStorage.setItem(`${storageRoot}.${threadId}`, JSON.stringify(items.slice(-CHAT_HISTORY_LIMIT))); }
    catch { setError("This browser could not save the chat locally."); }
  }, [storageRoot]);

  const activateThread = useCallback(async (thread: LocalThread, importLegacy = false) => {
    activeThreadRef.current = thread.id;
    setActiveThreadId(thread.id);
    setError(null);
    const local = readMessages(`${storageRoot}.${thread.id}`);
    const legacy = importLegacy ? readMessages(legacyHistoryKey) : [];
    setMessages(local.length ? local : legacy);
    if (!isCloudAccount || thread.localOnly || thread.id.startsWith("local-")) {
      setSyncStatus("local");
      return;
    }
    setSyncStatus("loading");
    try {
      const remote = await loadSyncedAiAccountantHistory({ userId, organizationId }, thread.id, CHAT_HISTORY_LIMIT);
      if (activeThreadRef.current !== thread.id) return;
      const reconciled = reconcileAiAccountantHistory(remote.messages, local.length ? local : legacy, CHAT_HISTORY_LIMIT);
      const normalized = reconciled.messages.map((item) => {
        const remoteMessage = remote.messages.find((remoteItem) => remoteItem.content === item.content && remoteItem.role === item.role);
        return { ...item, id: (item as ChatMessage).id, createdAt: item.createdAt || remoteMessage?.createdAt || now() };
      });
      setMessages(normalized);
      saveMessages(thread.id, normalized);
      setSyncStatus("synced");
      for (const pending of reconciled.pending) {
        const messageId = await appendSyncedAiAccountantMessage({ userId, organizationId }, thread.id, pending);
        if (activeThreadRef.current !== thread.id) continue;
        setMessages((current) => {
          const index = current.findIndex((item) => item.role === pending.role && item.content === pending.content && !item.id);
          if (index < 0) return current;
          const next = current.map((item, itemIndex) => itemIndex === index ? { ...item, id: messageId } : item);
          saveMessages(thread.id, next);
          return next;
        });
      }
    } catch (loadError) {
      if (activeThreadRef.current !== thread.id) return;
      setSyncStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Chat history could not be loaded.");
    }
  }, [isCloudAccount, legacyHistoryKey, organizationId, saveMessages, storageRoot, userId]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const existingLocal = readThreads(threadListKey);
      try {
        if (isCloudAccount && userId && organizationId) {
          const remote = await listSyncedAiAccountantConversations({ userId, organizationId }, 50);
          if (!active) return;
          let available: LocalThread[] = remote.map((thread) => ({ ...thread }));
          if (available.length === 0) {
            available = [await createSyncedAiAccountantConversation({ userId, organizationId })];
          }
          saveThreads([...available, ...existingLocal.filter((item) => item.localOnly)].slice(0, LOCAL_THREADS_LIMIT));
          if (!active) return;
          await activateThread(available[0], readMessages(legacyHistoryKey).length > 0);
          return;
        }
        let available = existingLocal;
        if (!available.length) {
          const legacy = readMessages(legacyHistoryKey);
          available = [{
            id: makeLocalId(),
            title: legacy.length ? titleFor(legacy.find((item) => item.role === "user")?.content || "LedgerMate chat") : "New chat",
            created_at: now(), updated_at: now(), localOnly: true,
          }];
        }
        saveThreads(available);
        if (active) await activateThread(available[0], true);
      } catch (loadError) {
        if (!active) return;
        const fallback: LocalThread = existingLocal[0] || {
          id: makeLocalId(), title: "New chat", created_at: now(), updated_at: now(), localOnly: true,
        };
        saveThreads([fallback, ...existingLocal.filter((item) => item.id !== fallback.id)]);
        await activateThread(fallback, true);
        setError(loadError instanceof Error ? `${loadError.message} You can continue with local chat history.` : "Cloud history is unavailable; local history is active.");
      }
    };
    void initialize();
    return () => { active = false; };
  }, [activateThread, isCloudAccount, legacyHistoryKey, organizationId, saveThreads, threadListKey, userId]);

  useEffect(() => {
    if (activeThreadId) saveMessages(activeThreadId, messages);
  }, [activeThreadId, messages, saveMessages]);

  const syncMessage = useCallback(async (message: ChatMessage): Promise<ChatMessage> => {
    const threadId = activeThreadRef.current;
    if (!threadId || !isCloudAccount || threadId.startsWith("local-")) return message;
    try {
      const id = await appendSyncedAiAccountantMessage({ userId, organizationId }, threadId, message);
      setSyncStatus("synced");
      if (message.role === "user") {
        const title = titleFor(message.content);
        saveThreads(threadsRef.current.map((thread) => thread.id === threadId ? { ...thread, title, updated_at: message.createdAt } : thread));
      }
      return { ...message, id };
    } catch (syncError) {
      setSyncStatus("error");
      setError(syncError instanceof Error ? `${syncError.message} This message remains on this device.` : "Chat message could not sync; it remains on this device.");
      return message;
    }
  }, [isCloudAccount, organizationId, saveThreads, userId]);

  const createThread = async () => {
    setError(null);
    let thread: LocalThread;
    try {
      if (!isCloudAccount) throw new Error("local");
      thread = await createSyncedAiAccountantConversation({ userId, organizationId });
    } catch {
      thread = { id: makeLocalId(), title: "New chat", created_at: now(), updated_at: now(), localOnly: true };
    }
    saveThreads([thread, ...threadsRef.current.filter((item) => item.id !== thread.id)]);
    setMessages([]);
    await activateThread(thread);
  };

  const clearHistory = async (sending: boolean, actionBusy: boolean) => {
    if (!activeThreadId || sending || actionBusy) return;
    if (!window.confirm("Clear messages in this LedgerMate chat? This removes its synced chat messages only; Shop Pro transactions are not changed.")) return;
    try {
      if (isCloudAccount && activeThread && !activeThread.localOnly) {
        await clearSyncedAiAccountantHistory({ userId, organizationId }, activeThread.id);
      }
      setMessages([]);
      setError(null);
      setSyncStatus(activeThread?.localOnly ? "local" : "synced");
      showToast("success", "Chat cleared", "Only this conversation's messages were cleared.");
    } catch (clearError) {
      setSyncStatus("error");
      setError(clearError instanceof Error ? clearError.message : "Chat history could not be cleared.");
    }
  };

  return {
    threads, activeThreadId, activeThread, messages, setMessages, syncStatus, setSyncStatus,
    error, setError, activeThreadRef, threadsRef, messagesRef,
    syncMessage, activateThread, createThread, clearHistory,
  };
}
