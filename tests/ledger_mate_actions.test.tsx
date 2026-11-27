import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/context/AppContext", () => ({
  useApp: () => ({ showToast: vi.fn() }),
}));

vi.mock("../src/services/ledgerService", () => ({
  ledgerService: {
    getCategories: vi.fn(),
    getPaymentAccounts: vi.fn(),
    getAllFilteredTransactions: vi.fn(),
    createTransactionDraft: vi.fn(),
    postTransactionDraft: vi.fn(),
    editTransaction: vi.fn(),
    voidTransaction: vi.fn(),
  },
}));

vi.mock("../src/services/ledgerMateAiService", () => ({
  checkLedgerMateHealth: vi.fn(async () => ({ status: "ready", provider: "Groq", model: "openai/gpt-oss-20b" })),
  sendLedgerMateMessage: vi.fn(),
}));

import { AiAccountantPanel } from "../src/components/chat/AiAccountantPanel";
import { prepareLedgerMateAction } from "../src/services/ledgerMateActionService";
import { ledgerService } from "../src/services/ledgerService";
import { sendLedgerMateMessage } from "../src/services/ledgerMateAiService";

const mockLedger = vi.mocked(ledgerService);
const mockSend = vi.mocked(sendLedgerMateMessage);
const testSummary = {
  business_date: "2026-11-17", income_paisa: 0, expense_paisa: 0, net_profit_paisa: 0,
  capital_in_paisa: 0, withdrawal_paisa: 0, adjustment_in_paisa: 0, adjustment_out_paisa: 0,
  transaction_count: 0,
};

function transaction(id: string, categoryName: string, amountPaisa = 50000) {
  return {
    id,
    type: "income" as const,
    amount_paisa: amountPaisa,
    category_id: id,
    category_name: categoryName,
    account_id: "cash",
    account_name: "Cash drawer",
    business_date: "2026-11-05",
    device_entry_time: "2026-11-05T10:00:00.000Z",
    note: null,
    raw_text: categoryName,
    status: "active" as const,
    idempotency_key: id,
    created_by: "current-user",
    created_by_name: "User",
    device: "web",
    created_at: "2026-11-05T10:00:00.000Z",
    updated_at: "2026-11-05T10:00:00.000Z",
  };
}

function mountPanel() {
  return render(<AiAccountantPanel
    summary={testSummary}
    userId="current-user"
    organizationId="current-org"
    isCloudAccount={false}
    canPrepareActions
  />);
}

