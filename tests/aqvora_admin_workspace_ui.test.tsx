import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChartExplorer } from "../src/components/accounting/ChartExplorer";
import { FiscalPeriodPanel } from "../src/components/accounting/FiscalPeriodPanel";
import { FinanceDesignPreview } from "../src/components/accounting/FinanceDesignPreview";
import type { AqvoraFiscalPeriod } from "../src/services/aqvoraAdminReadService";
import { sampleChart } from "../src/components/accounting/financeSampleData";

const org = "aqvora-sample-only";
const periods: AqvoraFiscalPeriod[] = [
  { id: "p1", organizationId: org, startsOn: "2026-01-01", endsOn: "2026-03-31", state: "closed", reopenCount: 1, revision: "9007199254740993" },
  { id: "p2", organizationId: org, startsOn: "2026-04-01", endsOn: "2026-06-30", state: "closed", reopenCount: 0, revision: "2" },
  { id: "p3", organizationId: org, startsOn: "2026-07-01", endsOn: "2026-09-30", state: "closed", reopenCount: 0, revision: "1" },
  { id: "p4", organizationId: org, startsOn: "2026-10-01", endsOn: "2026-12-31", state: "open", reopenCount: 0, revision: "1" },
  { id: "p5", organizationId: org, startsOn: "2027-01-01", endsOn: "2027-03-31", state: "open", reopenCount: 0, revision: "1" },
  { id: "p6", organizationId: org, startsOn: "2027-04-01", endsOn: "2027-06-30", state: "open", reopenCount: 0, revision: "1" },
];

describe("AQVORA safe Chart and Fiscal admin screens", () => {
  it("paginates loaded accounts and searches across all loaded accounts", () => {
    render(<ChartExplorer accounts={sampleChart} isSample />);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.getByText("Cash in hand")).toBeTruthy();
    expect(screen.queryByText("Utilities")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next account page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search chart of accounts" }), {
      target: { value: "utilities" },
    });
    expect(screen.getByText("Utilities")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add account" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens read-only account review without a write action", () => {
    render(<ChartExplorer accounts={sampleChart} isSample />);
    fireEvent.click(screen.getByRole("button", { name: "View account 1010" }));
    expect(screen.getByRole("dialog", { name: "1010 · Cash in hand" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review archive" }));
    expect(screen.getByRole("status").textContent).toContain("Nothing was changed.");
    expect(screen.getByRole("button", { name: "Confirm archive (unavailable)" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("displays fiscal period state, filtering and exact string revisions", () => {
    render(<FiscalPeriodPanel periods={periods} source="illustrative" />);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next fiscal period page" }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter fiscal period status" }), {
      target: { value: "closed" },
    });
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View period 2026-01-01" }));
    expect(screen.getAllByText("9007199254740993").length).toBeGreaterThan(0);
  });

  it("makes period actions reviewable but never enables fiscal mutations", () => {
    render(<FiscalPeriodPanel periods={periods} source="illustrative" hasMoreOnServer />);
    expect(screen.getByText(/More on server \(not loaded\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create period" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Preview reopen period 2026-04-01" }));
    expect(screen.getByRole("dialog", { name: "Review reopen period" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm reopen (unavailable)" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the finance preview as sample-only and navigates to the new period view", () => {
    render(<FinanceDesignPreview onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Fiscal Periods" })[0]);
    expect(screen.getByRole("heading", { name: "Fiscal Periods" })).toBeTruthy();
    expect(screen.getByText("Illustrative sample periods. No company data is loaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create period" }).hasAttribute("disabled")).toBe(true);
  });
});
