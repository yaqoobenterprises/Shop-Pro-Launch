import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mock = vi.hoisted(() => ({
  verifyMfaChallenge: vi.fn(async (_code: string) => ({ success: true, error: undefined as string | undefined })),
  cancelMfaChallenge: vi.fn(async () => undefined),
  setupPin: vi.fn(async (_pin: string) => ({ success: true, error: undefined as string | undefined })),
  unlock: vi.fn(async (_pin: string) => false),
  signOut: vi.fn(async () => undefined),
  user: { id: "owner", role: "OWNER", email: "owner@example.com", full_name: "Test Owner", avatar_url: null },
  organization: { name: "Sample", owner_name: "Test Owner" },
}));

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => mock }));
vi.mock("../src/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../src/components/common/UserAvatar", () => ({
  UserAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

import { MfaChallengeScreen } from "../src/components/auth/MfaChallengeScreen";
import { PinSetupScreen, LockScreen } from "../src/components/auth/LockScreen";

beforeEach(() => {
  vi.clearAllMocks();
  mock.unlock.mockResolvedValue(false);
  mock.verifyMfaChallenge.mockResolvedValue({ success: true, error: undefined });
});

describe("AQVORA account assurance flow", () => {
  it("submits only a normalized 6-digit MFA code and disables incomplete attempts", async () => {
    render(<MfaChallengeScreen />);
    const input = screen.getByRole("textbox", { name: "6-digit authenticator code" });
    const button = screen.getByRole("button", { name: "Verify and continue" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "12 34a56" } });
    expect((input as HTMLInputElement).value).toBe("123456");
    fireEvent.click(button);
    await waitFor(() => expect(mock.verifyMfaChallenge).toHaveBeenCalledOnce());
    expect(mock.verifyMfaChallenge).toHaveBeenCalledWith("123456");
  });

  it("renders the server-supplied MFA failure and preserves the cancel path", async () => {
    mock.verifyMfaChallenge.mockResolvedValueOnce({ success: false, error: "Incorrect authenticator code." });
    render(<MfaChallengeScreen />);
    fireEvent.change(screen.getByRole("textbox", { name: "6-digit authenticator code" }), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Incorrect authenticator code.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel and sign out" }));
    expect(mock.cancelMfaChallenge).toHaveBeenCalledOnce();
  });

  it("validates and securely submits a 4-digit PIN without exposing a stored password", async () => {
    render(<PinSetupScreen />);
    const pin = screen.getByLabelText("Choose 4-Digit PIN");
    const confirm = screen.getByLabelText("Confirm 4-Digit PIN");
    expect(pin.getAttribute("type")).toBe("password");
    fireEvent.change(pin, { target: { value: "12ab34" } });
    fireEvent.change(confirm, { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /Save PIN and continue/ }));
    await waitFor(() => expect(mock.setupPin).toHaveBeenCalledWith("1234"));
    expect(mock.setupPin).toHaveBeenCalledTimes(1);
  });

  it("prevents double unlocking when both 4-digit auto-submit and explicit submit fire", async () => {
    let finish: ((value: boolean) => void) | undefined;
    mock.unlock.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    render(<LockScreen />);
    const pin = screen.getByLabelText("Enter 4-Digit Quick-Unlock PIN");
    fireEvent.change(pin, { target: { value: "1234" } });
    fireEvent.submit(document.querySelector(".aq-auth__pin-panel form") as HTMLFormElement);
    expect(mock.unlock).toHaveBeenCalledTimes(1);
    finish?.(false);
    expect((await screen.findByRole("alert")).textContent).toContain("Incorrect PIN");
    expect((pin as HTMLInputElement).value).toBe("");
  });
});
