import { getSupabaseClient } from "../lib/supabase";

export interface LedgerMateAiMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface LedgerMateAiHealth {
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

export async function checkLedgerMateHealth(): Promise<LedgerMateAiHealth> {
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
  return response.json() as Promise<LedgerMateAiHealth>;
}

function applyEvent(
  block: string,
  onDelta: (delta: string) => void,
): { model?: string; complete: boolean } {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return { complete: false };
  let payload: { delta?: unknown; model?: unknown; error?: unknown; done?: unknown };
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    throw new Error("Cloud AI returned an unreadable streaming response.");
  }
  if (eventName === "error" || typeof payload.error === "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : "Cloud AI interrupted the response.");
  }
  if (typeof payload.delta === "string") onDelta(payload.delta);
  return {
    model: typeof payload.model === "string" ? payload.model : undefined,
    complete: payload.done === true,
  };
}

export async function sendLedgerMateMessage(
  messages: LedgerMateAiMessage[],
  context: string,
  onDelta: (delta: string) => void,
): Promise<{ reply: string; model: string }> {
  const token = await getAccessToken();
  const response = await fetch("/api/ai-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify({ messages: messages.slice(-30), context }),
    signal: AbortSignal.timeout(95000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Cloud AI request failed.");
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    const body = await response.json().catch(() => ({})) as { reply?: string; model?: string; error?: string };
    if (typeof body.reply !== "string" || !body.reply.trim()) throw new Error(body.error || "Cloud AI returned an empty response.");
    onDelta(body.reply);
    return { reply: body.reply, model: body.model || "openai/gpt-oss-20b" };
  }

  if (!response.body) throw new Error("Cloud AI returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let model = "openai/gpt-oss-20b";
  let complete = false;
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const result = applyEvent(block, (delta) => {
          reply += delta;
          onDelta(delta);
        });
        if (result.model) model = result.model;
        if (result.complete) {
          complete = true;
          break;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (!complete) throw new Error("Cloud AI response ended before completion. Please try again.");
  if (!reply.trim()) throw new Error("AI returned an empty response. Please try again.");
  return { reply: reply.trim(), model };
}
