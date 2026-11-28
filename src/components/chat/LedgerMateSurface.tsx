import React, { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { ArrowUp, Check, ChevronDown, Copy, History, LoaderCircle, MessageSquarePlus, RefreshCw, Trash2, X } from "lucide-react";
import { MarkdownMessage } from "./LedgerMateMarkdown";
import type { PendingAction } from "../../services/ledgerMateActionService";
import { formatTime, type ChatMessage, type LocalThread } from "../../services/ledgerMateChatUtils";
interface LedgerMateSurfaceProps {
  activeThread: LocalThread | null; threads: LocalThread[]; messages: ChatMessage[]; error: string | null;
  online: boolean; checking: boolean; sending: boolean; actionBusy: boolean;
  syncStatus: "loading" | "synced" | "local" | "error"; healthModel: string; input: string;
  pendingAction: PendingAction | null; historyOpen: boolean; showActionDetails: boolean;
  endRef: MutableRefObject<HTMLDivElement | null>; textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setInput: Dispatch<SetStateAction<string>>; setError: Dispatch<SetStateAction<string | null>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>; setShowActionDetails: Dispatch<SetStateAction<boolean>>;
  onCreateThread: () => void; onChooseThread: (thread: LocalThread) => void; onClearHistory: () => void;
  onSend: (event?: React.FormEvent, suggested?: string) => void; onCopy: (content: string) => void;
  onRegenerate: (index: number) => void; onConfirmAction: () => void; onCancelAction: () => void; onRefresh: () => void;
  onConversationScroll?: React.UIEventHandler<HTMLDivElement>;
}
const suggestions = [
  { label: "Today's activity", question: "Summarize today's income and expenses." },
  { label: "Where money went", question: "Show my largest expense categories this month." },
  { label: "Account balances", question: "What are my current cash and bank balances?" },
  { label: "This month's result", question: "Summarize this month's income, expenses and net result." },
];
export const LedgerMateSurface: React.FC<LedgerMateSurfaceProps> = ({
  activeThread, threads, messages, error, online, checking, sending, actionBusy, syncStatus,
  input, pendingAction, historyOpen, showActionDetails, endRef, textareaRef,
  setInput, setError, setHistoryOpen, setShowActionDetails, onCreateThread, onChooseThread,
  onClearHistory, onSend, onCopy, onRegenerate, onConfirmAction, onCancelAction, onRefresh, onConversationScroll,
}) => {
  const closeHistory = useRef<HTMLButtonElement>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (historyOpen) closeHistory.current?.focus(); }, [historyOpen]);
  const dismissHistory = () => { setHistoryOpen(false); requestAnimationFrame(() => historyTrigger.current?.focus()); };
  return <section className="ledgermate" aria-label="LedgerMate AI" data-history-open={historyOpen}>
  {historyOpen && <aside className="lm-history-panel" aria-label="Conversation history" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); dismissHistory(); } }}>
    <div className="lm-history-heading"><h2>Conversations</h2><button className="icon-button" type="button" ref={closeHistory} aria-label="Close history" onClick={dismissHistory}><X size={17} /></button></div>
    <button className="lm-history-new" type="button" onClick={onCreateThread} disabled={sending || actionBusy}><MessageSquarePlus size={17} />New conversation</button>
    <div className="lm-history-list">
      {!threads.length && <p className="lm-history-empty">Your conversations will appear here.</p>}
      {threads.map(thread => <button key={thread.id} type="button" className={`lm-history-item ${thread.id === activeThread?.id ? "is-active" : ""}`} onClick={() => onChooseThread(thread)} disabled={sending || actionBusy}>
        <strong>{thread.title}</strong><small>{thread.localOnly ? "On this device" : new Intl.DateTimeFormat("en-PK", { month: "short", day: "numeric" }).format(new Date(thread.updated_at))}</small>
      </button>)}
    </div>
  </aside>}
  <div className="lm-main">
    <header className="lm-header">
      <div className="lm-title-group"><h1>LedgerMate<span>AI</span></h1>{activeThread && <p title={activeThread.title}>{activeThread.title}</p>}</div>
      <div className="lm-header-actions">
        <button type="button" className={`lm-action-button ${historyOpen ? "is-selected" : ""}`} ref={historyTrigger} aria-label="Conversation history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}><History size={18} /><span>History</span></button>
        <button type="button" className="lm-action-button" aria-label="New chat" onClick={onCreateThread} disabled={sending || actionBusy}><MessageSquarePlus size={18} /><span>New chat</span></button>
        {messages.length > 0 && <button type="button" className="icon-button" onClick={onClearHistory} disabled={sending || actionBusy || syncStatus === "loading"} aria-label="Clear current chat" title="Clear conversation"><Trash2 size={17} /></button>}
      </div>
    </header>
    <div className="lm-messages" onScroll={onConversationScroll} aria-label="Conversation" aria-busy={syncStatus === "loading"}>
      {syncStatus === "loading" && <div className="lm-history-loading" role="status"><LoaderCircle className="lm-spin" size={18} />Opening conversation…</div>}
      {!messages.length && syncStatus !== "loading" && <div className="lm-empty-state">
        <span className="lm-eyebrow">YOUR SHOP. CLEAR ANSWERS.</span><h2>What would you like<br />to understand?</h2>
        <p>Ask about your recorded activity.</p>
        <div className="lm-suggestions">{suggestions.map(({ label, question }) => <button key={label} type="button" onClick={() => onSend(undefined, question)} disabled={!online || checking}><span>{label}</span><ArrowUp size={16} aria-hidden="true" /></button>)}</div>
      </div>}
      {messages.map((message, index) => <article key={message.id || `${message.createdAt}-${index}`} className={`lm-message-row ${message.role}`}>
        <div className="lm-message-main">
          <div className={`lm-bubble ${message.role}`}>
            {message.role === "assistant" ? message.content ? <MarkdownMessage content={message.content} /> : <span className="lm-streaming-caret" role="status" aria-label="LedgerMate is responding" /> : <p>{message.content}</p>}
          </div>
          <div className="lm-message-footer"><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {message.role === "assistant" && message.content && <div className="lm-message-tools"><button type="button" onClick={() => onCopy(message.content)} aria-label="Copy response"><Copy size={15} /></button><button type="button" onClick={() => onRegenerate(index)} disabled={sending || !online} aria-label="Regenerate response"><RefreshCw size={15} /></button></div>}
          </div>
        </div>
      </article>)}
      {sending && !messages.some(message => message.role === "assistant" && !message.content) && <div className="lm-thinking" role="status"><span /><span /><span /><small>Working on your question</small></div>}
      {pendingAction && <div className="lm-confirm-card">
        <h2>Review entry</h2><p>Check the details before confirming.</p>
        <div className="lm-confirm-details">{pendingAction.preview.split("\n").map(item => { const [label, ...value] = item.split(":"); return <div key={label}><span>{label}</span><strong>{value.join(":").trim()}</strong></div>; })}</div>
        <button className="lm-details-toggle" type="button" aria-expanded={showActionDetails} onClick={() => setShowActionDetails(value => !value)}>What happens next?<ChevronDown size={15} /></button>
        {showActionDetails && <p className="lm-confirm-note">Confirm saves this action to your cashbook. Cancel leaves your records as they are.{pendingAction.submitted && " A submitted action may still be pending; use Retry to check its result."}</p>}
        <div className="lm-confirm-actions"><button type="button" className="button button-secondary" disabled={actionBusy || Boolean(pendingAction.submitted)} onClick={onCancelAction}>Cancel</button><button type="button" className="button button-primary" disabled={actionBusy} onClick={onConfirmAction}>{actionBusy ? <LoaderCircle className="lm-spin" size={16} /> : <Check size={16} />}{actionBusy ? "Saving…" : pendingAction.submitted ? "Retry action" : "Confirm action"}</button></div>
      </div>}
      <div ref={endRef} />
    </div>
    <div className="lm-composer-area">
      {error && <div className="lm-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={16} /></button></div>}
      {!online && !checking && <div className="lm-offline-banner"><span>Assistant unavailable</span><button type="button" onClick={onRefresh}><RefreshCw size={14} />Retry connection</button></div>}
      <form className="lm-composer-wrap" onSubmit={event => onSend(event)}>
        <div className="lm-composer"><textarea ref={textareaRef} value={input} onChange={event => { setInput(event.target.value); event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask LedgerMate…" rows={1} maxLength={12000} disabled={sending || syncStatus === "loading" || Boolean(pendingAction)} aria-label="Message LedgerMate AI" />
          <button className="lm-send-button" type="submit" aria-label="Send message" disabled={!input.trim() || !online || checking || sending || syncStatus === "loading" || Boolean(pendingAction)}>{sending ? <LoaderCircle className="lm-spin" size={19} /> : <ArrowUp size={20} />}</button>
        </div>
        <div className="lm-composer-hint"><span>{checking ? "Connecting to assistant…" : syncStatus === "error" ? "Saved on this device · sync pending" : "Check important figures against your records."}</span></div>
      </form>
    </div>
  </div>
</section>;
};
