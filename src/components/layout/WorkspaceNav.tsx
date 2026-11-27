import React from "react";
import { LayoutDashboard, Wallet, BookOpenText, List, ChartNoAxesCombined, MessageCircle, Settings } from "lucide-react";
import { useApp, type AppView } from "../../context/AppContext";
import { isFeatureEnabled } from "../../config/features";
import { useI18n } from "../../i18n";

/** One desktop navigation row; the existing mobile More menu covers every route. */
export const WorkspaceNav: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { t } = useI18n();
  const items = [
    { id: "dashboard", label: t("nav.overview"), Icon: LayoutDashboard },
    { id: "chat", label: t("nav.ledger"), Icon: BookOpenText },
    { id: "sales", label: t("nav.entries"), Icon: List },
    { id: "accounts", label: t("nav.accounts"), Icon: Wallet },
    { id: "reports", label: t("nav.reports"), Icon: ChartNoAxesCombined },
    ...(isFeatureEnabled("chatQueries") ? [{ id: "ai", label: "LedgerMate", Icon: MessageCircle }] : []),
    { id: "settings", label: t("nav.settings"), Icon: Settings },
  ];
  return <nav className="clarity-nav" aria-label="Main navigation">
    <div>{items.map(({ id, label, Icon }) => <button type="button" key={id}
      aria-current={currentView === id ? "page" : undefined}
      onClick={() => setCurrentView(id as AppView)}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </button>)}</div>
  </nav>;
};
