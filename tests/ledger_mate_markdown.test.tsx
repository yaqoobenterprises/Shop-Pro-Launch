import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../src/components/chat/LedgerMateMarkdown";

describe("LedgerMate financial Markdown", () => {
  it("renders verified metric tables as financial summary cards", () => {
    render(<MarkdownMessage content={[
      "### Verified Shop Pro summary",
      "",
      "| Metric | Amount |",
      "| --- | --- |",
      "| Income / sales recorded | Rs 1,250.00 |",
      "| Expenses | Rs 300.00 |",
    ].join("\n")} />);

    expect(screen.getByText("Verified Shop Pro summary")).toBeInTheDocument();
    expect(screen.getByText("Rs 1,250.00")).toBeInTheDocument();
    expect(screen.getByText("Rs 300.00")).toBeInTheDocument();
    expect(document.querySelector(".lm-report-cards")).toBeInTheDocument();
  });

  it("renders category totals as a chart with an accessible source table", () => {
    render(<MarkdownMessage content={[
      "| Category | Amount | Transactions |",
      "| --- | --- | --- |",
      "| Printing | Rs 1,250.00 | 5 |",
      "| Stamp Paper | Rs 750.00 | 3 |",
    ].join("\n")} />);

    expect(document.querySelector(".lm-chart-card")).toBeInTheDocument();
    expect(screen.getByText("View data table")).toBeInTheDocument();
    expect(screen.getAllByText("Printing").length).toBeGreaterThan(0);
    expect(document.querySelector('[role="img"]')).not.toBeInTheDocument();
  });
});
