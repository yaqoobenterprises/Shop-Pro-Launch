import type { AiAccountantConversation } from "./aiAccountantChatService";
import type { LedgerMateAiMessage } from "./ledgerMateAiService";

export const CHAT_HISTORY_LIMIT = 100;
export const LOCAL_THREADS_LIMIT = 30;

export interface ChatMessage extends LedgerMateAiMessage {
  id?: string;
  createdAt: string;
}

export interface LocalThread extends AiAccountantConversation {
  localOnly?: boolean;
}

export const now = () => new Date().toISOString();

export function makeLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `local-${crypto.randomUUID()}`
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readMessages(key: string): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ChatMessage =>
      typeof item === "object" && item !== null &&
      ((item as ChatMessage).role === "user" || (item as ChatMessage).role === "assistant") &&
      typeof (item as ChatMessage).content === "string",
    ).slice(-CHAT_HISTORY_LIMIT).map((item) => ({ ...item, createdAt: item.createdAt || now() }));
  } catch {
    return [];
  }
}

export function readThreads(key: string): LocalThread[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is LocalThread =>
      typeof item === "object" && item !== null &&
      typeof (item as LocalThread).id === "string" &&
      typeof (item as LocalThread).title === "string",
    ).slice(0, LOCAL_THREADS_LIMIT);
  } catch {
    return [];
  }
}

export function formatAmount(paisa: number | string | bigint): string {
  const value = Number(paisa);
  return `Rs ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}`;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function titleFor(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat";
}
