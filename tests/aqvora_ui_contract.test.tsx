import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Button } from "../src/components/common/Button";
import { Input } from "../src/components/common/Input";
import { LedgerDashboardView } from "../src/components/dashboard/LedgerDashboardView";
import { ledgerService } from "../src/services/ledgerService";
import { getKarachiBusinessDate } from "../src/lib/dates";
import type { DailySummary, Transaction } from "../src/types/ledger";

afterEach(() => vi.restoreAllMocks());

const summary = (date: string): DailySummary => ({
  business_date: date,
  income_paisa: 12500,
  expense_paisa: 5000,
  net_profit_paisa: 7500,
  capital_in_paisa: 0,
  withdrawal_paisa: 0,
  adjustment_in_paisa: 0,
  adjustment_out_paisa: 0,
  transaction_count: 2,
});

describe("AQVORA premium interaction contract", () => {
  it("associates each input's persistent label and validation with its own ID", () => {
    render(
      <>
        <Input label="Account" error="Choose an active account." />
        <Input label="Account" />
      </>,
    );
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toEqual(inputs[1].id);
    expect(inputs[0].getAttribute("aria-invalid")).toBe("true");
    const feedback = screen.getByRole("alert");
    expect(inputs[0].getAttribute("aria-describedby")).toContain(feedback.id);
    expect(feedback.textContent).toContain("Choose an active account.");
  });

  it("preserves externally supplied descriptions on fields with errors", () => {
    render(<Input label="Invoice number" aria-describedby="invoice-help" error="Already used." />);
    const field = screen.getByRole("textbox");
    expect(field.getAttribute("aria-describedby")).toContain("invoice-help");
    expect(field.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
  });

  it("disables in-flight actions, exposes a busy state and keeps the action name", () => {
    const clicked = vi.fn();
    render(<Button isLoading onClick={clicked}>Save voucher</Button>);
    const button = screen.getByRole("button", { name: /Save voucher/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("does not invent zero available cash when no financial accounts exist", async () => {
    const today = getKarachiBusinessDate();
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([]);
    vi.spyOn(ledgerService, "getDailySummary").mockResolvedValue(summary(today));
    vi.spyOn(ledgerService, "getCategoryBreakdown").mockResolvedValue([]);
    render(<LedgerDashboardView />);
    const cashCard = (await screen.findByText("Cash & bank")).closest("article");
    await waitFor(() => expect(cashCard?.textContent).toContain("—"));
    expect(cashCard?.textContent).toContain("Latest loaded account balances");
    expect(screen.getByText("Operating result")).toBeTruthy();
    expect(screen.getByText("Cashbook basis · not accrual P&L")).toBeTruthy();
  });

  it("exposes the plotted cashbook amounts in a real accessible table", async () => {
    const date = getKarachiBusinessDate();
    const transaction: Transaction = {
      id: "income-1", type: "income", amount_paisa: 12345,
      category_id: null, category_name: "Services", account_id: "cash",
      business_date: date, device_entry_time: `${date}T08:00:00.000Z`,
      raw_text: "Service income", note: null, status: "active",
      idempotency_key: "income-1", created_by: "owner",
      created_by_name: "Owner", created_at: `${date}T08:00:00.000Z`,
      updated_at: `${date}T08:00:00.000Z`,
    };
    vi.spyOn(ledgerService, "getPaymentAccounts").mockResolvedValue([]);
    vi.spyOn(ledgerService, "getAllFilteredTransactions").mockResolvedValue([transaction]);
    render(<LedgerDashboardView />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    const table = await screen.findByRole("table", { name: "Income and expenses by period" });
    expect(table.textContent).toContain("Rs");
    expect(table.querySelectorAll("th[scope='col']")).toHaveLength(3);
    expect(table.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
  });
});
