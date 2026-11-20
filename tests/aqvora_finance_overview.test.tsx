import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FinanceOverviewPanel } from "../src/components/accounting/FinanceOverviewPanel";
import { FinanceDesignPreview } from "../src/components/accounting/FinanceDesignPreview";
import { buildSampleCashActivity, countSampleAccountClasses } from "../src/components/accounting/financeOverviewModel";
import { sampleChart, sampleJournals } from "../src/components/accounting/financeSampleData";
import type { AqvoraFiscalPeriod } from "../src/services/aqvoraAdminReadService";

const periods: AqvoraFiscalPeriod[] = [
  { id:"p1", organizationId:"aqvora-sample-only", startsOn:"2026-10-01", endsOn:"2026-12-31", state:"open", reopenCount:0, revision:"1" },
  { id:"p2", organizationId:"aqvora-sample-only", startsOn:"2026-01-01", endsOn:"2026-09-30", state:"closed", reopenCount:0, revision:"1" },
];

describe("AQVORA visible demo overview — exact, source-honest", () => {
  it("derives cash movement from real illustrative cash-control lines without counting capital as revenue", () => {
    expect(buildSampleCashActivity(sampleChart, sampleJournals)).toEqual([
      { date:"2026-11-01", receivedMinor:"5000000", paidMinor:"0" },
      { date:"2026-11-02", receivedMinor:"1200000", paidMinor:"0" },
      { date:"2026-11-03", receivedMinor:"0", paidMinor:"300000" },
    ]);
    expect(countSampleAccountClasses(sampleChart).find((row) => row.name === "Assets")?.count).toBe(4);
  });

  it("renders four populated cards, sample-only disclosures and accessible sample charts", () => {
    const onNavigate = vi.fn();
    render(<FinanceOverviewPanel accounts={sampleChart} periods={periods}
      journals={sampleJournals} onNavigate={onNavigate}/>);
    expect(screen.getByRole("heading", { name:"Accounting overview" })).toBeTruthy();
    expect(screen.getByLabelText("Illustrative accounting summary").children).toHaveLength(4);
    expect(screen.getByRole("img", { name:"Illustrative daily cash received and cash paid line chart" })).toBeTruthy();
    expect(screen.getByRole("img", { name:"Illustrative account classes breakdown" })).toBeTruthy();
    expect(screen.getByText(/Illustrative data only/)).toBeTruthy();
    expect(screen.getByText("JV-S001")).toBeTruthy();
    expect(screen.getAllByText("Rs 62,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rs 3,000.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name:/Explore accounts/ }));
    expect(onNavigate).toHaveBeenCalledWith("chart");
    fireEvent.click(screen.getByRole("button", { name:/View fiscal periods/ }));
    expect(onNavigate).toHaveBeenCalledWith("periods");
  });

  it("lets user inspect a different sample window and updates amounts exactly", () => {
    render(<FinanceOverviewPanel accounts={sampleChart} periods={periods}
      journals={sampleJournals} onNavigate={vi.fn()}/>);
    fireEvent.change(screen.getByRole("combobox", { name:"Cash movement date range" }), {
      target:{ value:"recent" },
    });
    expect(screen.getAllByText("Rs 12,000.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("Rs 62,000.00")).toBeNull();
    expect(screen.getByText("Rs 3,000.00")).toBeTruthy();
  });

  it("shows a clean empty state without inventing cash statistics", () => {
    render(<FinanceOverviewPanel accounts={[]} periods={[]} journals={[]} onNavigate={vi.fn()}/>);
    expect(screen.getByText("No illustrative cash movements.")).toBeTruthy();
    expect(screen.getByText("No illustrative journals are available.")).toBeTruthy();
    expect(screen.getAllByText("Rs 0.00").length).toBe(2);
  });

  it("opens the refreshed finance screen first, then navigates to functional pages", () => {
    render(<FinanceDesignPreview onClose={vi.fn()}/>);
    expect(screen.getByRole("heading", { name:"Accounting overview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name:/Explore accounts/ }));
    expect(screen.getByRole("heading", { name:"Chart of Accounts" })).toBeTruthy();
    expect(screen.getByRole("button", { name:"Add account" }).hasAttribute("disabled")).toBe(true);
  });
});
