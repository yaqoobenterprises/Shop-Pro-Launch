import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LedgerDashboardView } from "../src/components/dashboard/LedgerDashboardView";
import { LandingPage } from "../src/components/landing/LandingPage";
import { ledgerService } from "../src/services/ledgerService";
import { getKarachiBusinessDate } from "../src/lib/dates";
import type { Transaction } from "../src/types/ledger";

afterEach(() => vi.restoreAllMocks());

const entry = (amount_paisa: number, type: "income" | "expense", date: string): Transaction => ({
  id: type, type, amount_paisa, business_date: date,
  category_id: type === "expense" ? "paper" : "print",
  category_name: type === "expense" ? "Paper" : "Printing",
  account_id: "cash", account_name: "Cash",
  device_entry_time: `${date}T08:00:00.000Z`, note: null,
  raw_text: type, status: "active", idempotency_key: type, created_by: "owner",
  created_by_name: "Owner", created_at: `${date}T08:00:00.000Z`,
  updated_at: `${date}T08:00:00.000Z`,
});

describe("AQVORA pastel workspace, real ledger boundaries", () => {
  it("uses source-backed figures and a two-series accessible area chart for a selected month", async () => {
    const today = getKarachiBusinessDate();
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([]);
    vi.spyOn(ledgerService, "getAllFilteredTransactions").mockResolvedValue([
      entry(30000, "income", today), entry(10000, "expense", today),
    ]);

    render(<LedgerDashboardView />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    const chart = await screen.findByRole("img", { name: /Income and expenses trend/ });
    expect(chart.querySelectorAll("path").length).toBeGreaterThan(2);
    await waitFor(() => expect(screen.getByTitle("Income: Rs 300")).toBeTruthy());
    expect(screen.getByTitle("Expenses: Rs 100")).toBeTruthy();
    const accessibleRows = screen.getByRole("table", { name: "Income and expenses by period" });
    expect(accessibleRows.querySelectorAll("th[scope='col']")).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Expense totals by category" }).textContent).toContain("Paper");
    expect(screen.getByText("Cashbook basis, not accrual P&L")).toBeTruthy();
  });

  it("keeps zero expense categories honest while retaining the original account empty state", async () => {
    const today = getKarachiBusinessDate();
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([]);
    vi.spyOn(ledgerService, "getDailySummary").mockResolvedValue({
      business_date: today, income_paisa: 0, expense_paisa: 0,
      net_profit_paisa: 0, capital_in_paisa: 0, withdrawal_paisa: 0,
      adjustment_in_paisa: 0, adjustment_out_paisa: 0, transaction_count: 0,
    });
    vi.spyOn(ledgerService, "getCategoryBreakdown").mockResolvedValue([]);
    render(<LedgerDashboardView />);
    expect(await screen.findByText(/No active expenses for this date/)).toBeTruthy();
    expect(screen.getByText(/No active shop accounts are available/)).toBeTruthy();
    const card = screen.getByText("Cash & bank").closest("article");
    expect(card?.textContent).toContain("—");
    expect(screen.queryByText("90%")).toBeNull();
  });

  it("uses the actual new AQVORA vector asset in the landing brand", async () => {
    const { container } = render(<LandingPage onOpenAuth={vi.fn()} onTryDemo={vi.fn()} />);
    const logo = container.querySelector("img.aq-landing__brandmark");
    expect(logo?.getAttribute("src")).toBe("/assets/aqvora-symbol.svg");
  });
});