async function openCreatePreview() {
  const input = await screen.findByRole("textbox", { name: "Message LedgerMate AI" });
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Enable reviewed ledger actions" }));
  fireEvent.change(input, { target: { value: "add sale Rs 1,250.00 stamp paper cash today" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
  await screen.findByText("Review ledger action");
}

describe("LedgerMate transaction confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
    mockLedger.getCategories.mockResolvedValue([
      { id: "stamp", name: "Stamp Paper", kind: "income", unusual_amount_limit_paisa: 5000000, is_default: false, is_active: true, display_order: 1, created_at: "2026-01-01" },
    ]);
    mockLedger.getPaymentAccounts.mockResolvedValue([
      { id: "cash", organization_id: "current-org", name: "Cash drawer", type: "CASH", balance_paisa: 0, current_balance: 0, opening_balance: 0, is_active: true, is_default: true, created_at: "2026-01-01" },
    ]);
    mockLedger.createTransactionDraft.mockResolvedValue({ id: "draft-1" } as Awaited<ReturnType<typeof ledgerService.createTransactionDraft>>);
    mockLedger.postTransactionDraft.mockResolvedValue({ transaction: { id: "transaction-1" } as never, isQueuedOffline: false });
  });

  it("starts in read-only mode and refuses a write request without explicit opt-in", async () => {
    mountPanel();
    const input=await screen.findByRole("textbox",{name:"Message LedgerMate AI"});
    await waitFor(()=>expect(input).not.toBeDisabled());
    fireEvent.change(input,{target:{value:"add sale Rs 1,250.00 stamp paper cash today"}});
    fireEvent.keyDown(input,{key:"Enter",shiftKey:false});
    expect(await screen.findByText(/LedgerMate is in read-only mode/)).toBeTruthy();
    expect(mockLedger.createTransactionDraft).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not write any ledger record when the user cancels a preview", async () => {
    mountPanel();
    await openCreatePreview();

    expect(screen.getByText("Rs 1,250.00")).toBeInTheDocument();
    expect(screen.getByText("Stamp Paper")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Review ledger action")).not.toBeInTheDocument());
    expect(mockLedger.createTransactionDraft).not.toHaveBeenCalled();
    expect(mockLedger.postTransactionDraft).not.toHaveBeenCalled();
    expect(mockLedger.editTransaction).not.toHaveBeenCalled();
    expect(mockLedger.voidTransaction).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("writes an income entry only after the explicit preview confirmation", async () => {
    mountPanel();
    await openCreatePreview();

    expect(mockLedger.createTransactionDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

    await waitFor(() => expect(mockLedger.postTransactionDraft).toHaveBeenCalledWith("draft-1", "cash"));
    expect(mockLedger.createTransactionDraft).toHaveBeenCalledWith(expect.objectContaining({
      type: "income", amountPaisa: 125000, categoryId: "stamp", businessDate: "2026-11-17",
    }), "current-user");
  });

  it("reuses the same draft if posting must be retried", async () => {
    mockLedger.postTransactionDraft
      .mockRejectedValueOnce(new Error("Connection lost while confirming the result"))
      .mockResolvedValueOnce({ transaction: { id: "transaction-1" } as never, isQueuedOffline: false });
    mountPanel();
    await openCreatePreview();
    fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));
    await screen.findByText(/Connection lost while confirming the result/);

    fireEvent.click(screen.getByRole("button", { name: "Retry action" }));
    await waitFor(() => expect(mockLedger.postTransactionDraft).toHaveBeenCalledTimes(2));
    expect(mockLedger.createTransactionDraft).toHaveBeenCalledTimes(1);
    expect(mockLedger.postTransactionDraft).toHaveBeenNthCalledWith(1, "draft-1", "cash");
    expect(mockLedger.postTransactionDraft).toHaveBeenNthCalledWith(2, "draft-1", "cash");
  });

  it("asks for clarification when a named service has no matching Shop Pro category", async () => {
    const result = await prepareLedgerMateAction("add printing income Rs 500 cash today", [], testSummary);

    expect(result).toEqual({
      clarification: expect.stringContaining("No active income category matches"),
    });
  });

  it("asks which account to use when multiple active accounts have no configured default", async () => {
    mockLedger.getPaymentAccounts.mockResolvedValue([
      { id: "cash", organization_id: "current-org", name: "Cash drawer", type: "CASH", balance_paisa: 0, current_balance: 0, opening_balance: 0, is_active: true, is_default: false, created_at: "2026-01-01" },
      { id: "bank", organization_id: "current-org", name: "Bank", type: "BANK", balance_paisa: 0, current_balance: 0, opening_balance: 0, is_active: true, is_default: false, created_at: "2026-01-01" },
    ]);

    const result = await prepareLedgerMateAction("add sale Rs 500 stamp paper today", [], testSummary);

    expect(result).toEqual({ clarification: expect.stringContaining("choose the payment account") });
  });

  it("uses the named category to distinguish same-date, same-amount edit targets", async () => {
    const candidates = [transaction("stamp-sale", "Stamp Paper"), transaction("print-sale", "Printing")];
    mockLedger.getAllFilteredTransactions.mockResolvedValue(candidates);

    const result = await prepareLedgerMateAction(
      "edit 5 Nov 2026 Rs 500 Stamp Paper to Rs 700",
      [],
      testSummary,
    );

    expect(result && "pending" in result ? result.pending.kind : null).toBe("edit");
    expect(result && "pending" in result && result.pending.kind === "edit" ? result.pending.transaction.id : null)
      .toBe("stamp-sale");
  });

  it("keeps duplicate void targets in clarification until they are uniquely identified", async () => {
    const candidates = [transaction("stamp-sale", "Stamp Paper"), transaction("stamp-sale-2", "Stamp Paper")];
    mockLedger.getAllFilteredTransactions.mockResolvedValue(candidates);

    const result = await prepareLedgerMateAction("void 5 Nov 2026 Rs 500", [], testSummary);

    expect(result).toEqual({ clarification: expect.stringContaining("multiple transactions") });
    expect(mockLedger.voidTransaction).not.toHaveBeenCalled();
  });
  it("asks the question again without overwriting the original answer or triggering a write",async()=>{
    mockSend.mockResolvedValueOnce({reply:"First answer",model:"test"}).mockResolvedValueOnce({reply:"Second answer",model:"test"});
    mountPanel();
    const input=await screen.findByRole("textbox",{name:"Message LedgerMate AI"});
    await waitFor(()=>expect(input).not.toBeDisabled());
    fireEvent.change(input,{target:{value:"Hello"}});
    fireEvent.keyDown(input,{key:"Enter",shiftKey:false});
    expect(await screen.findByText("First answer")).toBeTruthy();
    await waitFor(()=>expect(screen.getByRole("button",{name:"Ask question again"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button",{name:"Ask question again"}));
    expect(await screen.findByText("Second answer")).toBeTruthy();
    expect(screen.getByText("First answer")).toBeTruthy();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockLedger.createTransactionDraft).not.toHaveBeenCalled();
  });
});
