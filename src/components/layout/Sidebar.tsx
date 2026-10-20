import React from "react";
import { useApp, AppView } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "../../i18n";
import { APP_NAME } from "../../config/app";
import { getProfileDisplayName } from "../../lib/profileDisplay";
import { UserAvatar } from "../common/UserAvatar";
import "./Sidebar.css";
import {
  BarChart3,
  LayoutDashboard,
  Lock,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Wallet,
} from "lucide-react";

const SIDEBAR_WIDTH_KEY = "shop-pro.sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "shop-pro.sidebar-collapsed";
const MIN_SIDEBAR_WIDTH = 208;
const MAX_SIDEBAR_WIDTH = 360;
const DEFAULT_SIDEBAR_WIDTH = 244;
const COLLAPSED_SIDEBAR_WIDTH = 56;
const COLLAPSE_SIDEBAR_AT = 176;
const EXPAND_SIDEBAR_AT = 220;

const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

const readSidebarWidth = () => {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
  try {
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(savedWidth) && savedWidth > 0
      ? clampSidebarWidth(savedWidth)
      : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
};

const readSidebarCollapsed = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};

export const Sidebar: React.FC = () => {
  const { currentView, setCurrentView } = useApp();
  const { lock, hasPinSetup, isDemoMode, organization, user } = useAuth();
  const { t } = useI18n();
  const [sidebarWidth, setSidebarWidth] = React.useState(readSidebarWidth);
  const [isCollapsed, setIsCollapsed] = React.useState(readSidebarCollapsed);
  const [isResizing, setIsResizing] = React.useState(false);
  const sidebarWidthRef = React.useRef(sidebarWidth);
  const resizeStart = React.useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    isRtl: boolean;
  } | null>(null);

  const navItems: { id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: t("nav.overview"), icon: LayoutDashboard },
    { id: "sales", label: t("nav.entries"), icon: Receipt },
    { id: "chat", label: t("nav.ledger"), icon: MessageSquare },
    { id: "reports", label: t("nav.reports"), icon: BarChart3 },
    { id: "accounts", label: t("nav.accounts"), icon: Wallet },
  ];

  const displayName = getProfileDisplayName(user, organization.owner_name);
  const toggleLabel = isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");

  const saveSidebarWidth = (width: number) => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      // The sidebar remains resizable for this session when storage is unavailable.
    }
  };

  const updateSidebarWidth = (width: number, persist = false) => {
    const nextWidth = clampSidebarWidth(width);
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
    if (persist) saveSidebarWidth(nextWidth);
  };

  const persistCollapsedState = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Keep the selected layout for this session when storage is unavailable.
    }
  };

  const toggleCollapsed = () => persistCollapsedState(!isCollapsed);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isCollapsed) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStart.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidthRef.current,
      isRtl: document.documentElement.dir === "rtl",
    };
    setIsResizing(true);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const pointerDelta = start.isRtl ? start.startX - event.clientX : event.clientX - start.startX;
    const requestedWidth = start.startWidth + pointerDelta;

    if (!isCollapsed && requestedWidth <= COLLAPSE_SIDEBAR_AT) {
      persistCollapsedState(true);
    } else if (isCollapsed && requestedWidth >= EXPAND_SIDEBAR_AT) {
      persistCollapsedState(false);
      updateSidebarWidth(requestedWidth);
    } else if (!isCollapsed) {
      updateSidebarWidth(requestedWidth);
    }
  };

  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    resizeStart.current = null;
    setIsResizing(false);
    saveSidebarWidth(sidebarWidthRef.current);
  };

  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const isRtl = document.documentElement.dir === "rtl";
    const growKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const shrinkKey = isRtl ? "ArrowRight" : "ArrowLeft";

    if (event.key === growKey) {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth + 16, true);
    } else if (event.key === shrinkKey) {
      event.preventDefault();
      updateSidebarWidth(sidebarWidth - 16, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateSidebarWidth(MIN_SIDEBAR_WIDTH, true);
    } else if (event.key === "End") {
      event.preventDefault();
      updateSidebarWidth(MAX_SIDEBAR_WIDTH, true);
    }
  };

  return (
    <aside
      id="app-sidebar"
      className={`sidebar hidden md:flex${isCollapsed ? " is-collapsed" : ""}${isResizing ? " is-resizing" : ""}`}
      data-collapsed={isCollapsed}
      style={{ "--sidebar-width": `${isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth}px` } as React.CSSProperties}
    >
      <div className="side-brand">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-copy min-w-0" data-sidebar-label>
            <strong className="truncate">{APP_NAME}</strong>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={toggleLabel}
          aria-expanded={!isCollapsed}
          title={toggleLabel}
        >
          {isCollapsed
            ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <nav id="primary-navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={isActive ? "active" : ""}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              title={isCollapsed ? item.label : undefined}
              onClick={() => setCurrentView(item.id)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span data-sidebar-label>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className={currentView === "settings" ? "active" : ""}
          aria-label={t("nav.settings")}
          title={isCollapsed ? t("nav.settings") : undefined}
          onClick={() => setCurrentView("settings")}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span data-sidebar-label>{t("nav.settings")}</span>
        </button>

        {hasPinSetup && !isDemoMode && (
          <button
            type="button"
            onClick={lock}
            aria-label={t("nav.lockRegister")}
            title={isCollapsed ? t("nav.lockRegister") : undefined}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            <span data-sidebar-label>{t("nav.lockRegister")}</span>
          </button>
        )}

        <button
          type="button"
          className={`user-card${isDemoMode ? " user-card--demo" : ""}`}
          onClick={() => setCurrentView("settings")}
          aria-label={`${t("nav.profileSettings")}: ${displayName}`}
          title={isCollapsed ? t("nav.profileSettings") : undefined}
        >
          <UserAvatar
            src={user?.avatar_url}
            name={displayName}
            size="md"
            showBorder
          />
          {isDemoMode && !isCollapsed && (
            <span className="user-card-copy" data-sidebar-label>
              <strong>Jamal Yaqoob</strong>
            </span>
          )}
        </button>
      </div>

      {(!isCollapsed || isResizing) && (
        <div
          className="sidebar-resize-handle"
          role={isCollapsed ? "presentation" : "separator"}
          aria-hidden={isCollapsed || undefined}
          aria-label={isCollapsed ? undefined : t("nav.resizeSidebar")}
          aria-orientation={isCollapsed ? undefined : "vertical"}
          aria-valuemin={isCollapsed ? undefined : MIN_SIDEBAR_WIDTH}
          aria-valuemax={isCollapsed ? undefined : MAX_SIDEBAR_WIDTH}
          aria-valuenow={isCollapsed ? undefined : sidebarWidth}
          tabIndex={isCollapsed ? -1 : 0}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={resizeWithKeyboard}
        />
      )}
    </aside>
  );
};
