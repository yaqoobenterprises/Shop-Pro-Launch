import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useApp } from "../context/AppContext";
import { appendSyncedAiAccountantMessage, clearSyncedAiAccountantHistory, createSyncedAiAccountantConversation, listSyncedAiAccountantConversations, loadSyncedAiAccountantHistory, reconcileAiAccountantHistory } from "./aiAccountantChatService";
import { CHAT_HISTORY_LIMIT, LOCAL_THREADS_LIMIT, makeLocalId, now, readMessages, readThreads, titleFor, type ChatMessage, type LocalThread } from "./ledgerMateChatUtils";
interface Options { userId: string; organizationId: string; isCloudAccount: boolean }

/** Opening the assistant is always fresh. History is loaded only after an explicit selection. */
export function useLedgerMateChatHistory({ userId, organizationId, isCloudAccount }: Options) {
  const { showToast } = useApp();
  const scopeKey = `${organizationId}.${userId}`;
  const storageRoot = `shop-pro.ledgermate.v1.${scopeKey}`;
  const threadListKey = `${storageRoot}.threads`;
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [session, setSession] = useState<{ threadId: string | null; messages: ChatMessage[] }>({ threadId: null, messages: [] });
  const [syncStatus, setSyncStatus] = useState<"loading" | "synced" | "local" | "error">("local");
  const [error, setError] = useState<string | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  const threadsRef = useRef<LocalThread[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const generation = useRef(0);
  const scopeRef = useRef(scopeKey); scopeRef.current = scopeKey;
  const creation = useRef<Promise<LocalThread> | null>(null);
  const saveThreads = useCallback((items: LocalThread[]) => {
    const unique = [...new Map(items.map(item => [item.id, item])).values()].slice(0, LOCAL_THREADS_LIMIT);
    threadsRef.current = unique; setThreads(unique);
    try { localStorage.setItem(threadListKey, JSON.stringify(unique)); } catch { /* history remains usable in this session */ }
  }, [threadListKey]);
  const saveMessages = useCallback((id: string, items: ChatMessage[]) => {
    try { localStorage.setItem(`${storageRoot}.${id}`, JSON.stringify(items.slice(-CHAT_HISTORY_LIMIT))); }
    catch { setError("This browser could not save the chat locally."); }
  }, [storageRoot]);
  const setMessages = useCallback((next: SetStateAction<ChatMessage[]>) => {
    const items = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = items;
    const threadId = activeThreadRef.current;
    setSession({ threadId, messages: items });
    if (threadId) saveMessages(threadId, items);
  }, [saveMessages]);
  const startFresh = useCallback(() => {
    generation.current += 1; creation.current = null; activeThreadRef.current = null; messagesRef.current = [];
    setSession({ threadId: null, messages: [] }); setError(null); setSyncStatus(isCloudAccount ? "synced" : "local");
  }, [isCloudAccount]);

  useEffect(() => {
    const scope = scopeKey;
    startFresh();
    let active = true;
    let local = readThreads(threadListKey);
    // Preserve pre-thread history as an explicit history item, never inject it into another conversation.
    const legacy = readMessages(`shop-pro.ai-accountant.chat.v1.${scopeKey}`);
    if (!local.length && legacy.length) {
      const imported: LocalThread = { id: makeLocalId(), title: titleFor(legacy.find(item => item.role === "user")?.content || "Earlier conversation"), created_at: legacy[0].createdAt, updated_at: legacy.at(-1)!.createdAt, localOnly: true };
      saveMessages(imported.id, legacy); local = [imported];
    }
    saveThreads(local);
    if (isCloudAccount && userId && organizationId) {
      void listSyncedAiAccountantConversations({ userId, organizationId }, 50).then(remote => {
        if (!active || scopeRef.current !== scope) return;
        saveThreads([...threadsRef.current, ...remote].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      }).catch(() => { if (active && scopeRef.current === scope) setError("Saved cloud conversations could not load. Your new chat is ready."); });
    }
    return () => { active = false; generation.current += 1; };
  }, [isCloudAccount, organizationId, saveMessages, saveThreads, scopeKey, startFresh, threadListKey, userId]);

  const activateThread = useCallback(async (thread: LocalThread) => {
    const request = ++generation.current, scope = scopeKey;
    activeThreadRef.current = thread.id; setError(null);
    const local = readMessages(`${storageRoot}.${thread.id}`);
    setMessages(local);
    if (!isCloudAccount || thread.localOnly || thread.id.startsWith("local-")) { setSyncStatus("local"); return; }
    setSyncStatus("loading");
    try {
      const remote = await loadSyncedAiAccountantHistory({ userId, organizationId }, thread.id, CHAT_HISTORY_LIMIT);
      if (request !== generation.current || scopeRef.current !== scope) return;
      const reconciled = reconcileAiAccountantHistory(remote.messages, local, CHAT_HISTORY_LIMIT);
      setMessages(reconciled.messages.map(item => ({ ...item, createdAt: item.createdAt || now() })));
      for (const pending of reconciled.pending) {
        if (request !== generation.current || scopeRef.current !== scope) return;
        const id = await appendSyncedAiAccountantMessage({ userId, organizationId }, thread.id, pending);
        if (request !== generation.current || scopeRef.current !== scope) return;
        setMessages(current => {
          let replaced = false;
          return current.map(item => {
            if (!replaced && item.role === pending.role && item.content === pending.content && (!item.id || item.id.startsWith("local-"))) { replaced = true; return { ...item, id }; }
            return item;
          });
        });
      }
      setSyncStatus("synced");
    } catch (failure) {
      if (request !== generation.current || scopeRef.current !== scope) return;
      setSyncStatus("error"); setError(failure instanceof Error ? failure.message : "This conversation could not be loaded.");
    }
  }, [isCloudAccount, organizationId, scopeKey, setMessages, storageRoot, userId]);

  const ensureThread = async (firstMessage: ChatMessage): Promise<LocalThread> => {
    const existing = threadsRef.current.find(thread => thread.id === activeThreadRef.current);
    if (existing) return existing;
    if (creation.current) return creation.current;
    const request = generation.current, scope = scopeKey;
    const pending = (async () => {
      let thread: LocalThread;
      try {
        if (!isCloudAccount) throw new Error("local");
        thread = await createSyncedAiAccountantConversation({ userId, organizationId }, titleFor(firstMessage.content));
      } catch {
        thread = { id: makeLocalId(), title: titleFor(firstMessage.content), created_at: now(), updated_at: now(), localOnly: true };
      }
      if (request !== generation.current || scopeRef.current !== scope) throw new Error("The active conversation changed. Please send again in the current chat.");
      activeThreadRef.current = thread.id;
      saveThreads([thread, ...threadsRef.current]); setMessages(messagesRef.current);
      return thread;
    })();
    creation.current = pending;
    try { return await pending; } finally { if (creation.current === pending) creation.current = null; }
  };

  const syncMessage = async (message: ChatMessage): Promise<ChatMessage> => {
    const request = generation.current;
    const thread = await ensureThread(message);
    if (thread.localOnly || thread.id.startsWith("local-")) { setSyncStatus("local"); return { ...message, id: message.id || makeLocalId() }; }
    try {
      const id = await appendSyncedAiAccountantMessage({ userId, organizationId }, thread.id, message);
      if (request !== generation.current) return message;
      setSyncStatus("synced");
      const title = threadsRef.current.find(item => item.id === thread.id)?.title || titleFor(message.content);
      saveThreads(threadsRef.current.map(item => item.id === thread.id ? { ...item, title, updated_at: message.createdAt } : item));
      return { ...message, id };
    } catch (failure) {
      if (request === generation.current) { setSyncStatus("error"); setError(failure instanceof Error ? `${failure.message} The message remains on this device.` : "This message remains on this device."); }
      return message;
    }
  };
  const clearHistory = async (sending: boolean, actionBusy: boolean) => {
    const id = activeThreadRef.current;
    if (!id || sending || actionBusy) return;
    const request = ++generation.current;
    const thread = threadsRef.current.find(item => item.id === id);
    try {
      if (isCloudAccount && thread && !thread.localOnly) await clearSyncedAiAccountantHistory({ userId, organizationId }, id);
      if (request !== generation.current || activeThreadRef.current !== id) return;
      saveMessages(id, []); setMessages([]); setError(null); setSyncStatus(thread?.localOnly ? "local" : "synced");
      showToast("success", "Chat cleared", "Only this conversation's messages were cleared.");
    } catch (failure) { if (request === generation.current) { setSyncStatus("error"); setError(failure instanceof Error ? failure.message : "The conversation could not be cleared."); } }
  };
  const activeThread = useMemo(() => threads.find(item => item.id === session.threadId) || null, [threads, session.threadId]);
  return { threads, activeThreadId: session.threadId, activeThread, messages: session.messages, setMessages, syncStatus, setSyncStatus, error, setError, activeThreadRef, threadsRef, messagesRef, syncMessage, activateThread, createThread: async () => startFresh(), clearHistory };
}
