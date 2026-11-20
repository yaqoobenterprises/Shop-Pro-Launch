import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FinanceDesignPreview } from "../src/components/accounting/FinanceDesignPreview";
import { JournalComposer } from "../src/components/accounting/JournalComposer";
import { ChartExplorer } from "../src/components/accounting/ChartExplorer";
import { rupeeTextToMinor, formatMinorForPreview } from "../src/components/accounting/financeInput";
import { sampleChart, sampleCompany, sampleJournals } from "../src/components/accounting/financeSampleData";
import { buildFinancialSnapshot } from "../src/accounting/financialSnapshot";

const policy = {
  organizationId: sampleCompany.organizationId,
  currency: "PKR",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-30",
  periodState: "open" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("AQVORA finance workspace design, no financial writes", () => {
  it("uses exact PKR text conversion and rejects malformed or huge numbers", () => {
    expect(rupeeTextToMinor("250.50")).toBe("25050");
    expect(rupeeTextToMinor("1,000.01")).toBe("100001");
    expect(rupeeTextToMinor("0.05")).toBe("5");
    expect(rupeeTextToMinor("1.005")).toBeNull();
    expect(rupeeTextToMinor("1e3")).toBeNull();
    expect(rupeeTextToMinor("9223372036854775808")).toBeNull();
    expect(formatMinorForPreview("25050")).toBe("Rs 250.50");
    expect(formatMinorForPreview("-123456")).toBe("-Rs 1,234.56");
  });

  it("renders four finance modules with strong sample-data disclosure and a close action", () => {
    const onClose = vi.fn();
    render(<FinanceDesignPreview onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "AQVORA accounting interface preview" })).toBeTruthy();
    expect(screen.getByText("Illustrative data · No live records")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chart of Accounts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add account" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close accounting preview" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the existing AI destination only on user action; no invented V2 AI posting", () => {
    const onClose = vi.fn();
    const onOpenAi = vi.fn();
    render(<FinanceDesignPreview onClose={onClose} onOpenAi={onOpenAi} />);
    const trigger = screen.getByRole("button", { name: "AI Copilot" });
    expect(onOpenAi).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(onOpenAi).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add account" }).hasAttribute("disabled")).toBe(true);
  });

  it("filters chart of accounts by code, text and class, retaining a real empty state", () => {
    render(<ChartExplorer accounts={sampleChart} isSample />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search chart of accounts" }), {
      target: { value: "Utilities" },
    });
    expect(screen.getByText("Utilities")).toBeTruthy();
    expect(screen.queryByText("Trade payables")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search chart of accounts" }), {
      target: { value: "not an account" },
    });
    expect(screen.getByText("No accounts match these filters.")).toBeTruthy();
  });

  it("composes exact debit/credit entries, validates and never enables posting", () => {
    render(<JournalComposer accounts={sampleChart} policy={policy} initialDate="2026-11-20" />);
    const accounts = screen.getAllByRole("combobox");
    fireEvent.change(accounts[0], { target: { value: "1010" } });
    fireEvent.change(accounts[1], { target: { value: "3010" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Line 1 debit in rupees" }), { target: { value: "250.50" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Line 2 credit in rupees" }), { target: { value: "250.50" } });
    expect(screen.getByText("Balanced")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review journal" }));
    expect(screen.getByRole("status").textContent).toContain("Local checks passed.");
    expect(screen.getByRole("button", { name: "Post journal" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/No saving or posting here/)).toBeTruthy();
  });

  it("shows exact imbalance and rejects malformed decimal text", () => {
    render(<JournalComposer accounts={sampleChart} policy={policy} initialDate="2026-11-20" />);
    const accounts = screen.getAllByRole("combobox");
    fireEvent.change(accounts[0], { target: { value: "1010" } });
    fireEvent.change(accounts[1], { target: { value: "3010" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Line 1 debit in rupees" }), { target: { value: "250.50" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Line 2 credit in rupees" }), { target: { value: "250.49" } });
    expect(screen.getByText(/Difference Rs 0.01/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Line 2 credit in rupees" }), { target: { value: "250.499" } });
    fireEvent.click(screen.getByRole("button", { name: "Review journal" }));
    expect(screen.getByRole("status").textContent).toMatch(/canonical decimal integer string/i);
  });

  it("supports trial-balance to ledger drilldown on a balanced illustrative snapshot", () => {
    render(<FinanceDesignPreview onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Trial Balance" })[0]);
    expect(screen.getByRole("heading", { name: "Trial Balance" })).toBeTruthy();
    const snapshot = buildFinancialSnapshot({
      organizationId: sampleCompany.organizationId,
      currency: sampleCompany.currency,
      asOfDate: sampleCompany.asOfDate,
      sourceComplete: true,
      accounts: sampleChart,
      journals: sampleJournals,
    });
    expect(snapshot.trialBalance.closingDebitMinor).toBe("6200000");
    expect(snapshot.trialBalance.closingCreditMinor).toBe("6200000");
    expect(snapshot.balanceSheet.differenceMinor).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: /1010 Cash in hand/ }));
    expect(screen.getByRole("heading", { name: "General Ledger" })).toBeTruthy();
    const selected = screen.getByRole("combobox", { name: "Choose a ledger account" }) as HTMLSelectElement;
    expect(selected.value).toBe("1010");
    expect(screen.getByText("JV-S001")).toBeTruthy();
  });

  it("keeps dynamic journal rows editable without allowing fewer than two lines", () => {
    render(<JournalComposer accounts={sampleChart} policy={policy} initialDate="2026-11-20" />);
    expect(screen.getByRole("button", { name: "Remove line 1" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getByRole("textbox", { name: "Line 3 debit in rupees" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove line 3" }));
    expect(screen.queryByRole("textbox", { name: "Line 3 debit in rupees" })).toBeNull();
  });
});
