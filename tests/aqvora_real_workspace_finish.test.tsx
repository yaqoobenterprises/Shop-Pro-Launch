import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatFeed } from "../src/components/chat/ChatFeed";
import { LedgerMateSurface } from "../src/components/chat/LedgerMateSurface";
import type { Transaction } from "../src/types/ledger";

vi.mock("../src/i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));
vi.mock("../src/components/common/TransactionDetailModal", () => ({
  TransactionDetailModal: () => null,
}));

const emptyHandler = vi.fn();
const assistantProps: React.ComponentProps<typeof LedgerMateSurface> = {
  activeThread: null, threads: [], messages: [], error: null,
  online: false, checking: false, sending: false, actionBusy: false,
  syncStatus: "local", healthModel: "offline", input: "", pendingAction: null,
  historyOpen: false, showActionDetails: false,
  endRef: { current: null }, textareaRef: { current: null },
  setInput: emptyHandler, setError: emptyHandler, setHistoryOpen: emptyHandler,
  setShowActionDetails: emptyHandler, onCreateThread: emptyHandler,
  onChooseThread: emptyHandler, onClearHistory: emptyHandler,
  onSend: emptyHandler, onCopy: emptyHandler, onRegenerate: emptyHandler,
  onConfirmAction: emptyHandler, onCancelAction: emptyHandler,
  onRefresh: emptyHandler,
};

describe("AQVORA visible legacy workspace improvements (no ledger service mutations)", () => {
  it("groups recorded transactions into an accessible cashbook activity surface", () => {
    const transaction = {
      id: "demo-test", category_name: "Sale", type: "income",
      status: "active", amount_paisa: 1850000,
    } as Transaction;
    render(<ChatFeed transactions={[transaction]} drafts={[]} accounts={[]}
      canManageTransactions={false} onEdit={emptyHandler}
      onVoid={emptyHandler} onRestore={emptyHandler}
      onAssignDraft={async () => {}} />);
    expect(screen.getByRole("heading", { name: "Today's activity" })).toBeTruthy();
    expect(screen.getByLabelText("1 recorded entry")).toBeTruthy();
    expect(screen.getByText("Sale")).toBeTruthy();
    expect(screen.getByLabelText("Today's cashbook activity")).toBeTruthy();
  });

  it("shows the same real activity surface for an empty day with a working focus action", () => {
    const onStartEntry = vi.fn();
    render(<ChatFeed transactions={[]} drafts={[]} accounts={[]}
      canManageTransactions={false} onEdit={emptyHandler}
      onVoid={emptyHandler} onRestore={emptyHandler}
      onAssignDraft={async () => {}} onStartEntry={onStartEntry} />);
    expect(screen.getByRole("heading", { name: "Today's activity" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "No cashbook entries today" })).toBeTruthy();
    expect(screen.getByText("No entries today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Record an entry/ }));
    expect(onStartEntry).toHaveBeenCalledOnce();
  });

  it("honestly replaces disabled AI suggestions with a working connection retry when offline", () => {
    const onRefresh = vi.fn();
    render(<LedgerMateSurface {...assistantProps} onRefresh={onRefresh} />);
    expect(screen.getByRole("heading", { name: "LedgerMate is offline" })).toBeTruthy();
    expect(screen.getByText(/No accounting entry has been changed/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "What would you like to understand?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows helpful example questions only after the AI provider reports ready", () => {
    render(<LedgerMateSurface {...assistantProps} online />);
    expect(screen.getByRole("heading", { name: "What would you like to understand?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "LedgerMate is offline" })).toBeNull();
  });
});
