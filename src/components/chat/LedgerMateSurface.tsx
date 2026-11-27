import React, { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  ArrowUp, Bot, Check, ChevronDown, CircleHelp, Copy, History, LoaderCircle,
  MessageSquarePlus, RefreshCw, Send, MessageCircle, Trash2, WalletCards, X,
} from "lucide-react";
import { MarkdownMessage } from "./LedgerMateMarkdown";
import type { PendingAction } from "../../services/ledgerMateActionService";
import { formatTime, type ChatMessage, type LocalThread } from "../../services/ledgerMateChatUtils";

interface LedgerMateSurfaceProps {
  activeThread: LocalThread | null;
  threads: LocalThread[];
  messages: ChatMessage[];
  error: string | null;
  online: boolean;
  checking: boolean;
  providerDisabledReason?: string;
  sending: boolean;
  actionBusy: boolean;
  syncStatus: "loading" | "synced" | "local" | "error";
  actionsEnabled: boolean;
  canPrepareActions: boolean;
  canStop: boolean;
  canRetry: boolean;
  onToggleActions: () => void;
  onStop: () => void;
  onRetry: () => void;
  input: string;
  pendingAction: PendingAction | null;
  historyOpen: boolean;
  showActionDetails: boolean;
  endRef: MutableRefObject<HTMLDivElement | null>;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setInput: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setShowActionDetails: Dispatch<SetStateAction<boolean>>;
  onCreateThread: () => void;
  onChooseThread: (thread: LocalThread) => void;
  onClearHistory: () => void;
  onSend: (event?: React.FormEvent, suggested?: string) => void;
  onCopy: (content: string) => void;
  onRegenerate: (index: number) => void;
  onConfirmAction: () => void;
  onCancelAction: () => void;
  onRefresh: () => void;
}

const promptSuggestions = [
  "Aaj ki total sale kitni hai?",
  "Is month ka operating result aur expense batao",
  "Cash aur bank balance kitna hai?",
  "Sab se zyada income kis service se hui?",
];

