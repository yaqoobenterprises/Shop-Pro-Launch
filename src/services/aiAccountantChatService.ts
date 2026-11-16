import {
  getSupabaseClient,
  hasActiveSupabaseSession,
  isSupabaseConfigured,
} from "../lib/supabase";
import type { LocalAiMessage } from "./localAiService";

export interface AiAccountantChatScope {
  userId: string;
  organizationId: string;
}

export interface SyncedAiAccountantHistory {
  conversationId: string;
  messages: LocalAiMessage[];
}

interface ConversationRow {
  id: string;
}

interface MessageRow {
  role: "user" | "assistant";
  content: string;
}

async function getOrCreateConversation(
  scope: AiAccountantChatScope,
): Promise<string | null> {
  if (
    !scope.userId ||
    !scope.organizationId ||
    !isSupabaseConfigured() ||
    !(await hasActiveSupabaseSession(scope.userId))
  ) {
    return null;
  }

  const client = getSupabaseClient();
  const findConversation = async () => client
    .from("ai_accountant_conversations")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId)
    .maybeSingle();

  const { data: existing, error: findError } = await findConversation();
  if (findError) throw findError;
  if ((existing as ConversationRow | null)?.id) {
    return (existing as ConversationRow).id;
  }

  const { data: created, error: createError } = await client
    .from("ai_accountant_conversations")
    .insert({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      title: "AI Accountant",
    })
    .select("id")
    .single();

  if (!createError && (created as ConversationRow | null)?.id) {
    return (created as ConversationRow).id;
  }

  // Another signed-in device may have created the unique conversation first.
  if (createError && (createError as { code?: string }).code === "23505") {
    const { data: raced, error: raceError } = await findConversation();
    if (raceError) throw raceError;
    if ((raced as ConversationRow | null)?.id) {
      return (raced as ConversationRow).id;
    }
  }

  if (createError) throw createError;
  throw new Error("Could not create the AI Accountant conversation.");
}

export async function loadSyncedAiAccountantHistory(
  scope: AiAccountantChatScope,
  limit = 100,
): Promise<SyncedAiAccountantHistory | null> {
  const conversationId = await getOrCreateConversation(scope);
  if (!conversationId) return null;

  const { data, error } = await getSupabaseClient()
    .from("ai_accountant_messages")
    .select("role, content")
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
    .map((message) => ({ role: message.role, content: message.content }));

  return { conversationId, messages: messages.reverse() };
}

export async function appendSyncedAiAccountantMessage(
  scope: AiAccountantChatScope,
  conversationId: string,
  message: LocalAiMessage,
): Promise<void> {
  if (!message.content.trim() || message.content.length > 12000) {
    throw new Error("Chat message must contain 1–12,000 characters.");
  }
  if (!(await hasActiveSupabaseSession(scope.userId))) {
    throw new Error("Cloud session expired. Sign in again to sync chat history.");
  }

  const client = getSupabaseClient();
  const { error: insertError } = await client
    .from("ai_accountant_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: scope.organizationId,
      user_id: scope.userId,
      role: message.role,
      content: message.content,
    });
  if (insertError) throw insertError;

  const { error: updateError } = await client
    .from("ai_accountant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", scope.organizationId)
    .eq("user_id", scope.userId);
  if (updateError) throw updateError;
}

export async function clearSyncedAiAccountantHistory(
  scope: AiAccountantChatScope,
  conversationId: string,
): Promise<void> {
  if (!(await hasActiveSupabaseSession(scope.userId))) {
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
