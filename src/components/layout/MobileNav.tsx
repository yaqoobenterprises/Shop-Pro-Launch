import React, { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, List, MoreHorizontal, Receipt, MessageCircle, Settings, Wallet } from "lucide-react";
import { useApp, type AppView } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import { Modal } from "../common/Modal";

export const MobileNav: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { t } = useI18n();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const primaryItems = [
    { id: "dashboard", label: t("nav.overview"), icon: LayoutDashboard },
    { id: "chat", label: t("nav.ledger"), icon: Receipt },
    { id: "sales", label: t("nav.entries"), icon: List },
    { id: "accounts", label: t("nav.accounts"), icon: Wallet },
  ] as const;
  const secondaryItems = [
    { id: "reports", label: t("nav.reports"), icon: BarChart3 },
    { id: "ai", label: "LedgerMate AI", icon: MessageCircle },
    { id: "settings", label: t("nav.settings"), icon: Settings },
  ] as const;
  const moreActive = secondaryItems.some(item => item.id === currentView);

  useEffect(() => { setIsMoreOpen(false); }, [currentView]);
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 768px)");
    const closeOnDesktop = () => { if (media?.matches) setIsMoreOpen(false); };
    media?.addEventListener?.("change", closeOnDesktop);
    return () => media?.removeEventListener?.("change", closeOnDesktop);
  }, []);

  const navigate = (view: AppView) => {
    setIsMoreOpen(false);
    setCurrentView(view);
  };

  return (
    <nav aria-label="Main navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border-standard bg-surface-bright md:hidden">
      {primaryItems.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" aria-label={label}
          aria-current={currentView === id ? "page" : undefined}
          onClick={() => navigate(id)} className="mobile-nav-item">
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" aria-haspopup="dialog" aria-expanded={isMoreOpen}
        aria-current={moreActive ? "true" : undefined}
        aria-label="More navigation options" onClick={() => setIsMoreOpen(true)}
        className="mobile-nav-item">
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span>{t("nav.more")}</span>
      </button>
      <Modal isOpen={isMoreOpen} title="More navigation" onClose={() => setIsMoreOpen(false)} maxWidth="sm">
        <div className="grid gap-1">
          {secondaryItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-current={currentView === id ? "page" : undefined}
              onClick={() => navigate(id)}
              className="flex min-h-12 items-center gap-3 rounded-md px-3 text-start text-sm text-on-surface hover:bg-surface-container-low aria-[current=page]:bg-primary/10 aria-[current=page]:font-semibold">
              <Icon className="h-5 w-5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </Modal>
    </nav>
  );
};
