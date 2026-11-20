import type React from "react";
import {
  BarChart3,
  LayoutDashboard,
  MessageSquareText,
  ReceiptText,
  Settings,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type { AppView } from "../../context/AppContext";
import type { TranslationKey } from "../../i18n/provider";

export interface WorkspaceNavItem {
  id: AppView;
  labelKey?: TranslationKey;
  fallbackLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface WorkspaceNavGroup {
  id: "workspace" | "insights" | "account";
  title: string;
  items: readonly WorkspaceNavItem[];
}

/**
 * Only real, currently reachable workspace screens appear here.
 * Do not label the cashbook composer as the full accrual General Ledger.
 */
export const workspaceNavGroups: readonly WorkspaceNavGroup[] = [
  {
    id: "workspace",
    title: "WORKSPACE",
    items: [
      { id: "dashboard", labelKey: "nav.overview", icon: LayoutDashboard },
      { id: "chat", labelKey: "nav.ledger", icon: MessageSquareText },
      { id: "sales", labelKey: "nav.entries", icon: ReceiptText },
      { id: "accounts", labelKey: "nav.accounts", icon: WalletCards },
    ],
  },
  {
    id: "insights",
    title: "INSIGHTS",
    items: [
      { id: "reports", labelKey: "nav.reports", icon: BarChart3 },
      { id: "ai", fallbackLabel: "LedgerMate AI", icon: Sparkles },
    ],
  },
  {
    id: "account",
    title: "ACCOUNT",
    items: [
      { id: "settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export const workspaceNavItems = workspaceNavGroups.flatMap((group) => group.items);

export const workspaceNavLabel = (
  view: AppView,
  t: (key: TranslationKey) => string,
): string => {
  const item = workspaceNavItems.find((entry) => entry.id === view);
  if (!item) return t("nav.overview");
  return item.labelKey ? t(item.labelKey) : item.fallbackLabel || t("nav.overview");
};
