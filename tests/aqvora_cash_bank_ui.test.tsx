import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ledgerService } from "../src/services/ledgerService";
import { AccountsView } from "../src/components/accounts/AccountsView";

afterEach(() => vi.restoreAllMocks());

describe("AQVORA Cash & Bank truthful balance states", () => {
  it("does not show Rs 0 as a financial balance when account loading fails", async () => {
    vi.spyOn(ledgerService, "getPaymentAccounts").mockRejectedValue(new Error("not available"));
    render(<AccountsView />);
    expect(await screen.findByText("Accounts are unavailable")).toBeTruthy();
    const total = screen.getByText("ACTIVE ACCOUNT BALANCES").parentElement;
    await waitFor(() => expect(total?.textContent).toContain("—"));
    expect(total?.textContent).not.toContain("Rs 0");
  });

  it("does not present a missing account as verified liquidity", async () => {
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([]);
    render(<AccountsView />);
    expect(await screen.findByText("No accounts yet")).toBeTruthy();
    const total = screen.getByText("ACTIVE ACCOUNT BALANCES").parentElement;
    expect(total?.textContent).toContain("—");
  });
});
