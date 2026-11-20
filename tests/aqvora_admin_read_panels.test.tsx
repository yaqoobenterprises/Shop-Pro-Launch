import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AqvoraAdminReadPanels } from "../src/components/accounting/AqvoraAdminReadPanels";
import type { AqvoraAdminReadSnapshot } from "../src/services/aqvoraAdminReadService";
import { sampleChart } from "../src/components/accounting/financeSampleData";

const snapshot: AqvoraAdminReadSnapshot = {
  organizationId: "aqvora-sample-only",
  source: "authenticated-admin-rpc",
  accounts: sampleChart.map((a) => ({ ...a, revision: "9007199254740993" })),
  periods: [{
    id: "p1", organizationId: "aqvora-sample-only", startsOn: "2026-01-01",
    endsOn: "2026-12-31", state: "open", reopenCount: 0, revision: "1",
  }],
  hasMoreAccounts: true,
  hasMorePeriods: false,
};

describe("AQVORA staging-only authenticated admin presentation", () => {
  it("fails closed on disabled, unauthenticated, loading and error states", () => {
    const { rerender } = render(<AqvoraAdminReadPanels state={{ status: "disabled" }} />);
    expect(screen.getByText(/Verified isolated staging is required/)).toBeTruthy();
    rerender(<AqvoraAdminReadPanels state={{ status: "unauthorized" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Company access required");
    rerender(<AqvoraAdminReadPanels state={{ status: "loading" }} />);
    expect(screen.getByRole("status").textContent).toContain("No estimates");
    const retry = vi.fn();
    rerender(<AqvoraAdminReadPanels state={{ status: "error", onRetry: retry }} />);
    expect(screen.queryByText("Cash in hand")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry authorized read" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("presents only validated tenant data and explicitly warns about partial server pages", () => {
    render(<AqvoraAdminReadPanels state={{ status: "ready", snapshot }} />);
    expect(screen.getByRole("heading", { name: "Accounting administration" })).toBeTruthy();
    expect(screen.getByText(/server returned only the first page/)).toBeTruthy();
    expect(screen.getByText("Cash in hand")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fiscal Periods" }));
    expect(screen.getByRole("heading", { name: "Fiscal Periods" })).toBeTruthy();
    expect(screen.queryByText("Cash in hand")).toBeNull();
  });

  it("rejects tenant mixing before displaying financial records", () => {
    render(<AqvoraAdminReadPanels state={{ status: "ready", snapshot: {
      ...snapshot, accounts: [{ ...snapshot.accounts[0], organizationId: "wrong-company" }],
    } }} />);
    expect(screen.getByRole("alert").textContent).toContain("verification failed");
    expect(screen.queryByText("Cash in hand")).toBeNull();
  });
});