export const LedgerMateSurface: React.FC<LedgerMateSurfaceProps> = ({
  activeThread, threads, messages, error, online, checking, providerDisabledReason, sending, actionBusy, syncStatus,
  actionsEnabled, canPrepareActions, canStop, canRetry, onToggleActions, onStop, onRetry, input, pendingAction, historyOpen, showActionDetails, endRef, textareaRef,
  setInput, setError, setHistoryOpen, setShowActionDetails, onCreateThread, onChooseThread,
  onClearHistory, onSend, onCopy, onRegenerate, onConfirmAction, onCancelAction, onRefresh,
}) => (
  <section className="ledgermate" aria-label="LedgerMate AI">
    <header className="lm-header">
      <div className="lm-brand-row">
        <div className="lm-mark"><MessageCircle aria-hidden="true" /></div>
        <div className="lm-title-group">
          <h1>LedgerMate AI</h1>
          <p><span className={`lm-status-dot ${online ? "is-online" : ""}`} />{providerDisabledReason ? "AI not connected" : checking ? "Connecting" : online ? "AI available" : "AI unavailable"}</p>
        </div>
        
      </div>
      <div className="lm-header-actions">
        <button type="button" className="lm-action-button" aria-label="New chat" onClick={onCreateThread} disabled={sending || actionBusy || Boolean(pendingAction?.submitted)}>
          <MessageSquarePlus aria-hidden="true" /><span>New chat</span>
        </button>
        <div className="lm-history-anchor">
          <button type="button" id="lm-history-trigger" aria-label="History" aria-controls={historyOpen ? "lm-chat-history" : undefined} className={`lm-action-button ${historyOpen ? "is-selected" : ""}`} disabled={sending || actionBusy || Boolean(pendingAction?.submitted)} onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            <History aria-hidden="true" /><span>History</span><ChevronDown className="lm-chevron" aria-hidden="true" />
          </button>
          {historyOpen && <>
            <button type="button" className="lm-popover-scrim" aria-label="Close chat history" onClick={() => { setHistoryOpen(false); document.getElementById("lm-history-trigger")?.focus(); }} />
            <div id="lm-chat-history" className="lm-history-popover" role="region" aria-label="Chat history" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setHistoryOpen(false); document.getElementById("lm-history-trigger")?.focus(); } }}>
              <div className="lm-popover-heading"><span>Recent conversations</span><button type="button" onClick={() => { setHistoryOpen(false); document.getElementById("lm-history-trigger")?.focus(); }} aria-label="Close history"><X aria-hidden="true" /></button></div>
              <div className="lm-history-list">
                {threads.length === 0 && <p className="lm-history-empty">No conversations</p>}
                {threads.map((thread) => <button key={thread.id} type="button" aria-current={thread.id === activeThread?.id ? "true" : undefined} className={`lm-history-item ${thread.id === activeThread?.id ? "is-active" : ""}`} onClick={() => { onChooseThread(thread); document.getElementById("lm-history-trigger")?.focus(); }}>
                  <span className="lm-history-icon"><Bot aria-hidden="true" /></span>
                  <span className="lm-history-copy"><strong>{thread.title}</strong><small>{thread.localOnly ? "Saved on this device" : Number.isNaN(Date.parse(thread.updated_at)) ? "Date unavailable" : new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(new Date(thread.updated_at))}</small></span>
                </button>)}
              </div>
            </div>
          </>}
        </div>
        <button type="button" className="lm-icon-button" onClick={onClearHistory} disabled={!messages.length || sending || actionBusy || Boolean(pendingAction)} aria-label="Clear current chat" title="Clear chat">
          <Trash2 aria-hidden="true" /><span>Clear chat</span>
        </button>
      </div>
    </header>

    <div className="lm-conversation-meta">
      <span className="lm-thread-title"><span>{activeThread?.title || "New chat"}</span><span className={`lm-sync ${syncStatus}`}>{syncStatus === "loading" ? "Syncing" : syncStatus === "synced" ? "Synced" : syncStatus === "error" ? "Sync issue" : "On this device"}</span></span>
      <span className="lm-privacy-note"><WalletCards aria-hidden="true" /> {actionsEnabled ? "Reviewed actions enabled" : "Read-only analysis"}</span>
    </div>

    <div className="lm-access-note"><span>Financial answers use retrieved ledger data. AI explanations may be inaccurate.</span>{canPrepareActions && <button type="button" aria-pressed={actionsEnabled} disabled={sending || actionBusy || Boolean(pendingAction)} onClick={onToggleActions}>{actionsEnabled ? "Turn off ledger actions" : "Enable reviewed ledger actions"}</button>}</div>
    <div className="lm-messages" tabIndex={0} role="log" aria-label="Conversation messages" aria-live={sending ? "off" : "polite"} aria-relevant="additions">
      {messages.length === 0 && <div className="lm-empty-state">
        <div className="lm-empty-icon"><MessageCircle aria-hidden="true" /></div>
        <h2>What would you like to understand?</h2>
        <p>Ask in English or Roman Urdu about recorded income, expenses, accounts or categories.</p>
        <div className="lm-suggestions">{promptSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onSend(undefined, suggestion)} disabled={!online || checking || syncStatus === "loading"}><span>{suggestion}</span><ArrowUp aria-hidden="true" /></button>)}</div>
      </div>}
      {messages.map((message, index) => <article key={message.id || `${message.createdAt}-${index}`} className={`lm-message-row ${message.role}`}>
        {message.role === "assistant" && <div className="lm-avatar"><MessageCircle aria-hidden="true" /></div>}
        <div className="lm-message-main">
          <div className={`lm-bubble ${message.role}`}>
            {message.role === "assistant" ? message.content ? <MarkdownMessage content={message.content} /> : <span className="lm-streaming-caret" aria-label="LedgerMate is responding" /> : <p>{message.content}</p>}
          </div>
          <div className="lm-message-footer">
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {message.role === "assistant" && message.content && !message.transient && <div className="lm-message-tools">
              <button type="button" onClick={() => onCopy(message.content)} aria-label="Copy response" title="Copy response"><Copy aria-hidden="true" /></button>
              <button type="button" onClick={() => onRegenerate(index)} disabled={sending || !online || Boolean(pendingAction)} aria-label="Ask question again" title="Ask question again — keep original answer"><RefreshCw aria-hidden="true" /></button>
            </div>}
          </div>
        </div>
        {message.role === "user" && <div className="lm-user-avatar" aria-hidden="true">You</div>}
      </article>)}
      {sending && !messages.some((message) => message.role === "assistant" && !message.content) && <div className="lm-thinking"><span /><span /><span /><small>LedgerMate is thinking</small></div>}

      {pendingAction && <div className="lm-confirm-card">
        <div className="lm-confirm-heading"><span className="lm-confirm-icon"><CircleHelp aria-hidden="true" /></span><div><strong>Review ledger action</strong><small>Nothing will be written until you confirm.</small></div></div>
        <div className="lm-confirm-details">{pendingAction.preview.split("\n").map((item) => { const [label, ...rest] = item.split(":"); return <div key={label}><span>{label}</span><strong>{rest.join(":").trim()}</strong></div>; })}</div>
        <button type="button" className="lm-details-toggle" onClick={() => setShowActionDetails((show) => !show)}>{showActionDetails ? "Hide details" : "What happens next?"}<ChevronDown aria-hidden="true" /></button>
        {showActionDetails && <p className="lm-confirm-note">Shop Plus will use its existing ledger service, permission checks, and audit history. Cancel closes this preview without making any ledger change.{pendingAction.submitted && " This action was already submitted; its result may still be pending, so retry it to resolve the result."}</p>}
        <div className="lm-confirm-actions"><button type="button" className="lm-cancel-button" disabled={actionBusy || Boolean(pendingAction.submitted)} onClick={onCancelAction}>Cancel</button><button type="button" className="lm-confirm-button" disabled={actionBusy} onClick={onConfirmAction}>{actionBusy ? <LoaderCircle className="lm-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{actionBusy ? "Saving" : pendingAction.submitted ? "Retry action" : "Confirm action"}</button></div>
      </div>}
      <div ref={endRef} />
    </div>

    {error && <div className="lm-error" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X aria-hidden="true" /></button></div>}
    {!online && !checking && <div className="lm-offline-banner"><span>{providerDisabledReason || "The AI service is unavailable. You can still read chat history; reconnect or retry."}</span>{!providerDisabledReason && <button type="button" onClick={onRefresh}><RefreshCw aria-hidden="true" /> Retry</button>}</div>}

    <form className="lm-composer-wrap" onSubmit={(event) => onSend(event)}>
      {sending && <p role="status" className="lm-request-status">Preparing response… {canStop && <button type="button" onClick={onStop}>Stop response</button>}</p>}
      {!sending && canRetry && <button type="button" className="lm-retry" disabled={!online || Boolean(pendingAction)} onClick={onRetry}>Retry last question</button>}
      <div className="lm-composer">
        <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder="Ask about your finances…" rows={1} maxLength={12000} disabled={Boolean(providerDisabledReason) || sending || syncStatus === "loading" || Boolean(pendingAction)} aria-label="Message LedgerMate AI" />
        <button className="lm-send-button" type="submit" aria-label="Send message" disabled={!input.trim() || !online || checking || sending || syncStatus === "loading" || Boolean(pendingAction)}>{sending ? <LoaderCircle className="lm-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}</button>
      </div>
      <div className="lm-composer-hint"><span>Enter to send <kbd>↵</kbd><span className="lm-hint-divider">·</span>Shift + Enter for a new line</span><span>AI can make mistakes. Verify important records.</span></div>
    </form>
  </section>
);
