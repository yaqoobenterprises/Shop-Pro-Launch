import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AnimatedAmount } from "../src/components/common/AnimatedAmount";
import { Modal } from "../src/components/common/Modal";
import { Select } from "../src/components/common/Select";
import { formatPaisa } from "../src/lib/money";

describe("Shop Plus shared design-system contracts", () => {
  it("displays exact financial values without animation, including negative values", () => {
    const { rerender } = render(<AnimatedAmount amountPaisa={125050} />);
    expect(screen.getByText(formatPaisa(125050))).toBeInTheDocument();
    rerender(<AnimatedAmount amountPaisa={-2600} />);
    expect(screen.getByText(formatPaisa(-2600))).toBeInTheDocument();
    rerender(<AnimatedAmount amountPaisa={0} />);
    expect(screen.getByText(formatPaisa(0))).toBeInTheDocument();
  });

  it("distinguishes unavailable and pending values from zero", () => {
    const { rerender } = render(<AnimatedAmount amountPaisa={0} loading />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    rerender(<AnimatedAmount amountPaisa={0} error />);
    expect(screen.getByLabelText("Amount unavailable")).toBeInTheDocument();
    rerender(<AnimatedAmount amountPaisa={NaN} />);
    expect(screen.getByLabelText("Amount unavailable")).toBeInTheDocument();
  });

  it("contains keyboard focus and restores the trigger on close", () => {
    function Demo() {
      const [open, setOpen] = React.useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open review</button>
        <Modal isOpen={open} title="Review transaction" onClose={() => setOpen(false)}>
          <button type="button">Confirm</button>
        </Modal>
      </>;
    }
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Open review" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Review transaction" });
    const close = screen.getByRole("button", { name: "Close dialog" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(dialog).toContainElement(close);
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps a nested select inside modal focus scope and closes the popup first", () => {
    const close = vi.fn();
    render(<Modal isOpen title="Review" onClose={close}>
      <Select value="cash" onChange={vi.fn()} aria-label="Account" searchable>
        <option value="cash">Cash drawer</option>
        <option value="bank">Bank account</option>
      </Select>
    </Modal>);
    const dialog = screen.getByRole("dialog", { name: "Review" });
    const trigger = screen.getByRole("combobox", { name: "Account" });
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox");
    expect(dialog).toContainElement(search);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

const tokenCss = readFileSync("src/styles/tokens.css", "utf8");
const tokens = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6});/g)].map((match) => [match[1], match[2]]));
const light = tokens(tokenCss.split(":root.dark")[0]);
const dark = { ...light, ...tokens(tokenCss.split(":root.dark")[1]) };
function luminance(hex: string): number {
  const values = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + 0.05) / (pair[1] + 0.05);
}
describe("Ledger Ink token contrast", () => {
  for (const [mode, palette] of [["light", light], ["dark", dark]] as const) {
    it(`meets 4.5:1 for core ${mode} text pairings`, () => {
      for (const [fg, bg] of [
        ["--ink", "--paper"], ["--muted", "--paper"], ["--ink", "--surface-card"],
        ["--muted", "--surface-card"], ["--forest", "--surface-card"],
        ["--on-primary", "--forest"], ["--green", "--good-bg"],
        ["--danger", "--danger-bg"], ["--orange", "--warn-bg"],
      ]) {
        expect(contrast(palette[fg], palette[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
