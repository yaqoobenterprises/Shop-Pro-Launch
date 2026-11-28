import React, { useEffect, useRef, useState } from "react";
import { Search, X, ReceiptText } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { useWorkspaceSearch } from "./useWorkspaceSearch";
import { navigation } from "./navigation";
import { formatPaisa } from "../../lib/money";
import { TransactionDetailModal } from "../common/TransactionDetailModal";
import type { Transaction } from "../../types/ledger";

/** Results occupy header space; no modal, popover or body portal. */
export function WorkspaceSearch() {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setCurrentView, startNewEntry } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const expanded = query.trim().length > 0;
  const search = useWorkspaceSearch(query, expanded);
  const routes = navigation.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const clear = () => { setQuery(""); setIsCommandPaletteOpen(false); };
  useEffect(() => { if (isCommandPaletteOpen) { input.current?.focus(); setIsCommandPaletteOpen(false); } }, [isCommandPaletteOpen, setIsCommandPaletteOpen]);
  return <div className="sp-workspace-search">
    <form className="sp-search-field" role="search" onSubmit={event => { event.preventDefault(); results.current?.querySelector<HTMLButtonElement>("button")?.focus(); }}>
      <Search size={18} aria-hidden="true" />
      <input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an entry or page" aria-label="Search workspace" aria-controls={expanded ? "workspace-search-results" : undefined} aria-expanded={expanded} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); clear(); }
        if (event.key === "ArrowDown") { event.preventDefault(); results.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
      }} />
      {expanded && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => { clear(); input.current?.focus(); }}><X size={16} /></button>}
    </form>
    {expanded && <div ref={results} id="workspace-search-results" className="sp-search-results" aria-label="Search results" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); clear(); input.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    }}>
      {routes.length > 0 && <div className="sp-search-pages">{routes.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { clear(); setCurrentView(id); }}><Icon size={17} />{label}</button>)}</div>}
      {/new|add|entry/i.test(query) && <button type="button" onClick={() => { clear(); startNewEntry(); }}>New entry</button>}
      {search.loading && <p role="status">Finding entries…</p>}
      {search.error && <p role="status">{search.error}</p>}
      {search.rows.map(tx => <button type="button" key={tx.id} className="sp-search-entry" onClick={() => { clear(); setSelected(tx); }}><ReceiptText size={18} /><span><strong>{tx.note || tx.raw_text}</strong><small>{tx.business_date} · {tx.account_name || tx.category_name}</small></span><b className="num">{formatPaisa(tx.amount_paisa, { showPaisaIfFraction: true })}</b></button>)}
      {!routes.length && !search.loading && !search.error && !search.rows.length && <p role="status">No matches. Try a description or note.</p>}
    </div>}
    <TransactionDetailModal isOpen={Boolean(selected)} transaction={selected} onClose={() => setSelected(null)} />
  </div>;
}
