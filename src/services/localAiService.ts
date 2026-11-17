import { getSupabaseClient } from "../lib/supabase";

export interface LocalAiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocalAiHealth {
  status: "ready" | "offline" | string;
  model: string;
  provider: "Groq" | string;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Your cloud session is missing or expired. Sign in again.");
  }
  return token;
}

export async function checkLocalAiHealth(): Promise<LocalAiHealth> {
  const token = await getAccessToken();
  const response = await fetch("/api/ai-chat", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Cloud AI service is not available.");
  }
  return response.json() as Promise<LocalAiHealth>;
}

export async function sendLocalAiMessage(
  messages: LocalAiMessage[],
  context: string,
): Promise<{ reply: string; model: string }> {
  const token = await getAccessToken();
  const response = await fetch("/api/ai-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: messages.slice(-30), context }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Cloud AI request failed.");
  }

  return response.json() as Promise<{ reply: string; model: string }>;
}
