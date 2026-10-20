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
} from "lucide-react";
import { getSavedTheme, applyTheme, ThemePreference } from "../../lib/theme";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import { APP_NAME } from "../../config/app";

export const Header: React.FC = () => {
  const { organization, user, lock, signOut, hasPinSetup, isDemoMode, exitDemoMode } = useAuth();
  const { setCurrentView } = useApp();
  const { t, dir } = useI18n();

  const [theme, setTheme] = useState<ThemePreference>(() => getSavedTheme());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const displayName = getProfileDisplayName(user, organization.owner_name, t("header.owner"));
  const menuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

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
    <header className="app-header" dir={dir}>
      <div className="workspace-name">
        <span className="workspace-brand md:hidden">{APP_NAME}</span>
        <span
          className={`network-status-dot ${isOnline ? "network-status-dot--online" : "network-status-dot--offline"}`}
          role="status"
          aria-label={isOnline ? "Online" : "Offline"}
          title={isOnline ? "Online" : "Offline"}
        />
      </div>

      <div className="header-actions">
        <div className="relative" ref={menuRef}>
          <button
            ref={profileButtonRef}
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-controls="profile-menu"
            aria-label={t("header.openAccountMenu")}
            className="profile-trigger"
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
              className="absolute end-0 z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              <div className="border-b border-line px-3 py-2">
                <p className="truncate text-xs font-bold text-ink">
                  {displayName}
                </p>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setIsMenuOpen(false);
                  }}
                  className="profile-menu-action"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-muted" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4 text-muted" aria-hidden="true" />
                  )}
                  <span>{t("landing.switchTheme")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setCurrentView("settings");
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-2"
                >
                  <Settings className="h-3.5 w-3.5 text-muted" />
                  <span>{t("header.profileSettings")}</span>
                </button>

                {hasPinSetup && !isDemoMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      lock();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink transition hover:bg-surface-2"
                  >
                    <LockKeyhole className="h-3.5 w-3.5 text-muted" />
                    <span>{t("header.lockRegister")}</span>
                  </button>
                )}
              </div>

              <div className="border-t border-line pt-1">
                {isDemoMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void exitDemoMode();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-forest transition hover:bg-good-bg"
                  >
                    <LogOut className="h-3.5 w-3.5 text-forest" />
                    <span>{t("header.exitDemoSandbox")}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void signOut();
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger-bg"
                  >
                    <LogOut className="h-3.5 w-3.5 text-danger" />
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
