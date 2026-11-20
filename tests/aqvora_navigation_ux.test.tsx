import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const model = vi.hoisted(() => ({
  currentView: "dashboard" as "dashboard" | "chat" | "sales" | "reports" | "accounts" | "ai" | "settings",
  setCurrentView: vi.fn(),
  startNewEntry: vi.fn(),
  lock: vi.fn(),
  hasPinSetup: true,
  isDemoMode: true,
}));

const labels: Record<string, string> = {
  "nav.overview": "Overview",
  "nav.ledger": "Quick Entry",
  "nav.entries": "Transactions",
  "nav.reports": "Cashbook Reports",
  "nav.accounts": "Cash & Bank",
  "nav.settings": "Settings",
  "nav.lockRegister": "Lock workspace",
  "nav.more": "More",
  "nav.dockHome": "Home",
  "nav.dockEntries": "Entries",
  "nav.dockReports": "Reports",
  "nav.dockNew": "New",
  "nav.newEntry": "New entry",
  "nav.expandSidebar": "Expand sidebar",
  "nav.collapseSidebar": "Collapse sidebar",
  "nav.resizeSidebar": "Resize sidebar",
  "nav.profileSettings": "Profile & Settings",
};

vi.mock("../src/context/AppContext", () => ({
  useApp: () => ({
    ...model,
    currentView: model.currentView,
  }),
}));
vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    lock: model.lock,
    hasPinSetup: model.hasPinSetup,
    isDemoMode: model.isDemoMode,
    organization: { name: "Example Company", owner_name: "Owner" },
    user: { id: "owner", full_name: "Owner", email: "owner@example.com", role: "OWNER" },
  }),
}));
vi.mock("../src/i18n", () => ({
  useI18n: () => ({ t: (key: string) => labels[key] || key, dir: "ltr" }),
}));
vi.mock("../src/components/common/UserAvatar", () => ({
  UserAvatar: () => <span aria-hidden="true">O</span>,
}));

import { MobileNav } from "../src/components/layout/MobileNav";
import { Sidebar } from "../src/components/layout/Sidebar";
import { workspaceNavGroups, workspaceNavLabel } from "../src/components/layout/workspaceNavigation";

beforeEach(() => {
  vi.clearAllMocks();
  model.currentView = "dashboard";
  model.hasPinSetup = true;
  model.isDemoMode = true;
  window.localStorage.clear();
});

describe("AQVORA real workspace navigation", () => {
  it("has one labeled destination per existing route and doesn't present future GL as shipped", () => {
    const views = workspaceNavGroups.flatMap((group) => group.items.map((entry) => entry.id));
    expect(new Set(views).size).toBe(views.length);
    expect(views).toEqual(expect.arrayContaining(["dashboard", "chat", "sales", "accounts", "reports", "ai", "settings"]));
    expect(workspaceNavLabel("chat", (key) => labels[key])).toBe("Quick Entry");
    expect(workspaceNavLabel("reports", (key) => labels[key])).toBe("Cashbook Reports");
    expect(views).not.toContain("general-ledger");
  });

  it("keeps sidebar routes interactive in collapsed icon-rail state", () => {
    window.localStorage.setItem("shop-pro.sidebar-collapsed", "true");
    render(<Sidebar />);
    const rail = screen.getByRole("complementary");
    expect(rail.getAttribute("data-collapsed")).toBe("true");
    const nav = within(rail).getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("button", { name: "Quick Entry" })).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button", { name: "Cash & Bank" }));
    expect(model.setCurrentView).toHaveBeenCalledWith("accounts");
    fireEvent.click(within(rail).getByRole("button", { name: "Expand sidebar" }));
    expect(rail.getAttribute("data-collapsed")).toBe("false");
  });

  it("mobile New activates the existing composer rather than a placeholder view", () => {
    render(<MobileNav />);
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(nav).getAllByRole("button", { name: "New entry" })).toHaveLength(1);
    fireEvent.click(within(nav).getByRole("button", { name: "New entry" }));
    expect(model.startNewEntry).toHaveBeenCalledTimes(1);
    expect(model.setCurrentView).not.toHaveBeenCalled();
  });

  it("mobile More exposes actual accounts and AI views, closes on Escape and respects demo lock restrictions", () => {
    render(<MobileNav />);
    const more = screen.getByRole("button", { name: "More navigation options" });
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Cash & Bank" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LedgerMate AI" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock workspace" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Cash & Bank" }));
    expect(model.setCurrentView).toHaveBeenCalledWith("accounts");
  });

  it("mobile lock action is available only outside demo when a PIN exists", () => {
    model.isDemoMode = false;
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: "More navigation options" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock workspace" }));
    expect(model.lock).toHaveBeenCalledOnce();
  });
});
