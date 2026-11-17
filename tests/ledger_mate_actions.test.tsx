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

vi.mock("../src/services/localAiService", () => ({
  checkLedgerMateHealth: vi.fn(async () => ({ status: "ready", provider: "Groq", model: "openai/gpt-oss-20b" })),
  sendLedgerMateMessage: vi.fn(),
}));

import { AiAccountantPanel } from "../src/components/chat/AiAccountantPanel";
import { ledgerService } from "../src/services/ledgerService";
import { sendLedgerMateMessage } from "../src/services/localAiService";

const mockLedger = vi.mocked(ledgerService);
const mockSend = vi.mocked(sendLedgerMateMessage);

function mountPanel() {
  return render(<AiAccountantPanel
    summary={{
      business_date: "2026-11-17", income_paisa: 0, expense_paisa: 0, net_profit_paisa: 0,
      capital_in_paisa: 0, withdrawal_paisa: 0, adjustment_in_paisa: 0, adjustment_out_paisa: 0,
      transaction_count: 0,
    }}
    userId="current-user"
    organizationId="current-org"
    isCloudAccount={false}
  />);
}

async function openCreatePreview() {
  const input = await screen.findByRole("textbox", { name: "Message LedgerMate AI" });
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: "add sale Rs 1,250.00 stamp paper cash today" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
  await screen.findByText("Review ledger action");
}

describe("LedgerMate transaction confirmation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
