import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const harness = vi.hoisted(() => ({
  onClose: vi.fn(),
  updateOrganization: vi.fn(),
  setRegion: vi.fn(),
  setLanguage: vi.fn(),
  saveUserPreferences: vi.fn(async () => undefined),
  saveCompany: vi.fn(async (_request: unknown) => ({
    name: "New Services Ltd",
    business_category: "Services",
    country: "Pakistan",
    currency: "PKR",
    currency_symbol: "Rs",
    timezone: "Asia/Karachi",
    region_configured: true,
  })),
  ownerRole: "OWNER",
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "owner-1", role: harness.ownerRole },
    organization: {
      id: "company-1", name: "Sample Business", business_category: "Services",
      currency: "PKR", currency_symbol: "Rs", country: "Pakistan",
      timezone: "Asia/Karachi", region_configured: false,
    },
    isDemoMode: true,
    isCloudAccount: false,
    updateOrganization: harness.updateOrganization,
  }),
}));

vi.mock("../src/regional/region", () => ({
  useRegion: () => ({ setRegion: harness.setRegion }),
}));
vi.mock("../src/regional/detect", () => ({
  detectDeviceRegion: () => ({
    country: "Pakistan", currency: "PKR", timeZone: "Asia/Karachi", uiLanguage: "en",
  }),
}));
vi.mock("../src/services/companySetupService", () => ({
  saveFirstRunCompanySetup: harness.saveCompany,
}));
vi.mock("../src/services/userPreferencesService", () => ({
  saveUserPreferences: harness.saveUserPreferences,
}));
vi.mock("../src/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, setLanguage: harness.setLanguage }),
}));

import { FirstRunRegionalModal } from "../src/components/settings/FirstRunRegionalModal";

beforeEach(() => {
  vi.clearAllMocks();
  harness.ownerRole = "OWNER";
});

describe("AQVORA company setup journey", () => {
  it("opens a branded, escapable demo without pretending to change live financial books", () => {
    render(<FirstRunRegionalModal isOpen onClose={harness.onClose} />);
    expect(screen.getByRole("dialog", { name: "Set up your company" })).toBeTruthy();
    expect(screen.getByText("AQVORA · COMPANY ONBOARDING")).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close demo" }));
    expect(harness.onClose).toHaveBeenCalledTimes(1);
    expect(harness.saveCompany).not.toHaveBeenCalled();
  });

  it("validates required company data, retains local currency, reviews and saves only verified metadata", async () => {
    render(<FirstRunRegionalModal isOpen onClose={harness.onClose} />);
    const name = screen.getByRole("textbox", { name: "Company name" });
    fireEvent.change(name, { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(/company name/i);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();

    fireEvent.change(name, { target: { value: "New Services Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Accounting currency" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Changes require an accounting review/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(screen.getByText(/No opening balances or accounting transactions will be created/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Confirm & continue/ }));
    await waitFor(() => expect(harness.saveCompany).toHaveBeenCalledOnce());
    const request = harness.saveCompany.mock.calls[0][0] as { input: { name: string; currency: string } };
    expect(request.input.name).toBe("New Services Ltd");
    expect(request.input.currency).toBe("PKR");
    expect(harness.updateOrganization).toHaveBeenCalledOnce();
    expect(harness.onClose).toHaveBeenCalledOnce();
  });

  it("returns to step one on close/reopen rather than trapping a returning user in review", () => {
    const { rerender } = render(<FirstRunRegionalModal isOpen onClose={harness.onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    rerender(<FirstRunRegionalModal isOpen={false} onClose={harness.onClose} />);
    rerender(<FirstRunRegionalModal isOpen onClose={harness.onClose} />);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("never enables owner save for cashier members", () => {
    harness.ownerRole = "CASHIER";
    render(<FirstRunRegionalModal isOpen onClose={harness.onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: /Confirm & continue/ }).hasAttribute("disabled")).toBe(true);
    expect(harness.saveCompany).not.toHaveBeenCalled();
  });
});
