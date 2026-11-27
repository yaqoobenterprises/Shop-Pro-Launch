import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppProvider, useApp } from "../src/context/AppContext";
import { canNavigateWorkspace, readWorkspaceView, WORKSPACE_VIEWS, workspacePath } from "../src/lib/workspaceNavigation";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "demo-owner" } }) }));

afterEach(() => window.history.replaceState(null, "", "/"));

function Probe() {
  const { currentView, setCurrentView, startNewEntry, newEntryRequestId } = useApp();
  return <div className="app-shell">
    <output>{currentView}:{newEntryRequestId}</output>
    <button onClick={() => setCurrentView("sales")}>Transactions</button>
    <button onClick={startNewEntry}>New entry</button>
  </div>;
}

describe("workspace history", () => {
  it("round-trips only the seven supported routes", () => {
    for (const view of WORKSPACE_VIEWS) expect(readWorkspaceView(workspacePath(view))).toBe(view);
    expect(readWorkspaceView("/workspace/unknown")).toBeNull();
    expect(readWorkspaceView("/workspace/chat/extra")).toBeNull();
    expect(readWorkspaceView("/auth/callback")).toBeNull();
  });
  it("does not rewrite callback tokens or arbitrary routes", () => {
    expect(canNavigateWorkspace({pathname: "/", search: "?code=example", hash: ""})).toBe(false);
    expect(canNavigateWorkspace({pathname: "/", search: "", hash: "#access_token=example"})).toBe(false);
    expect(canNavigateWorkspace({pathname: "/auth/callback", search: "", hash: ""})).toBe(false);
    expect(canNavigateWorkspace({pathname: "/", search: "", hash: "#main-content"})).toBe(true);
  });
  it("restores initial route and browser navigation without additional history writes", () => {
    window.history.replaceState(null, "", "/workspace/reports");
    render(<AppProvider><Probe /></AppProvider>);
    expect(screen.getByText("reports:0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Transactions"}));
    expect(location.pathname).toBe("/workspace/sales");
    expect(screen.getByText("sales:0")).toBeTruthy();
    act(() => {
      history.replaceState(null, "", "/workspace/reports");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("reports:0")).toBeTruthy();
  });
  it("requests entry focus even when the cashbook is already open", () => {
    window.history.replaceState(null, "", "/workspace/chat");
    render(<AppProvider><Probe /></AppProvider>);
    const initialLength = history.length;
    fireEvent.click(screen.getByRole("button", {name: "New entry"}));
    fireEvent.click(screen.getByRole("button", {name: "New entry"}));
    expect(screen.getByText("chat:2")).toBeTruthy();
    expect(history.length).toBe(initialLength);
  });
});
