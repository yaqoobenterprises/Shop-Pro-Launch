import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickExpenseModal } from "../src/components/expenses/QuickExpenseModal";

const {
  showToast,
  setIsQuickExpenseOpen,
  refreshData,
  getCategories,
  getPaymentAccounts,
  createTransactionDraft,
  postTransactionDraft,
} = vi.hoisted(() => ({
  showToast: vi.fn(),
  setIsQuickExpenseOpen: vi.fn(),
  refreshData: vi.fn(),
  getCategories: vi.fn(),
  getPaymentAccounts: vi.fn(),
  createTransactionDraft: vi.fn(),
  postTransactionDraft: vi.fn(),
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    organization: {
      id: "shop-1",
      currency_symbol: "Rs",
    },
    user: { id: "operator-1", full_name: "Shop Operator" },
  }),
}));

vi.mock("../src/context/AppContext", () => ({
  useApp: () => ({
    isQuickExpenseOpen: true,
    setIsQuickExpenseOpen,
    refreshData,
    showToast,
  }),
}));

vi.mock("../src/services/ledgerService", () => ({
  ledgerService: {
    getCategories,
    getPaymentAccounts,
    createTransactionDraft,
    postTransactionDraft,
  },
}));

const expenseCategories = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Printing Income",
    kind: "income",
    unusual_amount_limit_paisa: 5_000_000,
    is_default: true,
    is_active: true,
    display_order: 0,
    created_at: "",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Rent",
    kind: "expense",
    unusual_amount_limit_paisa: 5_000_000,
    is_default: true,
    is_active: true,
    display_order: 1,
    created_at: "",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Transport",
    kind: "expense",
    unusual_amount_limit_paisa: 5_000_000,
    is_default: false,
    is_active: true,
    display_order: 2,
    created_at: "",
  },
];

const accounts = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    organization_id: "shop-1",
    name: "Cash",
    type: "CASH",
    balance_paisa: 200_000,
    current_balance: 2_000,
    opening_balance: 2_000,
    is_active: true,
    is_default: true,
    created_at: "",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    organization_id: "shop-1",
    name: "Bank",
    type: "BANK",
    balance_paisa: 2_000_000,
    current_balance: 20_000,
    opening_balance: 20_000,
    is_active: true,
    is_default: false,
    created_at: "",
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("ledger-backed quick expense form", () => {
  const chooseOption = (label: string, optionName: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
    fireEvent.click(screen.getByRole("option", { name: optionName }));
  };

  const fillExpense = () => {
    fireEvent.change(screen.getByRole("textbox", { name: /Amount/ }), {
      target: { value: "125.50" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Courier delivery" },
    });
    fireEvent.click(screen.getByText("Add receipt reference or notes"));
    fireEvent.change(screen.getByRole("textbox", { name: /Bill \/ Receipt Ref/ }), {
      target: { value: "INV-12345" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Additional Notes/ }), {
      target: { value: "Paid to courier" },
    });
  };

  it("loads modern expense categories and accounts, then posts integer paisa through the ledger draft RPC", async () => {
    getCategories.mockResolvedValue(expenseCategories);
    getPaymentAccounts.mockResolvedValue(accounts);
    createTransactionDraft.mockResolvedValue({ id: "draft-1" });
    postTransactionDraft.mockResolvedValue({
      transaction: { id: "transaction-1" },
      isQueuedOffline: false,
    });

    render(<QuickExpenseModal />);

    const category = await screen.findByRole("combobox", { name: "Expense category" });
    const paymentAccount = screen.getByRole("combobox", { name: "Paid from" });
    expect(category.textContent).toContain("Rent");
    expect(category.textContent).not.toContain("Printing Income");
    expect(paymentAccount.textContent).toContain("Cash");

    chooseOption("Expense category", "Transport");
    chooseOption("Paid from", "Bank");
    fillExpense();
    fireEvent.click(screen.getByRole("button", { name: /Save Expense/ }));

    await waitFor(() => expect(createTransactionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "expense",
        amountPaisa: 12_550,
        categoryId: expenseCategories[2].id,
        categoryName: "Transport",
        rawText: "Quick expense: Courier delivery | Receipt reference: INV-12345 | Notes: Paid to courier",
        note: "Receipt reference: INV-12345 | Notes: Paid to courier",
      }),
      "operator-1",
    ));
    expect(postTransactionDraft).toHaveBeenCalledWith(
      "draft-1",
      accounts[1].id,
    );
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Expense recorded",
      expect.stringContaining("Bank"),
    );
    expect(setIsQuickExpenseOpen).toHaveBeenCalledWith(false);
    expect(refreshData).toHaveBeenCalled();
  });

  it("keeps a saved expense queued when the ledger is offline", async () => {
    getCategories.mockResolvedValue(expenseCategories);
    getPaymentAccounts.mockResolvedValue(accounts);
    createTransactionDraft.mockResolvedValue({ id: "offline-draft-1" });
    postTransactionDraft.mockResolvedValue({ isQueuedOffline: true });

    render(<QuickExpenseModal />);

    await screen.findByRole("combobox", { name: "Expense category" });
    fillExpense();
    fireEvent.click(screen.getByRole("button", { name: /Save Expense/ }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      "warning",
      "Expense saved offline",
      expect.stringContaining("will post"),
    ));
    expect(setIsQuickExpenseOpen).toHaveBeenCalledWith(false);
    expect(refreshData).toHaveBeenCalled();
  });

  it("surfaces missing shop expense configuration instead of hiding the required choices", async () => {
    getCategories.mockResolvedValue([]);
    getPaymentAccounts.mockResolvedValue([]);

    render(<QuickExpenseModal />);

    expect(await screen.findByText(/No expense categories are configured/)).toBeTruthy();
    expect(screen.getByText(/Add an active payment account/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Expense/ })).toBeDisabled();
  });

  it("shows a recoverable error when the shop's ledger metadata cannot be loaded", async () => {
    getCategories.mockRejectedValue(new Error("Network unavailable"));
    getPaymentAccounts.mockResolvedValue(accounts);

    render(<QuickExpenseModal />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Expense categories and accounts could not be loaded.",
    );
    expect(screen.getByRole("button", { name: /Save Expense/ })).toBeDisabled();
  });

  it("rejects malformed amounts instead of accepting a numeric prefix", async () => {
    getCategories.mockResolvedValue(expenseCategories);
    getPaymentAccounts.mockResolvedValue(accounts);

    render(<QuickExpenseModal />);

    await screen.findByRole("combobox", { name: "Expense category" });
    fireEvent.change(screen.getByRole("textbox", { name: /Amount/ }), {
      target: { value: "123abc" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Courier delivery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Expense/ }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      "error",
      "Invalid Amount",
      expect.any(String),
    ));
    expect(createTransactionDraft).not.toHaveBeenCalled();
    expect(postTransactionDraft).not.toHaveBeenCalled();
  });
});
