import {
  getSupabaseClient,
  hasActiveSupabaseSession,
  isSupabaseConfigured,
} from "../lib/supabase";
import type { LedgerMateAiMessage } from "./ledgerMateAiService";

export interface AiAccountantChatScope {
  userId: string;
  organizationId: string;
}

export interface AiAccountantConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SyncedAiAccountantMessage extends LedgerMateAiMessage {
  id?: string;
  created_at?: string;
}

export interface SyncedAiAccountantHistory {
  conversationId: string;
  messages: LedgerMateAiMessage[];
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function hasValidScope(scope: AiAccountantChatScope): boolean {
  return Boolean(
    scope.userId &&
    scope.organizationId &&
    isSupabaseConfigured(),
  );
}

export function reconcileAiAccountantHistory(
  remote: LedgerMateAiMessage[],
  local: LedgerMateAiMessage[],
  limit = 100,
): { messages: LedgerMateAiMessage[]; pending: LedgerMateAiMessage[] } {
  const same = (a: LedgerMateAiMessage, b: LedgerMateAiMessage) => a.role === b.role && a.content === b.content;
  const startsWith = (whole: LedgerMateAiMessage[], prefix: LedgerMateAiMessage[]) =>
    prefix.length <= whole.length && prefix.every((item, index) => same(item, whole[index]));
  if (local.length === 0) return { messages: remote, pending: [] };
  if (remote.length === 0) return { messages: local.slice(-limit), pending: local };
  if (startsWith(local, remote)) return { messages: local.slice(-limit), pending: local.slice(remote.length) };
  if (startsWith(remote, local)) return { messages: remote.slice(-limit), pending: [] };
  for (let overlap = Math.min(remote.length, local.length); overlap > 0; overlap -= 1) {
    if (remote.slice(-overlap).every((item, index) => same(item, local[index]))) {
      return {
        messages: [...remote, ...local.slice(overlap)].slice(-limit),
        pending: local.slice(overlap),
      };
    }
  }
  return { messages: [...remote, ...local].slice(-limit), pending: local };
}

export async function listSyncedAiAccountantConversations(
  scope: AiAccountantChatScope,
  limit = 50,
): Promise<AiAccountantConversation[]> {
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) return [];
  const { data, error } = await getSupabaseClient()
    .from("ai_accountant_conversations")
    .select("id, title, created_at, updated_at")
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  return (data || []) as AiAccountantConversation[];
}

export async function createSyncedAiAccountantConversation(
  scope: AiAccountantChatScope,
  title = "New chat",
): Promise<AiAccountantConversation> {
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Sign in to your Shop Pro account to create a synced chat.");
  }
  const { data, error } = await getSupabaseClient()
    .from("ai_accountant_conversations")
    .insert({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      title: title.slice(0, 80),
    })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as AiAccountantConversation;
}

export async function loadSyncedAiAccountantHistory(
  scope: AiAccountantChatScope,
  conversationId: string,
  limit = 100,
): Promise<SyncedAiAccountantHistory> {
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Your cloud session is missing or expired. Sign in again to load chat history.");
  }
  const { data, error } = await getSupabaseClient()
    .from("ai_accountant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  const messages = ((data || []) as MessageRow[])
    .filter((message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    }));
  return { conversationId, messages: messages.reverse() };
}

export async function appendSyncedAiAccountantMessage(
  scope: AiAccountantChatScope,
  conversationId: string,
  message: LedgerMateAiMessage,
): Promise<string> {
  if (!message.content.trim() || message.content.length > 12000) {
    throw new Error("Chat message must contain 1–12,000 characters.");
  }
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Cloud session expired. Sign in again to sync chat history.");
  }

  const client = getSupabaseClient();
  const { data: inserted, error: insertError } = await client
    .from("ai_accountant_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: scope.organizationId,
      user_id: scope.userId,
      role: message.role,
      content: message.content,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  if (!inserted || typeof inserted.id !== "string") throw new Error("Chat message could not be verified after saving.");

  const update: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
  if (message.role === "user") {
    const title = message.content.replace(/\s+/g, " ").trim().slice(0, 80);
    if (title) update.title = title;
  }
  const { data, error: updateError } = await client
    .from("ai_accountant_conversations")
    .update(update)
    .eq("id", conversationId)
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!data) throw new Error("The selected chat no longer belongs to this Shop Pro account.");
  return (inserted as { id: string }).id;
}

export async function updateSyncedAiAccountantMessage(
  scope: AiAccountantChatScope,
  conversationId: string,
  messageId: string,
  content: string,
): Promise<void> {
  if (!content.trim() || content.length > 12000) throw new Error("Chat message must contain 1–12,000 characters.");
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Cloud session expired. Sign in again to sync chat history.");
  }
  const { data, error } = await getSupabaseClient()
    .from("ai_accountant_messages")
    .update({ content })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The selected chat response could not be updated.");
}

export async function clearSyncedAiAccountantHistory(
  scope: AiAccountantChatScope,
  conversationId: string,
): Promise<void> {
  if (!hasValidScope(scope) || !(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Cloud session expired. Sign in again to clear synced history.");
  }
  const { error } = await getSupabaseClient()
    .from("ai_accountant_messages")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId);
  if (error) throw error;
}
