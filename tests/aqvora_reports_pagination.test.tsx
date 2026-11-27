import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LedgerReportsView } from "../src/components/reports/LedgerReportsView";
import { ledgerService } from "../src/services/ledgerService";
import { getKarachiBusinessDate } from "../src/lib/dates";
import type { Transaction } from "../src/types/ledger";

afterEach(() => vi.restoreAllMocks());

describe("AQVORA report register usability", () => {
  it("paginates loaded records while keeping the full filtered set for export", async () => {
    const date = getKarachiBusinessDate();
    const transactions: Transaction[] = Array.from({ length: 17 }, (_, i) => ({
      id: `tx-${i}`, type: "income", amount_paisa: 10000,
      category_id: "printing", category_name: "Printing", status: "active",
      account_id: "cash", account_name: "Till",
      business_date: date, device_entry_time: `${date}T12:00:00.000Z`,
      raw_text: `Printing ${i}`, note: null, idempotency_key: `intent-${i}`,
      created_by: "owner", created_by_name: "Owner",
      created_at: `${date}T12:00:00.000Z`,
      updated_at: `${date}T12:00:00.000Z`,
    }));
    vi.spyOn(ledgerService, "getCategories").mockResolvedValue([]);
    vi.spyOn(ledgerService, "getAllFilteredTransactions").mockResolvedValue(transactions);
    render(<LedgerReportsView />);
    await waitFor(() => expect(screen.getByText(/Showing 1–15 of 17 records/)).toBeTruthy());
    const register = screen.getByRole("heading", { name: "Transaction register" }).closest("section");
    expect(register?.querySelectorAll("tbody tr")).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Next transaction page" }));
    expect(register?.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText(/Showing 16–17 of 17 records/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next transaction page" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous transaction page" }));
    expect(register?.querySelectorAll("tbody tr")).toHaveLength(15);
  });
  it("refuses to show fabricated zero totals or enable export on a failed authoritative read", async () => {
    vi.spyOn(ledgerService,"getCategories").mockResolvedValue([]);
    const fetch=vi.spyOn(ledgerService,"getAllFilteredTransactions").mockRejectedValue(new Error("Cloud read failed"));
    render(<LedgerReportsView cloudOnly/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cloud read failed");
    expect(screen.getAllByText("Unavailable")).toHaveLength(4);
    expect(screen.getByRole("button",{name:"Export to Excel"})).toBeDisabled();
    expect(screen.queryByRole("heading",{name:"Transaction register"})).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({status:"active"}),{requireCloudSource:true});
    fetch.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    await waitFor(() => expect(screen.getByRole("button",{name:"Export to Excel"})).toBeEnabled());
    expect(screen.getByText("No matching transactions to display.")).toBeTruthy();
  });
});
