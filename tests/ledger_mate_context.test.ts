import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry, Transaction } from "../src/types/ledger";

vi.mock("../src/services/ledgerService", () => ({
  ledgerService: {
    getAllFilteredTransactions: vi.fn(),
    getFilteredTransactions: vi.fn(),
    getVoidAuditEvents: vi.fn(),
    getMonthlySummary: vi.fn(),
    getMonthlyReport: vi.fn(),
    getPaymentAccounts: vi.fn(),
    getCategories: vi.fn(),
  },
}));

import { ledgerService } from "../src/services/ledgerService";
import { buildLedgerMateAnalysis, buildLedgerMateContext } from "../src/services/ledgerMateContext";

const mockLedger = vi.mocked(ledgerService);

function transaction(
  id: string,
  type: Transaction["type"],
  amountPaisa: number,
  businessDate: string,
  categoryName = "General",
): Transaction {
  return {
    id,
    type,
    amount_paisa: amountPaisa,
    category_id: null,
    category_name: categoryName,
    account_id: "cash-account",
    account_name: "Cash",
    business_date: businessDate,
    device_entry_time: `${businessDate}T10:00:00.000Z`,
    raw_text: categoryName,
    status: "active",
    idempotency_key: id,
    created_by: "current-user",
    created_by_name: "User",
    created_at: `${businessDate}T10:00:00.000Z`,
    updated_at: `${businessDate}T10:00:00.000Z`,
  };
}

