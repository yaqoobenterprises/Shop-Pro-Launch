import React from "react";
import { useApp, AppView } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import { APP_NAME } from "../../config/app";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import {
  MessageSquare,
  LayoutDashboard,
  Receipt,
  BarChart3,
  Settings,
  Lock,
  Wallet,
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { lock, hasPinSetup, organization, user } = useAuth();
  const { t } = useI18n();

  const navItems: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: t("nav.overview"), icon: LayoutDashboard },
    { id: "sales", label: t("nav.entries"), icon: Receipt },
    { id: "chat", label: t("nav.ledger"), icon: MessageSquare },
    { id: "reports", label: t("nav.reports"), icon: BarChart3 },
    { id: "accounts", label: t("nav.accounts"), icon: Wallet },
  ];

  const displayName = getProfileDisplayName(user, organization.owner_name);

  return (
    <aside className="sidebar hidden md:flex">
      <div className="side-brand">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-copy min-w-0">
            <strong className="truncate">{APP_NAME}</strong>
          </div>
        </div>
      </div>

      <nav aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={isActive ? "active" : ""}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setCurrentView(item.id)}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={currentView === "settings" ? "active" : ""}
          onClick={() => setCurrentView("settings")}
        >
          <Settings className="h-4 w-4" />
          <span>{t("nav.settings")}</span>
        </button>

        {hasPinSetup && (
          <button type="button" onClick={lock} title={t("nav.lockRegister")}>
            <Lock className="h-4 w-4" />
            <span>{t("nav.lockRegister")}</span>
          </button>
        )}

        <button
          type="button"
          className="user-card"
          onClick={() => setCurrentView("settings")}
          aria-label={`Open profile and settings for ${displayName}`}
          title="Open profile and settings"
        >
          <UserAvatar src={user?.avatar_url} name={displayName} size="sm" />
          <span className="user-card-copy">
            <strong>{displayName}</strong>
            {user?.email && <small>{user.email}</small>}
          </span>
        </button>
      </div>
    </aside>
  );
};
