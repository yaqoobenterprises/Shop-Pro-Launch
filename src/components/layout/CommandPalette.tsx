import React, { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { useApp, type AppView } from "../../context/AppContext";
import {
  BarChart3,
  HelpCircle,
  LayoutDashboard,
  Landmark,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  X,
} from "lucide-react";

export const CommandPalette: React.FC = () => {
  const { t } = useI18n();
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setCurrentView,
    setIsQuickExpenseOpen,
    setIsShortcutsHelpOpen,
  } = useApp();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isCommandPaletteOpen) setQuery("");
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const pages: Array<{
    label: string;
    view: AppView;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { label: t("nav.ledger"), view: "chat", icon: MessageSquare },
    { label: t("nav.overview"), view: "dashboard", icon: LayoutDashboard },
    { label: t("nav.entries"), view: "sales", icon: Receipt },
    { label: t("nav.reports"), view: "reports", icon: BarChart3 },
    { label: t("nav.accounts"), view: "accounts", icon: Landmark },
    { label: t("nav.settings"), view: "settings", icon: Settings },
  ];
  const filteredPages = pages.filter((page) =>
    page.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  const navigateTo = (view: AppView) => {
    setCurrentView(view);
    setIsCommandPaletteOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-50 flex items-start justify-center bg-on-surface/35 p-4 pt-20 backdrop-blur-[2px]"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        onClick={() => setIsCommandPaletteOpen(false)}
        aria-label={t("common.cancel")}
      />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border-standard bg-surface-bright shadow-level-2">
        <h2 id="command-palette-title" className="sr-only">{t("command.title")}</h2>
        <div className="flex items-center border-b border-border-standard px-3">
          <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            aria-label={t("command.searchScreens")}
            placeholder={t("command.searchScreens")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-12 w-full bg-transparent px-3 font-sans text-sm text-on-surface placeholder:text-text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsCommandPaletteOpen(false)}
            aria-label={t("common.cancel")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-container-low hover:text-on-surface"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {!query && (
            <section className="space-y-1 pb-2">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t("command.quickActions")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsCommandPaletteOpen(false);
                  setIsQuickExpenseOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-sm font-medium text-on-surface hover:bg-surface-container-low"
              >
                <Receipt className="h-4 w-4 text-text-muted" aria-hidden="true" />
                {t("command.recordExpense")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCommandPaletteOpen(false);
                  setIsShortcutsHelpOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-sm font-medium text-on-surface hover:bg-surface-container-low"
              >
                <HelpCircle className="h-4 w-4 text-text-muted" aria-hidden="true" />
                {t("command.shortcuts")}
              </button>
            </section>
          )}

          <section className="space-y-1 border-t border-border-standard pt-2">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t("command.quickNavigation")}
            </p>
            {filteredPages.map(({ label, view, icon: Icon }) => (
              <button
                key={view}
                type="button"
                onClick={() => navigateTo(view)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-sm font-medium text-on-surface hover:bg-surface-container-low hover:text-primary"
              >
                <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                {label}
              </button>
            ))}
            {filteredPages.length === 0 && (
              <p className="py-6 text-center text-xs text-text-muted">
                {t("command.noResults", { query })}
              </p>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-border-standard bg-surface-container-low px-4 py-2 text-[11px] text-text-muted">
          <span>{t("command.navigate")}</span>
          <span className="font-mono">{t("command.escape")}</span>
        </div>
      </div>
    </div>
  );
};
