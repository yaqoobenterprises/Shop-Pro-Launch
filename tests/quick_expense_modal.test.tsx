import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickExpenseModal } from "../src/components/expenses/QuickExpenseModal";
import { accountRepo, expenseRepo } from "../src/services";

const { showToast, setIsQuickExpenseOpen, refreshData } = vi.hoisted(() => ({
  showToast: vi.fn(),
  setIsQuickExpenseOpen: vi.fn(),
  refreshData: vi.fn(),
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    organization: {
      id: "shop-1",
      currency_symbol: "Rs",
    },
    user: { full_name: "Shop Operator" },
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

vi.mock("../src/services", () => ({
  expenseRepo: {
    getCategories: vi.fn(),
    createExpense: vi.fn(),
  },
  accountRepo: {
    getAccounts: vi.fn(),
  },
}));

const expenseCategories = [
  { id: "rent", organization_id: "shop-1", name: "Rent", is_active: true },
  { id: "transport", organization_id: "shop-1", name: "Transport", is_active: true },
];
const accounts = [
  {
    id: "cash",
    organization_id: "shop-1",
    name: "Cash",
    is_default: true,
    current_balance: 2_000,
  },
  {
    id: "bank",
    organization_id: "shop-1",
    name: "Bank",
    is_default: false,
    current_balance: 20_000,
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("shop-configured quick expense form", () => {
  const chooseOption = (label: string, optionName: string) => {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
    fireEvent.click(screen.getByRole("option", { name: optionName }));
  };

  it("lets the user choose the shop's category and payment account", async () => {
    vi.mocked(expenseRepo.getCategories).mockResolvedValue(expenseCategories as never);
    vi.mocked(accountRepo.getAccounts).mockResolvedValue(accounts as never);
    vi.mocked(expenseRepo.createExpense).mockResolvedValue({
      amount: 125,
      account_name: "Bank",
    } as never);

    render(<QuickExpenseModal />);

    const category = await screen.findByRole("combobox", { name: "Expense category" });
    const paymentAccount = screen.getByRole("combobox", { name: "Paid from" });
    expect(category.textContent).toContain("Rent");
    expect(paymentAccount.textContent).toContain("Cash");

    chooseOption("Expense category", "Transport");
    chooseOption("Paid from", "Bank");
    fireEvent.change(screen.getByRole("spinbutton", { name: /Amount/ }), {
      target: { value: "125" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Courier delivery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Expense/ }));

    await waitFor(() => expect(expenseRepo.createExpense).toHaveBeenCalledWith(
      "shop-1",
      expect.objectContaining({
        category_id: "transport",
        account_id: "bank",
        description: "Courier delivery",
      }),
    ));
  });

  it("surfaces missing shop expense configuration instead of hiding the required choices", async () => {
    vi.mocked(expenseRepo.getCategories).mockResolvedValue([]);
    vi.mocked(accountRepo.getAccounts).mockResolvedValue([]);

    render(<QuickExpenseModal />);

    expect(await screen.findByText(/No expense categories are configured/)).toBeTruthy();
    expect(screen.getByText(/Add an active payment account/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save Expense/ })).toBeDisabled();
  });

  it("shows a recoverable error when the shop's expense metadata cannot be loaded", async () => {
    vi.mocked(expenseRepo.getCategories).mockRejectedValue(new Error("Network unavailable"));
    vi.mocked(accountRepo.getAccounts).mockResolvedValue(accounts as never);

    render(<QuickExpenseModal />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Expense categories and accounts could not be loaded.",
    );
    expect(screen.getByRole("button", { name: /Save Expense/ })).toBeDisabled();
  });
});
