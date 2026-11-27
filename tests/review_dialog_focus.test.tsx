import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReviewDialog } from "../src/components/chat/ReviewDialog";
import { DialogTitle } from "../src/components/ui/dialog";
import { DatePicker } from "../src/components/common/DatePicker";
import { Select } from "../src/components/common/Select";
describe("transaction dialog portal interactions", () => {
  it("allows date and account popovers inside a focused review dialog", () => {
    const changeDate = vi.fn(), changeAccount = vi.fn(), cancel = vi.fn();
    render(<ReviewDialog busy={false} onCancel={cancel}><DialogTitle>Review transaction</DialogTitle><DatePicker value="2026-10-15" onChange={changeDate} ariaLabel="Business date" /><Select aria-label="Account" value="cash" onChange={changeAccount}><option value="cash">Cash</option><option value="bank">Bank</option></Select></ReviewDialog>);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar: Business date" }));
    const label = new Intl.DateTimeFormat(document.documentElement.lang || undefined, { dateStyle: "full" }).format(new Date(2026, 9, 20));
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(changeDate).toHaveBeenCalledWith("2026-10-20");
    fireEvent.click(screen.getByRole("combobox", { name: "Account" }));
    fireEvent.click(screen.getByRole("option", { name: "Bank", exact: true }));
    expect(changeAccount).toHaveBeenCalledWith({ target: { value: "bank" } });
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Review transaction" })).toBeTruthy();
  });
  it("keeps a posting review open when Escape is pressed", () => {
    const cancel = vi.fn();
    render(<ReviewDialog busy onCancel={cancel}><DialogTitle>Posting transaction</DialogTitle><button>Posting</button></ReviewDialog>);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(cancel).not.toHaveBeenCalled();
  });
});
