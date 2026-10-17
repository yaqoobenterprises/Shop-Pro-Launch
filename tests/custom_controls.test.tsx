import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DatePicker } from "../src/components/common/DatePicker";
import { MonthPicker } from "../src/components/common/MonthPicker";
import { Select } from "../src/components/common/Select";

describe("branded date and select controls", () => {
  it("opens a searchable listbox and reports the selected value", () => {
    const onChange = vi.fn();
    render(
      <Select value="cash" onChange={onChange} aria-label="Account" searchable>
        <option value="cash">Cash drawer</option>
        <option value="bank">Bank account</option>
      </Select>,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Account" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search options…" }), {
      target: { value: "bank" },
    });
    expect(screen.getByRole("option", { name: "Bank account" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Cash drawer" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Bank account" }));

    expect(onChange).toHaveBeenCalledWith({ target: { value: "bank" } });
  });

  it("uses a custom calendar and returns the selected ISO date", () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-10-15" onChange={onChange} ariaLabel="Business date" />);

    fireEvent.click(screen.getByRole("button", { name: "Open calendar: Business date" }));
    const dateLabel = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      dateStyle: "full",
    }).format(new Date(2026, 9, 20));
    fireEvent.click(screen.getByRole("button", { name: dateLabel }));

    expect(onChange).toHaveBeenCalledWith("2026-10-20");
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("chooses a month from the branded month grid", () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-10" onChange={onChange} ariaLabel="Filter month" />);

    fireEvent.click(screen.getByRole("button", { name: "Filter month" }));
    const february = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      month: "long",
    }).format(new Date(2024, 1, 1));
    fireEvent.click(screen.getByRole("button", { name: february }));

    expect(onChange).toHaveBeenCalledWith("2026-02-01");
    expect(document.querySelector('input[type="month"]')).toBeNull();
  });
});
