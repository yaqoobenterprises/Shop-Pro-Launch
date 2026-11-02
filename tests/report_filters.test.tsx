import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReportFiltersPanel, type ReportFilters } from "../src/components/reports/ReportFiltersPanel";
import type { Category, LedgerAccount } from "../src/types/ledger";

const today = "2026-11-02";
const initialFilters: ReportFilters = {
  fromDate: "2026-01-01",
  toDate: today,
  type: "all",
  categoryId: "all",
  accountId: "all",
  searchQuery: "",
};
const categories: Category[] = [{
  id: "paper",
  name: "Paper",
  kind: "expense",
  unusual_amount_limit_paisa: 5000000,
  is_default: false,
  is_active: true,
  display_order: 1,
  created_at: "",
}];
const accounts: LedgerAccount[] = [{
  id: "bank",
  organization_id: "shop-1",
  name: "Business Bank",
  type: "BANK",
  balance_paisa: 120000,
  current_balance: 1200,
  opening_balance: 0,
  is_active: true,
  is_default: false,
  created_at: "",
}];

describe("report filter controls", () => {
  it("applies account and search filters and resets every filter consistently", () => {
    const onApply = vi.fn();
    render(
      <ReportFiltersPanel
        filters={initialFilters}
        categories={categories}
        accounts={accounts}
        today={today}
        isLoading={false}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "bank" } });
    fireEvent.change(screen.getByPlaceholderText("Find a note or description"), {
      target: { value: "supplier invoice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    expect(onApply).toHaveBeenLastCalledWith({
      ...initialFilters,
      accountId: "bank",
      searchQuery: "supplier invoice",
    });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onApply).toHaveBeenLastCalledWith(initialFilters);
  });
});
