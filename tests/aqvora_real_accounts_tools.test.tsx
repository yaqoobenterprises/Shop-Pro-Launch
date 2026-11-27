import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ledgerService } from "../src/services/ledgerService";
import { AccountsView } from "../src/components/accounts/AccountsView";

vi.mock("../src/services/ledgerService", () => ({
  OFFLINE_SYNC_COMPLETE_EVENT: "shop-pro:offline-sync-complete",
  ledgerService: {
    transferBetweenAccounts: vi.fn(),
    createPaymentAccount: vi.fn(),
    getPaymentAccounts: vi.fn(async () => [
      { id: "cash", name: "Cash Drawer", type: "CASH", balance_paisa: 100000,
        is_active: true, is_default: true },
      { id: "bank", name: "Bank", type: "BANK", balance_paisa: 200000,
        is_active: true, is_default: false },
    ]),
  },
}));

describe("AQVORA real payment-account page", () => {
  it("starts with concise cards and exposes exactly one functional form on demand", async () => {
    render(<AccountsView />);
    await waitFor(() => expect(screen.getAllByText("Cash Drawer").length).toBeGreaterThan(0));
    const create = screen.getByRole("button", { name: "New account" });
    const transfer = screen.getByRole("button", { name: "Move money" });
    expect(create.getAttribute("aria-expanded")).toBe("false");
    expect(transfer.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox", { name: "Account name" })).toBeNull();
    fireEvent.click(create);
    expect(create.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Account name" })).toBeTruthy();
    fireEvent.click(transfer);
    expect(create.getAttribute("aria-expanded")).toBe("false");
    expect(transfer.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("combobox", { name: "Account name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Transfer funds" })).toBeTruthy();
    fireEvent.click(transfer);
    expect(transfer.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Transfer funds" })).toBeNull();
  });
  it("reports queued transfers without claiming success and guards repeated submission", async () => {
    let finish!: (queued: boolean) => void;
    const transfer = vi.mocked(ledgerService.transferBetweenAccounts);
    transfer.mockReset();
    transfer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AccountsView />);
    await waitFor(() => expect(screen.getByRole("button", {name:"Move money"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {name:"Move money"}));
    fireEvent.change(screen.getByLabelText("Amount"), {target:{value:"25.50"}});
    const form = screen.getByRole("button",{name:"Transfer funds"}).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith({fromAccountId:"cash",toAccountId:"bank",amountPaisa:2550,notes:"Treasury transfer"});
    finish(true);
    expect(await screen.findByText(/Transfer queued/)).toBeTruthy();
    expect(screen.queryByText(/Transfer confirmed/)).toBeNull();
  });
  it("keeps the form amount after a failed transfer and never displays success", async () => {
    const transfer = vi.mocked(ledgerService.transferBetweenAccounts);
    transfer.mockReset();
    transfer.mockRejectedValue(new Error("Transfer rejected"));
    render(<AccountsView />);
    await waitFor(() => expect(screen.getByRole("button", {name:"Move money"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {name:"Move money"}));
    const input=screen.getByLabelText("Amount");
    fireEvent.change(input,{target:{value:"25.50"}});
    fireEvent.click(screen.getByRole("button",{name:"Transfer funds"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transfer rejected");
    expect(input).toHaveValue("25.50");
    expect(screen.queryByText(/Transfer confirmed/)).toBeNull();
  });
  it("disables account and transfer mutations for an unauthorized view", async () => {
    render(<AccountsView canManage={false} canTransfer={false}/>);
    await waitFor(() => expect(screen.getAllByText("Cash Drawer").length).toBeGreaterThan(0));
    expect(screen.getByRole("button",{name:"New account"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Move money"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Actions for Cash Drawer"}));
    expect(screen.getByRole("button",{name:"Edit Cash Drawer"})).toBeDisabled();
  });
});
