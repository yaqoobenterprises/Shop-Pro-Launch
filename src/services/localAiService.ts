export interface LocalAiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LocalAiHealth {
  status: "ready" | "model_missing" | "offline" | string;
  model: string;
  ollama_reachable: boolean;
}

const LOCAL_AI_BASE_URL = "http://127.0.0.1:8765";

export async function checkLocalAiHealth(): Promise<LocalAiHealth> {
  const response = await fetch(`${LOCAL_AI_BASE_URL}/health`, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Local AI service is not responding.");
  return response.json() as Promise<LocalAiHealth>;
}

export async function sendLocalAiMessage(
  messages: LocalAiMessage[],
  context: string,
): Promise<{ reply: string; model: string }> {
  const response = await fetch(`${LOCAL_AI_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.slice(-30), context }),
    signal: AbortSignal.timeout(185000),
  });

  if (!response.ok) {
    let detail = "Local AI request failed.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Keep the safe fallback message when the response is not JSON.
    }
    throw new Error(detail);
  }

  return response.json() as Promise<{ reply: string; model: string }>;
}
