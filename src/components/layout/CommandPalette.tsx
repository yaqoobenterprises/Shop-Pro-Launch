import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { useApp } from "../../context/AppContext";
import { BarChart3, HelpCircle, LayoutDashboard, Landmark, MessageSquare, Receipt, Search, Settings, Sparkles, Plus } from "lucide-react";
import { Modal } from "../common/Modal";

export const CommandPalette: React.FC = () => {
  const { t } = useI18n();
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setCurrentView, setIsQuickExpenseOpen, setIsShortcutsHelpOpen, startNewEntry } = useApp();
  const [query, setQuery] = useState("");
  useEffect(() => { if (isCommandPaletteOpen) setQuery(""); }, [isCommandPaletteOpen]);

  const close = () => setIsCommandPaletteOpen(false);
  const items = [
    { label: "New entry", icon: Plus, keywords: "income expense cashbook record", action: startNewEntry },
    { label: t("command.recordExpense"), icon: Receipt, keywords: "payment spend", action: () => setIsQuickExpenseOpen(true) },
    { label: t("command.shortcuts"), icon: HelpCircle, keywords: "help keys", action: () => setIsShortcutsHelpOpen(true) },
    { label: t("nav.overview"), icon: LayoutDashboard, keywords: "dashboard summary balance", action: () => setCurrentView("dashboard") },
    { label: t("nav.ledger"), icon: MessageSquare, keywords: "ledger recording", action: () => setCurrentView("chat") },
    { label: t("nav.entries"), icon: Receipt, keywords: "transactions history search", action: () => setCurrentView("sales") },
    { label: t("nav.accounts"), icon: Landmark, keywords: "bank wallet transfer", action: () => setCurrentView("accounts") },
    { label: t("nav.reports"), icon: BarChart3, keywords: "analytics charts totals", action: () => setCurrentView("reports") },
    { label: "LedgerMate AI", icon: Sparkles, keywords: "assistant intelligence", action: () => setCurrentView("ai") },
    { label: t("nav.settings"), icon: Settings, keywords: "profile security categories appearance", action: () => setCurrentView("settings") },
  ];
  const needle = query.trim().toLocaleLowerCase();
  const results = items.filter(item => (item.label + " " + item.keywords).toLocaleLowerCase().includes(needle));
  const run = (action: () => void) => { close(); action(); };

  return (
    <Modal isOpen={isCommandPaletteOpen} onClose={close} title="Find screens and actions" maxWidth="lg"
      description="Search workspace navigation and shortcuts. Transaction records are searched in Transactions.">
      <div className="grid gap-3">
        <label className="flex min-h-12 items-center gap-2 rounded-md border border-border-standard px-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input data-dialog-initial-focus type="search" aria-label="Search screens and actions"
            placeholder="Search screens and actions…" value={query} onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && results[0]) { event.preventDefault(); run(results[0].action); }
              if (event.key === "ArrowDown") { event.preventDefault(); document.getElementById("command-result-0")?.focus(); }
            }}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-on-surface" />
        </label>
        <div className="grid max-h-[45dvh] gap-1 overflow-y-auto" aria-label="Search results">
          {results.map(({ label, icon: Icon, action }, index) => (
            <button key={label} id={`command-result-${index}`} type="button" onClick={() => run(action)}
              onKeyDown={event => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const next = index + (event.key === "ArrowDown" ? 1 : -1);
                if (next < 0) document.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();
                else document.getElementById(`command-result-${Math.min(next, results.length - 1)}`)?.focus();
              }}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-start text-sm font-medium text-on-surface hover:bg-surface-container-low focus-visible:bg-surface-container-low">
              <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />{label}
            </button>
          ))}
          {!results.length && <p role="status" className="px-3 py-6 text-center text-sm text-text-muted">{t("command.noResults", { query })}</p>}
        </div>
        <p className="text-xs text-text-muted">↑ ↓ Navigate · Enter to open · Esc to close</p>
      </div>
    </Modal>
  );
};
