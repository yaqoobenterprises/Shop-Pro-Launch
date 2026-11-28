import { BookOpenText, ChartNoAxesCombined, LayoutDashboard, ListFilter, MessageCircle, Settings2, WalletCards } from "lucide-react";
import type { AppView } from "../../context/AppContext";
import { isFeatureEnabled } from "../../config/features";
export const navigation: { id: AppView; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { id: "chat", label: "Cashbook", icon: BookOpenText, group: "Workspace" },
  { id: "sales", label: "Entries", icon: ListFilter, group: "Workspace" },
  { id: "accounts", label: "Accounts", icon: WalletCards, group: "Workspace" },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined, group: "Insights" },
  ...(isFeatureEnabled("chatQueries") ? [{ id: "ai" as AppView, label: "LedgerMate", icon: MessageCircle, group: "Insights" }] : []),
  { id: "settings", label: "Settings", icon: Settings2, group: "Manage" },
];
