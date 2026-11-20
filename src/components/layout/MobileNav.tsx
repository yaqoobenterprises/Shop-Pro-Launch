import React, { useEffect, useRef, useState } from "react";
import { BarChart3, LayoutDashboard, LockKeyhole, MoreHorizontal, Plus, ReceiptText, Settings, Sparkles, WalletCards } from "lucide-react";
import { useApp, type AppView } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import "./NavigationPremium.css";

const dockItems = [
  { id: "dashboard", key: "nav.overview", icon: LayoutDashboard },
  { id: "sales", key: "nav.entries", icon: ReceiptText },
  { id: "new", key: null, icon: Plus },
  { id: "reports", key: "nav.reports", icon: BarChart3 },
] as const;

export const MobileNav: React.FC = () => {
  const { currentView, setCurrentView, startNewEntry } = useApp();
  const { lock, hasPinSetup, isDemoMode } = useAuth();
  const { t } = useI18n();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMoreOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
        moreRef.current?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [isMoreOpen]);

  const navigate = (view: AppView) => {
    setCurrentView(view);
    setIsMoreOpen(false);
  };

  const moreActive = currentView === "accounts" || currentView === "ai" || currentView === "settings";
  return (
    <nav aria-label="Mobile navigation" className="mobile-bottom-nav aq-mobile-nav fixed inset-x-0 bottom-0 z-40 grid border-t md:hidden">
      {dockItems.map(({ id, key, icon: Icon }) => {
        const isNew = id === "new";
        const active = currentView === (isNew ? "chat" : id);
        const label = isNew ? "New entry" : t(key!);
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`aq-mobile-nav__item ${isNew ? "aq-mobile-nav__item--new" : ""}`}
            onClick={() => {
              if (isNew) {
                startNewEntry();
                setIsMoreOpen(false);
              } else {
                navigate(id);
              }
            }}
          >
            <span className="aq-mobile-nav__icon"><Icon size={20} strokeWidth={1.85} aria-hidden="true" /></span>
            <span className="aq-mobile-nav__label">{isNew ? "New" : label}</span>
          </button>
        );
      })}
      <div className="aq-mobile-nav__more-wrap">
        {isMoreOpen && (
          <>
            <button type="button" className="aq-mobile-nav__backdrop" aria-label="Close navigation menu"
              onClick={() => { setIsMoreOpen(false); moreRef.current?.focus(); }} />
            <div id="aq-mobile-more" className="aq-mobile-nav__menu" aria-label="More workspace pages">
              {([
                { id: "accounts", label: t("nav.accounts"), icon: WalletCards },
                { id: "ai", label: "LedgerMate AI", icon: Sparkles },
                { id: "settings", label: t("nav.settings"), icon: Settings },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button type="button" key={id} aria-current={currentView === id ? "page" : undefined}
                  onClick={() => navigate(id)}>
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
              {hasPinSetup && !isDemoMode && (
                <button type="button" onClick={() => { setIsMoreOpen(false); lock(); }}>
                  <LockKeyhole size={18} aria-hidden="true" />{t("nav.lockRegister")}
                </button>
              )}
            </div>
          </>
        )}
        <button ref={moreRef} type="button" className="aq-mobile-nav__item" aria-label="More navigation options"
          aria-expanded={isMoreOpen} aria-controls={isMoreOpen ? "aq-mobile-more" : undefined}
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setIsMoreOpen((open) => !open)}>
          <span className="aq-mobile-nav__icon"><MoreHorizontal size={20} aria-hidden="true" /></span>
          <span className="aq-mobile-nav__label">{t("nav.more")}</span>
        </button>
      </div>
    </nav>
  );
};
