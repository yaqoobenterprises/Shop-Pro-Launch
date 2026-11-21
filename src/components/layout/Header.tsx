import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import {
  LockKeyhole,
  Settings,
  LogOut,
  Sun,
  Moon,
  Search,
} from "lucide-react";
import { getSavedTheme, applyTheme, ThemePreference } from "../../lib/theme";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import { APP_NAME } from "../../config/app";
import "./WorkspaceChrome.css";
import "./WorkspacePastel.css";

export const Header: React.FC = () => {
  const { organization, user, lock, signOut, hasPinSetup, isDemoMode, exitDemoMode } = useAuth();
  const { currentView, setCurrentView, setIsCommandPaletteOpen } = useApp();
  const { t, dir } = useI18n();

  const [theme, setTheme] = useState<ThemePreference>(() => getSavedTheme());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const displayName = getProfileDisplayName(user, organization.owner_name, t("header.owner"));
  const menuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  const pageTitle = currentView === "dashboard" ? t("nav.overview")
    : currentView === "sales" ? t("nav.entries")
    : currentView === "chat" ? t("nav.ledger")
    : currentView === "ai" ? "LedgerMate AI"
    : currentView === "reports" ? t("nav.reports")
    : currentView === "aqvora-cash-collections" ? "Cash collections"
    : currentView === "aqvora-receipt-drafts" ? "Customer receipts"
    : currentView === "aqvora-sales-lifecycle" ? "Invoice approvals"
    : currentView === "aqvora-gl-tb" ? "GL & Trial Balance"
    : currentView === "aqvora-sales-drafts" ? "Service drafts"
    : currentView === "aqvora-receivables" ? "Receivables"
    : currentView === "accounts" ? t("nav.accounts")
    : t("nav.settings");

  const toggleTheme = () => {
    const nextTheme: ThemePreference = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMenuOpen) {
        setIsMenuOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  return (
    <header className="app-header workspace-header" dir={dir}>
      <div className="workspace-context">
        <div className="workspace-context__copy">
          <span className="workspace-context__eyebrow">AQVORA <span aria-hidden="true">/</span> WORKSPACE</span>
          <span className="workspace-context__title">{pageTitle}</span>
        </div>
      </div>

      <div className="header-actions workspace-header__actions">
        <div
          className={`connection-pill ${isOnline ? "connection-pill--online" : "connection-pill--offline"}`}
          role="status"
          aria-label={isOnline ? "Online" : "Offline"}
          title={isOnline ? "Internet connection available" : "Working offline"}
        >
          <span className={`network-status-dot ${isOnline ? "network-status-dot--online" : "network-status-dot--offline"}`} aria-hidden="true" />
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>

        <button
          type="button"
          className="header-search-trigger"
          onClick={() => setIsCommandPaletteOpen(true)}
          aria-label="Search workspace"
          title="Search workspace (Ctrl+K)"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Search</span>
          <kbd>Ctrl K</kbd>
        </button>

        <button
          type="button"
          className="header-icon-button"
          onClick={toggleTheme}
          aria-label={t("landing.switchTheme")}
          title={t("landing.switchTheme")}
        >
          {theme === "dark"
            ? <Sun className="h-4 w-4" aria-hidden="true" />
            : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            ref={profileButtonRef}
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-controls="profile-menu"
            aria-label={t("header.openAccountMenu")}
            className="profile-trigger workspace-profile-trigger"
          >
            <UserAvatar
              src={user?.avatar_url}
              name={displayName}
              size="md"
              showBorder
            />
          </button>

          {isMenuOpen && (
            <div
              id="profile-menu"
              className="header-profile-menu absolute end-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              <div className="header-profile-menu__identity">
                <strong className="truncate">{displayName}</strong>
                <span className="truncate">{user?.email || organization.name || APP_NAME}</span>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setCurrentView("settings");
                  }}
                  className="profile-menu-action"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  <span>{t("header.profileSettings")}</span>
                </button>

                {hasPinSetup && !isDemoMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      lock();
                    }}
                    className="profile-menu-action"
                  >
                    <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                    <span>{t("header.lockRegister")}</span>
                  </button>
                )}
              </div>

              <div className="header-profile-menu__footer">
                {isDemoMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void exitDemoMode();
                    }}
                    className="profile-menu-action profile-menu-action--success"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span>{t("header.exitDemoSandbox")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void signOut();
                    }}
                    className="profile-menu-action profile-menu-action--danger"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span>{t("header.signOut")}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
