import { describe, expect, it } from "vitest";
import { buildPremiumXlsx } from "../src/lib/premiumXlsx";
import { buildReportCategoryBreakdown, buildReportTrend, calculateReportTotals } from "../src/lib/reportAnalytics";
import type { Transaction } from "../src/types/ledger";

const transaction = (
  id: string,
  date: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string | null,
  categoryName: string,
): Transaction => ({
  id,
  type,
  amount_paisa: amount,
  category_id: categoryId,
  category_name: categoryName,
  account_id: "cash",
  account_name: "Cash Wallet",
  business_date: date,
  device_entry_time: `${date}T12:00:00.000Z`,
  note: null,
  raw_text: `${categoryName} ${amount / 100}`,
  status: "active",
  idempotency_key: id,
  created_by: "owner",
  created_by_name: "Owner",
  created_at: `${date}T12:00:00.000Z`,
  updated_at: `${date}T12:00:00.000Z`,
});

describe("report analytics", () => {
  const records = [
    transaction("income-1", "2026-10-05", "income", 13000, "print", "Colour Print"),
    transaction("expense-1", "2026-10-05", "expense", 2000, "paper", "Paper"),
    transaction("income-2", "2026-10-12", "income", 5000, "print", "Colour Print"),
    transaction("capital-1", "2026-10-12", "capital_in", 100000, null, "Capital"),
  ];

  it("calculates operating profit separately from capital and drawings", () => {
    expect(calculateReportTotals(records)).toMatchObject({
      income_paisa: 18000,
      expense_paisa: 2000,
      net_profit_paisa: 16000,
      capital_in_paisa: 100000,
      withdrawal_paisa: 0,
      transaction_count: 4,
    });
  });

  it("groups category totals by both category and transaction type", () => {
    const categories = buildReportCategoryBreakdown(records);
    expect(categories.find((item) => item.category_name === "Colour Print" && item.type === "income"))
      .toMatchObject({ total_paisa: 18000, entry_count: 2 });
    expect(categories.find((item) => item.category_name === "Paper" && item.type === "expense"))
      .toMatchObject({ total_paisa: 2000, entry_count: 1 });
  });

  it("uses daily buckets for short date ranges and keeps empty days visible", () => {
    const trend = buildReportTrend(records, "2026-10-05", "2026-10-07");
    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({ income_paisa: 13000, expense_paisa: 2000, net_profit_paisa: 11000 });
    expect(trend[1]).toMatchObject({ income_paisa: 0, expense_paisa: 0, transaction_count: 0 });
  });
});

describe("premium Excel workbook", () => {
  it("produces a valid XLSX zip container with styled tables, filters and frozen headers", () => {
    const workbook = buildPremiumXlsx([{
      name: "Transactions",
      title: "SHOP PRO | FINANCIAL REPORT",
      subtitle: "2026-10-01 to 2026-10-31",
      metadata: "Active transactions only",
      columns: [
        { header: "Description", width: 36 },
        { header: "Amount (Rs)", width: 18, kind: "money" },
      ],
      rows: [{ values: ["=1+1 is text, not a formula", 125.5] }],
      autoFilter: true,
      freezeRows: 5,
    }]);

    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const payload = new TextDecoder().decode(workbook);
    expect(payload).toContain("xl/workbook.xml");
    expect(payload).toContain("SHOP PRO | FINANCIAL REPORT");
    expect(payload).toContain('autoFilter ref="A5:B6"');
    expect(payload).toContain('ySplit="5"');
    expect(payload).toContain("&quot;Rs &quot;");
    expect(payload).toContain("=1+1 is text, not a formula");
    expect(payload).not.toContain("<f>");
  });
});
