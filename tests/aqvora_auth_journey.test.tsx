import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  signIn: vi.fn(async (_email: string, _password: string) => ({})),
  signUp: vi.fn(async (_email: string, _password: string, _name: string, _company: string) => ({ emailConfirmationRequired: true })),
  signInWithGoogle: vi.fn(async () => ({})),
  sendPasswordReset: vi.fn(async (_email: string) => ({ message: "Check your inbox." })),
  completePasswordReset: vi.fn(async () => ({})),
  cancelPasswordReset: vi.fn(),
  resetConnectionAndSession: vi.fn(async () => undefined),
  clearError: vi.fn(),
  isPasswordRecovery: false,
  error: null as null | string,
}));

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { AuthScreen } from "../src/components/auth/LockScreen";

beforeEach(() => {
  vi.clearAllMocks();
  auth.isPasswordRecovery = false;
  auth.error = null;
});
afterEach(() => vi.restoreAllMocks());

describe("AQVORA account entry screens", () => {
  it("routes back to landing without signing out and uses approved brand artwork", () => {
    const onBack = vi.fn();
    const { container } = render(<AuthScreen initialMode="signIn" onBack={onBack} />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy();
    expect(container.querySelector(".aq-auth__brand img")?.getAttribute("src")).toBe("/assets/aqvora-symbol.svg");
    fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("shows persistent, associated names for all company sign-up inputs", async () => {
    render(<AuthScreen initialMode="signUp" />);
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("Business name")).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Test Owner" } });
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sample Company" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith("owner@example.com", "StrongPass123", "Test Owner", "Sample Company"));
    expect(screen.getByRole("heading", { name: "auth.checkEmail" })).toBeTruthy();
  });

  it("preserves existing password sign-in and password visibility", async () => {
    render(<AuthScreen initialMode="signIn" />);
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.getAttribute("type")).toBe("text");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(password, { target: { value: "CorrectPassword!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }).closest("form")?.querySelector('button[type="submit"]') as Element);
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith("owner@example.com", "CorrectPassword!"));
  });

  it("uses the existing password-reset action, not a placeholder button", async () => {
    render(<AuthScreen initialMode="signIn" />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(auth.sendPasswordReset).toHaveBeenCalledWith("owner@example.com"));
    expect((await screen.findByRole("status")).textContent).toContain("Check your inbox.");
  });

  it("shows a clear error without claiming authentication succeeded", async () => {
    auth.signIn.mockResolvedValueOnce({ error: "Please verify your email." } as never);
    render(<AuthScreen initialMode="signIn" />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SecretPass123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }).closest("form")?.querySelector('button[type="submit"]') as Element);
    expect((await screen.findByRole("alert")).textContent).toContain("Please verify your email.");
  });
});
