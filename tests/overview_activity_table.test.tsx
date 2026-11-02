import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OverviewActivityTable } from "../src/components/dashboard/OverviewActivityTable";
import type { Transaction } from "../src/types/ledger";

const makeTransaction = (index: number): Transaction => {
  const date = `2026-10-${String(index).padStart(2, "0")}`;
  return {
    id: `activity-${index}`,
    type: index % 2 === 0 ? "expense" : "income",
    amount_paisa: index * 1000,
    category_id: index % 2 === 0 ? "paper" : "printing",
    category_name: index % 2 === 0 ? "Paper" : "Printing",
    account_id: "cash",
    account_name: "Main till",
    business_date: date,
    device_entry_time: `${date}T12:00:00.000Z`,
    note: null,
    raw_text: index === 3 ? "Special customer order" : `Transaction ${index}`,
    status: "active",
    idempotency_key: `activity-key-${index}`,
    created_by: "owner",
    created_by_name: "Owner",
    created_at: `${date}T12:00:00.000Z`,
    updated_at: `${date}T12:00:00.000Z`,
  };
};

describe("Overview transaction activity table", () => {
  it("searches transaction descriptions and reports an accurate empty state", () => {
    render(<OverviewActivityTable transactions={[makeTransaction(1), makeTransaction(2), makeTransaction(3)]} isLoading={false} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), {
      target: { value: "special customer" },
    });

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Special customer order")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), {
      target: { value: "does not exist" },
    });
    expect(screen.getByText("No transactions match your search.")).toBeTruthy();
  });

  it("sorts amounts and paginates without hiding matching records", () => {
    const records = Array.from({ length: 12 }, (_, index) => makeTransaction(index + 1));
    render(<OverviewActivityTable transactions={records} isLoading={false} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("Showing 1–10 of 12 entries")).toBeTruthy();

    const amountSort = screen.getByRole("button", { name: "Sort by amount" });
    fireEvent.click(amountSort);
    fireEvent.click(amountSort);
    const rows = within(table).getAllByRole("row");
    expect(rows[1].textContent).toContain("Transaction 1");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Showing 11–12 of 12 entries")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });
});