describe("LedgerMate verified Shop Pro context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLedger.getAllFilteredTransactions.mockResolvedValue([]);
    mockLedger.getFilteredTransactions.mockResolvedValue({ transactions: [], count: 0 });
    mockLedger.getVoidAuditEvents.mockResolvedValue({ events: [], count: 0 });
    mockLedger.getMonthlySummary.mockResolvedValue(null);
    mockLedger.getMonthlyReport.mockResolvedValue([]);
    mockLedger.getPaymentAccounts.mockResolvedValue([]);
    mockLedger.getCategories.mockResolvedValue([]);
  });

  it("retrieves exact historical daily records and sums integer paisa", async () => {
    mockLedger.getAllFilteredTransactions.mockResolvedValue([
      transaction("sale-1", "income", 125001, "2026-11-05", "Stamp Paper"),
      transaction("expense-1", "expense", 30001, "2026-11-05", "Supplies"),
      transaction("capital-1", "capital_in", 90000, "2026-11-05", "Owner capital"),
    ]);

    const context = await buildLedgerMateContext("5 Nov 2026 ki sale details", [], "2026-11-17");

    expect(mockLedger.getAllFilteredTransactions).toHaveBeenCalledWith({
      startDate: "2026-11-05", endDate: "2026-11-05", status: "active",
    }, { requireCloudSource: true });
    expect(context).toContain("Income: 125001 paisa");
    expect(context).toContain("Expenses: 30001 paisa");
    expect(context).toContain("Net result (income minus expenses): 95000 paisa");
    expect(context).toContain("Capital received (excluded from income and profit): 90000 paisa");
  });

  it("uses paginated ledger service results for all-time service keyword searches", async () => {
    mockLedger.getAllFilteredTransactions.mockResolvedValue([
      transaction("stamp-income", "income", 200000, "2025-02-03", "Stamp Paper"),
      transaction("stamp-expense", "expense", 20000, "2025-02-04", "Stamp supplies"),
      transaction("print-income", "income", 50000, "2025-02-05", "Printing"),
    ]);

    const context = await buildLedgerMateContext("Stamp paper se kitni earning hui?", [], "2026-11-17");

    expect(mockLedger.getAllFilteredTransactions).toHaveBeenCalledWith(
      { status: "active" },
      { requireCloudSource: true },
    );
    expect(context).toContain("Keyword-matched service records: 2; income 200000 paisa; expenses 20000 paisa");
    expect(context).toContain("Income categories among matched service records: Stamp Paper 200000 paisa");
  });

  it("answers a service income question from matching historical records, not the whole ledger total", async () => {
    mockLedger.getAllFilteredTransactions.mockResolvedValue([
      transaction("stamp-income", "income", 125000, "2025-02-03", "Stamp Paper"),
      transaction("stamp-expense", "expense", 20000, "2025-02-04", "Stamp supplies"),
      transaction("print-income", "income", 75000, "2025-02-05", "Printing"),
    ]);

    const analysis = await buildLedgerMateAnalysis("Stamp paper se kitni earning hui?", [], "2026-11-17");

    expect(analysis.directAnswer).toContain("Rs 1,250.00");
    expect(analysis.directAnswer).not.toContain("Rs 2,000.00");
    expect(analysis.directAnswer).toContain("ab tak");
    expect(analysis.reportMarkdown).toContain("Ab tak");
  });

  it("calculates month-over-month figures from the two monthly ledger summaries", async () => {
    mockLedger.getMonthlySummary.mockImplementation(async (year: number, month: number) => ({
      year,
      month,
      month_start: `${year}-${String(month).padStart(2, "0")}-01`,
      income_paisa: month === 10 ? 100000 : 150000,
      expense_paisa: month === 10 ? 20000 : 30000,
      net_profit_paisa: month === 10 ? 80000 : 120000,
      capital_in_paisa: 0,
      withdrawal_paisa: 0,
      adjustment_in_paisa: 0,
      adjustment_out_paisa: 0,
    }));

    const context = await buildLedgerMateContext("Last month ke comparison mein sales kitni increase hui?", [], "2026-11-17");

    expect(mockLedger.getMonthlySummary).toHaveBeenNthCalledWith(1, 2026, 10, { requireCloudSource: true });
    expect(mockLedger.getMonthlySummary).toHaveBeenNthCalledWith(2, 2026, 11, { requireCloudSource: true });
    expect(context).toContain("Income: 2026-10 100000 paisa; 2026-11 150000 paisa; increase 50000 paisa (50.00%)");
    expect(context).toContain("Net result: 2026-10 80000 paisa; 2026-11 120000 paisa; increase 40000 paisa (50.00%)");
  });

  it("keeps current account balances distinct from period profit", async () => {
    mockLedger.getPaymentAccounts.mockResolvedValue([
      { id: "cash", organization_id: "org", name: "Cash drawer", type: "CASH", balance_paisa: 125000, current_balance: 125000, opening_balance: 0, is_active: true, is_default: true, created_at: "2026-01-01" },
      { id: "bank", organization_id: "org", name: "Bank", type: "BANK", balance_paisa: 75000, current_balance: 75000, opening_balance: 0, is_active: true, is_default: false, created_at: "2026-01-01" },
    ]);

    const context = await buildLedgerMateContext("Cash aur bank balance kitna hai?", [], "2026-11-17");

    expect(context).toContain("cash 125000 paisa; bank 75000 paisa");
    expect(context).toContain("these are balances, not profit");
  });

  it("does not answer historical totals from a cached fallback when the cloud read fails", async () => {
    mockLedger.getAllFilteredTransactions.mockRejectedValueOnce(
      new Error("Shop Pro could not retrieve complete transaction history from the cloud. No cached totals were used."),
    );

    await expect(buildLedgerMateContext("5 Nov 2026 ki sale kitni thi?", [], "2026-11-17"))
      .rejects.toThrow("No cached totals were used");
  });

  it("answers a short void follow-up from the inherited day and the audit history", async () => {
    const event: AuditLogEntry = {
      id: "void-event-1",
      transaction_id: "voided-sale-1",
      action: "void",
      old_data: { id: "voided-sale-1", type: "income", amount_paisa: 12000, category_id: "stamp", business_date: "2026-11-17" },
      new_data: { id: "voided-sale-1", type: "income", amount_paisa: 12000, category_id: "stamp", business_date: "2026-11-17", status: "voided", void_reason: "Duplicate entry" },
      changed_by: "current-user",
      changed_by_name: "Shop Owner",
      created_at: "2026-11-17T08:00:00.000Z",
    };
    mockLedger.getVoidAuditEvents.mockResolvedValue({ events: [event], count: 1 });
    mockLedger.getCategories.mockResolvedValue([{ id: "stamp", name: "Stamp Paper", kind: "income", unusual_amount_limit_paisa: 0, is_default: false, is_active: true, display_order: 1, created_at: "2026-01-01" }]);

    const analysis = await buildLedgerMateAnalysis("kuch void hua?", [
      { role: "user", content: "Aaj ki total sale kitni hai?" },
      { role: "assistant", content: "Aaj ki total sale Rs 120.00 hai." },
    ], "2026-11-17");

    expect(mockLedger.getVoidAuditEvents).toHaveBeenCalledWith({
      startAt: "2026-11-17T00:00:00+05:00",
      beforeAt: "2026-11-18T00:00:00+05:00",
      limit: 8,
    }, { requireCloudSource: true });
    expect(analysis.directAnswer).toContain("1 transaction void hui");
    expect(analysis.reportMarkdown).toContain("Stamp Paper");
    expect(analysis.reportMarkdown).toContain("Duplicate entry");
    expect(mockLedger.getAllFilteredTransactions).not.toHaveBeenCalled();
  });

  it("uses an exact monthly audit count instead of reporting that void data is missing", async () => {
    mockLedger.getVoidAuditEvents.mockResolvedValue({ events: [], count: 2 });

    const analysis = await buildLedgerMateAnalysis("is month kitni transactions voided hui?", [], "2026-11-17");

    expect(mockLedger.getVoidAuditEvents).toHaveBeenCalledWith({
      startAt: "2026-11-01T00:00:00+05:00",
      beforeAt: "2026-12-01T00:00:00+05:00",
      limit: 8,
    }, { requireCloudSource: true });
    expect(analysis.directAnswer).toContain("2 transactions void hui hain");
    expect(analysis.reportMarkdown).toContain("2");
    expect(analysis.reportMarkdown).toContain("matching void records gine hain");
  });
});
