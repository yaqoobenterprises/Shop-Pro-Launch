import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentAccountInsights } from "../src/components/accounts/PaymentAccountInsights";
import type { LedgerAccount } from "../src/types/ledger";

const cash = {
  id: "cash", name: "Cash Wallet", type: "CASH", is_active: true,
  is_default: true, balance_paisa: 1_108_100,
} as LedgerAccount;
const bank = {
  id: "bank", name: "UBL", type: "BANK", is_active: true,
  is_default: false, balance_paisa: 13_700_500,
} as LedgerAccount;

describe("AQVORA actual payment account balance distribution", () => {
  it("uses only loaded active balances with a working refresh and explicit accounting scope", () => {
    const refresh = vi.fn();
    render(<PaymentAccountInsights accounts={[cash, bank]} onRefresh={refresh}/>);
    expect(screen.getByRole("heading", { name: "Balance distribution" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Positive balance allocation" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Rs 137,005")).toBeTruthy();
    expect(screen.getByText("92.5%")).toBeTruthy();
    expect(screen.getByText(/not reconciled bank statements/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh payment-account balances" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not invent positive money from inactive or negative accounts", () => {
    render(<PaymentAccountInsights accounts={[
      { ...cash, balance_paisa: -1000 },
      { ...bank, is_active: false },
    ]} onRefresh={vi.fn()}/>);
    expect(screen.queryByRole("list", { name: "Positive balance allocation" })).toBeNull();
    expect(screen.getByText(/No positive active balances available/)).toBeTruthy();
  });
});
