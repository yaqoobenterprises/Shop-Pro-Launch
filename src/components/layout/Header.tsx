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
  Monitor,
  Search,
  Plus,
} from "lucide-react";
import { nextThemePreference, setThemePreference } from "../../lib/theme";
import { useThemePreference } from "../../lib/useThemePreference";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import { resolveWorkspaceSearch, WORKSPACE_TRANSACTION_SEARCH } from "../../lib/workspaceSearch";
import { emptyTransactionView } from "../../lib/transactionViewState";
import { APP_NAME } from "../../config/app";
import "./WorkspaceChrome.css";
import "./WorkspacePastel.css";

export const Header: React.FC = () => {
  const { organization, user, lock, signOut, hasPinSetup, isDemoMode, exitDemoMode } = useAuth();
  const { currentView, setCurrentView, saveTransactionView, startNewEntry } = useApp();
  const { t, dir } = useI18n();

  const [search,setSearch] = useState("");
  const submitSearch = (event:React.FormEvent) => {
    event.preventDefault();
    const result=resolveWorkspaceSearch(search);
    if(!result)return;
    if(result.view==="sales") {
      saveTransactionView({...emptyTransactionView(),searchQuery:result.query,appliedSearch:result.query});
      if(currentView==="sales") window.dispatchEvent(new CustomEvent(WORKSPACE_TRANSACTION_SEARCH,{detail:result.query}));
    }
    setCurrentView(result.view); setSearch("");
  };
  const theme = useThemePreference();
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
    : currentView === "accounts" ? t("nav.accounts")
    : t("nav.settings");

  const toggleTheme = () => {
    setThemePreference(nextThemePreference(theme));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMenuOpen && !event.defaultPrevented) {
        event.preventDefault();
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

  useEffect(() => { setIsMenuOpen(false); }, [currentView]);

  useEffect(() => {
    if (isMenuOpen) menuRef.current?.querySelector<HTMLButtonElement>("#profile-menu button")?.focus();
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
          <span className="workspace-context__title">{organization.name || APP_NAME}</span>
          <span className="sr-only">Current page: {pageTitle}</span>
        </div>
      </div>

      <div className="header-actions workspace-header__actions">
        <div
          className={`connection-pill ${isOnline ? "connection-pill--online" : "connection-pill--offline"}`}
          role="status"
          aria-label={isOnline ? "Network online; synchronization not verified" : "Network offline"}
          title={isOnline ? "Network available; not a confirmation of ledger synchronization" : "Network offline"}
        >
          <span className={`network-status-dot ${isOnline ? "network-status-dot--online" : "network-status-dot--offline"}`} aria-hidden="true" />
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>

        <form className="workspace-inline-search" role="search" aria-label="Workspace search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true"/>
          <input id="workspace-search" type="search" aria-label="Search workspace" placeholder="Search" value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){setSearch("");event.stopPropagation();}}}/>
          <button type="submit" aria-label="Submit search" disabled={!search.trim()}><Search size={16} aria-hidden="true"/></button>
        </form>

        <button type="button" className="header-mobile-entry" aria-label="New entry" title="New entry" onClick={startNewEntry}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="header-icon-button"
          onClick={toggleTheme}
          aria-label={t("landing.switchTheme")}
          title={`${t("landing.switchTheme")} (${theme})`}
        >
          {theme === "dark"
            ? <Sun className="h-4 w-4" aria-hidden="true" />
             : theme === "system" ? <Monitor className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>

        <div className="relative" ref={menuRef} onBlur={event => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setIsMenuOpen(false);
        }}>
          <button
            ref={profileButtonRef}
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-controls={isMenuOpen ? "profile-menu" : undefined}
            aria-label={t("header.openAccountMenu")}
            className="profile-trigger workspace-profile-trigger"
          >
            <UserAvatar
              src={user?.avatar_url}
              name={displayName}
              size="md"
            />
          </button>

          {isMenuOpen && (
            <div
              id="profile-menu"
              role="group"
              aria-label="Account options"
              className="header-profile-menu absolute end-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              <div className="header-profile-menu__identity">
                <strong className="truncate">{displayName}</strong>
                <span className="truncate">{user?.email || organization.name || APP_NAME}</span>
              </div>

              <div className="py-1">
                <button type="button" className="profile-menu-action md:hidden" onClick={toggleTheme}>
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  <span>Appearance: {theme}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    profileButtonRef.current?.focus();
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
