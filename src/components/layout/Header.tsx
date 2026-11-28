import React from "react";
import { LockKeyhole, Settings2, LogOut, Sun, Moon, ChevronDown } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";
import { useTheme } from "../../design-system/useTheme";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "../ui/dropdown-menu";
import { WorkspaceSearch } from "./WorkspaceSearch";

export const Header: React.FC = () => {
  const { organization, user, lock, signOut, hasPinSetup, isDemoMode, exitDemoMode } = useAuth();
  const { setCurrentView } = useApp();
  const { t, dir } = useI18n();
  const [theme, setTheme] = useTheme();
  const name = getProfileDisplayName(user, organization.owner_name, t("header.owner"));
  return <header className="sp-topbar" dir={dir}>
    <WorkspaceSearch />
    <div className="sp-topbar-actions">
      <button type="button" className="icon-button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="sp-profile" aria-label={t("header.openAccountMenu")}><UserAvatar src={user?.avatar_url} name={name} size="sm" /><ChevronDown size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel><strong className="block truncate">{name}</strong><span className="block truncate text-xs font-normal text-muted-foreground">{user?.email || organization.name}</span></DropdownMenuLabel><DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCurrentView("settings")}><Settings2 />{t("header.profileSettings")}</DropdownMenuItem>
        {hasPinSetup && !isDemoMode && <DropdownMenuItem onSelect={lock}><LockKeyhole />{t("header.lockRegister")}</DropdownMenuItem>}
        <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { void (isDemoMode ? exitDemoMode() : signOut()); }}><LogOut />{isDemoMode ? t("header.exitDemoSandbox") : t("header.signOut")}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </div>
  </header>;
};
