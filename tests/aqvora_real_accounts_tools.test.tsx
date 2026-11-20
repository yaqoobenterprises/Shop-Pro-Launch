import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountsView } from "../src/components/accounts/AccountsView";

vi.mock("../src/services/ledgerService", () => ({
  OFFLINE_SYNC_COMPLETE_EVENT: "shop-pro:offline-sync-complete",
  ledgerService: {
    getPaymentAccounts: vi.fn(async () => [
      { id: "cash", name: "Cash Drawer", type: "CASH", balance_paisa: 100000,
        is_active: true, is_default: true },
      { id: "bank", name: "Bank", type: "BANK", balance_paisa: 200000,
        is_active: true, is_default: false },
    ]),
  },
}));

describe("AQVORA real payment-account page", () => {
  it("starts with concise cards and exposes exactly one functional form on demand", async () => {
    render(<AccountsView />);
    await waitFor(() => expect(screen.getByText("Cash Drawer")).toBeTruthy());
    const create = screen.getByRole("button", { name: "New account" });
    const transfer = screen.getByRole("button", { name: "Move money" });
    expect(create.getAttribute("aria-expanded")).toBe("false");
    expect(transfer.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox", { name: "Account name" })).toBeNull();
    fireEvent.click(create);
    expect(create.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Account name" })).toBeTruthy();
    fireEvent.click(transfer);
    expect(create.getAttribute("aria-expanded")).toBe("false");
    expect(transfer.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("combobox", { name: "Account name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer funds" })).toBeTruthy();
    fireEvent.click(transfer);
    expect(transfer.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Transfer funds" })).toBeNull();
  });
});
