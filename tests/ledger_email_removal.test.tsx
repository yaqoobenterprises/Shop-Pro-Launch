import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionDetailModal } from "../src/components/common/TransactionDetailModal";
import { Transaction } from "../src/types/ledger";

describe("Ledger Email Removal & Transaction Detail View", () => {
  const sampleTx: Transaction = {
    id: "tx-test-12345",
    organization_id: "org-test-1",
    business_date: "2026-10-11",
    device_entry_time: "2026-10-11T14:30:00.000Z",
    type: "income",
    category_id: "cat-1",
    amount_paisa: 150000, // Rs 1,500
    raw_text: "Repairs cash received 1500",
    status: "final",
    created_by_name: "Staff",
    account_id: "acc-1",
    account_name: "Meezan Bank Account",
    sync_status: "synced",
  };

  it("renders payment account name prominently instead of author email", () => {
    render(
      <TransactionDetailModal
        isOpen={true}
        transaction={sampleTx}
        onClose={vi.fn()}
      />
    );

    // Modal title & amount
    expect(screen.getByText("Transaction Details")).toBeTruthy();
    expect(screen.getByText("Rs 1,500")).toBeTruthy();

    // Account Name
    expect(screen.getByText("Payment Account")).toBeTruthy();
    expect(screen.getByText("Meezan Bank Account")).toBeTruthy();

    // Formatted time
    expect(screen.getByText("Device Entry Time")).toBeTruthy();
    expect(screen.getByText("Business Date")).toBeTruthy();
    expect(screen.getByText("2026-10-11")).toBeTruthy();

    // Raw text preserved
    expect(screen.getByText("Original Input Text")).toBeTruthy();
    expect(screen.getByText("Repairs cash received 1500")).toBeTruthy();
  });

  it("falls back to 'Cash In Hand' when account_name is unspecified", () => {
    const txWithoutAccount: Transaction = {
      ...sampleTx,
      account_name: undefined,
    };

    render(
      <TransactionDetailModal
        isOpen={true}
        transaction={txWithoutAccount}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Cash In Hand")).toBeTruthy();
  });

  it("ChatFeed source code renders account_name rather than created_by_name or email", async () => {
    const chatFeedSource = await import("../src/components/chat/ChatFeed?raw");
    // Verify that tx.account_name is used
    expect(chatFeedSource.default).toContain("tx.account_name || \"Cash In Hand\"");
    // Verify it doesn't display tx.created_by_name in the main feed line
    expect(chatFeedSource.default).not.toContain("{tx.created_by_name || \"Staff\"}");
  });

  it("TransactionsExplorerView localizes the 'Account' header instead of showing 'Entered By'", async () => {
    const explorerSource = await import("../src/components/sales/TransactionsExplorerView?raw");
    expect(explorerSource.default).toContain('t("transactions.account")');
    expect(explorerSource.default).not.toContain(">Entered By<");
    expect(explorerSource.default).toContain("TransactionDetailModal");
  });
});
