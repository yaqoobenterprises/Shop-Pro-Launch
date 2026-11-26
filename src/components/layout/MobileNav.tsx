import React, { useRef, useState } from "react";
import {
  BarChart3,
  LayoutDashboard,
  List,
  LockKeyhole,
  MoreHorizontal,
  Receipt,
  MessageCircle,
  Settings,
  Wallet,
} from "lucide-react";
import { useApp, AppView } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";

const primaryItems: Array<{
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "chat", label: "Ledger", icon: Receipt },
  { id: "sales", label: "Entries", icon: List },
];

const secondaryItems: Array<{
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "ai", label: "LedgerMate AI", icon: MessageCircle },
  { id: "settings", label: "Settings", icon: Settings },
];

export const MobileNav: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { lock, hasPinSetup } = useAuth();
  const { t } = useI18n();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const isSecondaryActive = secondaryItems.some(({ id }) => id === currentView);

  const navigate = (view: AppView) => {
    setCurrentView(view);
    setIsMoreOpen(false);
  };

  return (
    <nav
      aria-label="Main navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isMoreOpen) {
          event.stopPropagation();
          setIsMoreOpen(false);
          moreButtonRef.current?.focus();
        }
      }}
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border-standard bg-surface-bright px-1 pt-1.5 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primaryItems.map(({ id, icon: Icon }) => {
        const label = id === "accounts" ? t("nav.accounts")
          : id === "chat" ? t("nav.ledger")
          : id === "dashboard" ? t("nav.overview")
          : id === "sales" ? t("nav.entries")
          : t("nav.reports");
        const isActive = currentView === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => navigate(id)}
            className={`relative z-10 flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition-colors ${
              isActive ? "bg-primary/[0.07] text-primary" : (
                "text-text-muted hover:bg-surface-container-low"
              )
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}

      <div className="relative flex justify-center">
        {isMoreOpen && (
          <>
            <button
              type="button"
              aria-label="Close navigation menu"
              className="fixed inset-0 z-0 cursor-default"
              onClick={() => setIsMoreOpen(false)}
            />
            <div
              id="mobile-more-menu"
              className="absolute bottom-[calc(100%+0.625rem)] right-1 z-10 w-56 rounded-xl border border-border-standard bg-surface-bright p-1.5 shadow-level-2"
            >
              {secondaryItems.map(({ id, icon: Icon }) => {
                const label = id === "reports" ? t("nav.reports") : id === "ai" ? "LedgerMate AI" : t("nav.settings");
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={currentView === id ? "page" : undefined}
                    onClick={() => { navigate(id); moreButtonRef.current?.focus(); }}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors ${
                      currentView === id ?
                        "bg-primary/[0.07] font-semibold text-primary"
                      : "text-on-surface hover:bg-surface-container-low"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
              {hasPinSetup && (
                <>
                  <div className="my-1 border-t border-border-standard" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      lock();
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-on-surface transition-colors hover:bg-surface-container-low"
                  >
                    <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                    {t("nav.lockRegister")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        <button
          type="button"
          ref={moreButtonRef}
          aria-expanded={isMoreOpen}
          aria-controls={isMoreOpen ? "mobile-more-menu" : undefined}
          aria-label="More navigation options"
          onClick={() => setIsMoreOpen((open) => !open)}
          className={`relative z-10 flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition-colors ${
            (
              isMoreOpen || isSecondaryActive
            ) ?
              "bg-primary/[0.07] text-primary"
            : "text-text-muted hover:bg-surface-container-low"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>{t("nav.more")}</span>
        </button>
      </div>
    </nav>
  );
};
