import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TransactionDetailModal } from "../src/components/common/TransactionDetailModal";
import { ChatFeed } from "../src/components/chat/ChatFeed";
import { Transaction } from "../src/types/ledger";

describe("Cashbook rows and transaction receipt", () => {
  const sampleTx: Transaction = {
    id: "tx-test-12345",
    business_date: "2026-10-11",
    device_entry_time: "2026-10-11T14:30:00.000Z",
    type: "income",
    category_id: "cat-1",
    category_name: "Repairs",
    amount_paisa: 150000, // Rs 1,500
    raw_text: "Repairs cash received 1500",
    status: "active",
    idempotency_key: "tx-test-key",
    created_by: "user-test-1",
    created_by_name: "Staff",
    account_id: "acc-1",
    account_name: "Meezan Bank Account",
    created_at: "2026-10-11T14:30:00.000Z",
    updated_at: "2026-10-11T14:30:00.000Z",
  };

  it("renders a receipt with amount, account, date, and original description", () => {
    render(
      <TransactionDetailModal
        isOpen={true}
        transaction={sampleTx}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Transaction Receipt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rs 1,500").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Meezan Bank Account").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-10-11").length).toBeGreaterThan(0);
    expect(screen.getByText("Original Input Text")).toBeTruthy();
    expect(screen.getAllByText("Repairs cash received 1500").length).toBeGreaterThan(0);
  });

  it("shows the Cash In Hand fallback in the receipt when no account is specified", () => {
    const txWithoutAccount: Transaction = {
      ...sampleTx,
      account_name: undefined,
    };

    render(
      <TransactionDetailModal
        isOpen={true}
        transaction={txWithoutAccount}
        onClose={vi.fn()}
      />,
    );

    // Both the screen detail section and print receipt carry the account.
    expect(screen.getAllByText("Cash In Hand").length).toBeGreaterThanOrEqual(2);
  });

  it("distinguishes activity by note and account and opens the selected receipt", () => {
    render(<ChatFeed transactions={[{ ...sampleTx, note: "Printer repair" }]} drafts={[]} accounts={[]} canManageTransactions={false} onEdit={vi.fn()} onVoid={vi.fn()} onRestore={vi.fn()} onAssignDraft={vi.fn()} />);
    expect(screen.getByText("Printer repair")).toBeTruthy();
    expect(screen.getByText(/Repairs · Meezan Bank Account/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open receipt for Repairs transaction" }));
    expect(screen.getByRole("dialog", { name: "Transaction Receipt" })).toBeTruthy();
  });

  it("TransactionsExplorerView localizes the 'Account' header and keeps transaction details accessible", async () => {
    const explorerSource = await import("../src/components/sales/TransactionsExplorerView?raw");

    expect(explorerSource.default).toContain('t("transactions.account")');
    expect(explorerSource.default).not.toContain(">Entered By<");
    expect(explorerSource.default).toContain("TransactionDetailModal");
  });
});
