import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  checkLocalAiHealth,
  sendLocalAiMessage,
  type LocalAiHealth,
  type LocalAiMessage,
} from "../../services/localAiService";

const HISTORY_KEY = "shop-pro.ai-accountant.chat.v1";
const MAX_SAVED_MESSAGES = 100;

function readHistory(): LocalAiMessage[] {
  try {
    const value = localStorage.getItem(HISTORY_KEY);
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

export const AiAccountantPanel: React.FC = () => {
  const [messages, setMessages] = useState<LocalAiMessage[]>(readHistory);
  const [input, setInput] = useState("");
  const [health, setHealth] = useState<LocalAiHealth | null>(null);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkLocalAiHealth();
      setHealth(result);
    } catch {
      setHealth({ status: "offline", model: "Local model", ollama_reachable: false });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_SAVED_MESSAGES)));
    } catch {
      setError("Chat history could not be saved in this browser.");
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const result = await sendLocalAiMessage(nextMessages);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      setHealth((current) => current ? { ...current, status: "ready", model: result.model } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the local AI.");
    } finally {
      setSending(false);
    }
  };

  const clearHistory = () => {
    if (!window.confirm("Clear saved AI chat history on this device?")) return;
    setMessages([]);
    setError(null);
  };

  const isReady = health?.status === "ready";

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface" aria-label="AI Accountant">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-standard px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-on-surface">AI Accountant</h2>
          <p className="mt-0.5 text-xs text-text-muted">Local AI · Chat history saved on this device</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {checking ? "Checking…" : isReady ? `Online · ${health?.model}` : health?.status === "model_missing" ? "Model not installed" : "Local AI offline"}
          </span>
          <button type="button" onClick={() => void refreshHealth()} className="min-h-9 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-bright">
            Retry
          </button>
          <button type="button" onClick={clearHistory} className="min-h-9 rounded-lg border border-border-standard px-3 text-xs font-semibold text-secondary hover:bg-surface-bright">
            Clear chat
          </button>
        </div>
      </header>

      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
        Initial integration: general accounting help only. Live Shop Pro balances and transaction actions are not connected yet. Verify figures in your ledger.
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
        {messages.length === 0 && (
          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-border-standard bg-surface-bright p-5 text-center">
            <p className="text-sm font-semibold text-on-surface">Assalam-o-alaikum! I’m your Shop Pro AI Accountant.</p>
            <p className="mt-2 text-sm text-text-muted">Accounting, bookkeeping, debit/credit, journal entries aur finance ke sawal pooch sakte ho.</p>
            <p className="mt-2 text-xs text-text-muted">Example: “Staff advance asset hai ya expense?”</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${message.role === "user" ? "bg-primary text-white" : "border border-border-standard bg-surface-bright text-on-surface"}`}>
              {message.content}
            </div>
          </div>
        ))}
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
          disabled={!isReady || sending}
          className="min-h-12 flex-1 resize-y rounded-xl border border-border-standard bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary disabled:opacity-50"
        />
        <button type="submit" disabled={!input.trim() || !isReady || sending} className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          Send
        </button>
      </form>
    </section>
  );
};
