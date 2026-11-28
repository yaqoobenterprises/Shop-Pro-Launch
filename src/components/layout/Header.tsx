import React, { useEffect, useState } from "react";
import { ChevronRight, LockKeyhole, Settings2, LogOut, Sun, Moon, Search, ChevronDown, Building2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import { useTheme } from "../../design-system/useTheme";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "../ui/dropdown-menu";
import { navigation } from "./navigation";

export const Header: React.FC = () => {
  const { organization, user, lock, signOut, hasPinSetup, isDemoMode, exitDemoMode } = useAuth();
  const { currentView, setCurrentView, setIsCommandPaletteOpen } = useApp();
  const { t, dir } = useI18n();
  const [theme, setTheme] = useTheme();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const name = getProfileDisplayName(user, organization.owner_name, t("header.owner"));
  return <header className="sp-topbar" dir={dir}>
    <nav className="sp-breadcrumb" aria-label="Breadcrumb"><Building2 size={17} aria-hidden="true" /><span>{organization.name}</span><ChevronRight size={14} aria-hidden="true" /><strong aria-current="page">{navigation.find(n => n.id === currentView)?.label}</strong></nav>
    <div className="sp-topbar-actions">
      <button type="button" className="sp-search" aria-label="Search workspace" onClick={() => setIsCommandPaletteOpen(true)}><Search size={17} /><span>Search workspace</span><kbd>Ctrl K</kbd></button>
      <span className={`sp-connection ${online ? "is-online" : ""}`} role="status" aria-label={online ? "Online" : "Offline"}><i /> <span>{online ? "Online" : "Offline"}</span></span>
      <button type="button" className="icon-button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="sp-profile" aria-label={t("header.openAccountMenu")}><UserAvatar src={user?.avatar_url} name={name} size="sm" /><ChevronDown size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel><strong className="block truncate">{name}</strong><span className="block truncate text-xs font-normal text-muted-foreground">{user?.email || organization.name}</span></DropdownMenuLabel><DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCurrentView("settings")}><Settings2 />{t("header.profileSettings")}</DropdownMenuItem>
        {hasPinSetup && !isDemoMode && <DropdownMenuItem onSelect={lock}><LockKeyhole />{t("header.lockRegister")}</DropdownMenuItem>}
        <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { void (isDemoMode ? exitDemoMode() : signOut()); }}><LogOut />{isDemoMode ? t("header.exitDemoSandbox") : t("header.signOut")}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
  </header>;
};
