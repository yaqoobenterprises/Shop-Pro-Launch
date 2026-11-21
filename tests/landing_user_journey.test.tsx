import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingPage } from "../src/components/landing/LandingPage";

vi.mock("../src/lib/theme", () => ({
  getSavedTheme: vi.fn(() => "light"),
  applyTheme: vi.fn(),
}));

vi.mock("../src/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => ({
      "landing.switchTheme": "Switch theme",
      "landing.signIn": "Sign in",
    }[key] || key),
  }),
}));

afterEach(() => vi.restoreAllMocks());

describe("AQVORA landing → authentication journey", () => {
  it("routes primary account creation, header sign-in and footer sign-in into real auth modes", () => {
    const onOpenAuth = vi.fn();
    render(<LandingPage onOpenAuth={onOpenAuth} onTryDemo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Create your account" }));
    expect(onOpenAuth).toHaveBeenLastCalledWith("signUp");
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    expect(onOpenAuth).toHaveBeenLastCalledWith("signIn");
    fireEvent.click(screen.getAllByRole("button", { name: "Get started" })[0]);
    expect(onOpenAuth).toHaveBeenLastCalledWith("signUp");
  });

  it("labels all displayed financial figures and activity as illustrative", () => {
    render(<LandingPage onOpenAuth={vi.fn()} onTryDemo={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Sample accounting workspace" })).toBeTruthy();
    expect(screen.getByText("Sample data")).toBeTruthy();
    expect(screen.getByText(/Illustration only/)).toBeTruthy();
    const table = screen.getByRole("table", { name: /Illustrative monthly income/ });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(screen.getByText(/General ledger, invoicing, inventory and payroll are in development/)).toBeTruthy();
  });

  it("launches demo once and prevents duplicate requests until it resolves", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const onTryDemo = vi.fn(() => gate);
    render(<LandingPage onOpenAuth={vi.fn()} onTryDemo={onTryDemo} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore demo" }));
    expect(onTryDemo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Opening demo…" }).hasAttribute("disabled")).toBe(true);
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Explore demo" }).hasAttribute("disabled")).toBe(false));
  });

  it("shows a recoverable failure if demo entry fails", async () => {
    render(<LandingPage onOpenAuth={vi.fn()} onTryDemo={vi.fn(async () => { throw new Error("offline"); })} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore demo" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/demo could not open/i);
    expect(screen.getByRole("button", { name: "Explore demo" }).hasAttribute("disabled")).toBe(false);
  });

  it("offers keyboard-friendly theme, navigation and a skip link", () => {
    render(<LandingPage onOpenAuth={vi.fn()} onTryDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Switch theme" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Page navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main-content");
  });
});
