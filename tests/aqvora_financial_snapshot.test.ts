import { describe, expect, it } from "vitest";
import { buildFinancialSnapshot } from "../src/accounting/financialSnapshot";
import type {
  AccountingSnapshotInput, ChartAccount, JournalLineInput, PostedJournal,
} from "../src/accounting/types";

const organizationId = "retailer-1";
const makeAccount = (id: string, code: string, accountClass: ChartAccount["accountClass"],
  role?: ChartAccount["controlRole"]): ChartAccount => ({
  id, code, name: id.toUpperCase(), accountClass,
  normalSide: ["liability", "equity", "revenue", "other_income"].includes(accountClass) ? "credit" : "debit",
  organizationId, parentId: null, isPosting: true, isActive: true,
  ...(role ? { controlRole: role } : {}),
});
const accounts = [
  makeAccount("bank", "1020", "asset", "cash"),
  makeAccount("ar", "1100", "asset", "receivable"),
  makeAccount("stock", "1200", "asset", "inventory"),
  makeAccount("ap", "2010", "liability", "payable"),
  makeAccount("revenue", "4010", "revenue"),
  makeAccount("cogs", "5010", "cost_of_sales"),
];
type Side = "debit" | "credit";
const line = (lineId: string, accountId: string, side: Side, minor: string,
  refs: Pick<JournalLineInput, "partyId" | "openItemId" | "stockMovementId"> = {}): JournalLineInput => ({
  lineId, accountId,
  debitMinor: side === "debit" ? minor : "0",
  creditMinor: side === "credit" ? minor : "0",
  ...refs,
});
const journal = (id: string, date: string, lines: JournalLineInput[]): PostedJournal => ({
  id, intentId: `intent-${id}`, organizationId, currency: "PKR",
  businessDate: date, status: "posted", lines,
});

/** 3 items at Rs60 on vendor credit; sell 2 at Rs100, collect Rs80, pay Rs60. */
const sampleJournals: PostedJournal[] = [
  journal("stock-purchase", "2026-11-01", [
    line("1", "stock", "debit", "18000", { stockMovementId: "purchase-receipt" }),
    line("2", "ap", "credit", "18000", { partyId: "vendor-1", openItemId: "bill-1" }),
  ]),
  journal("sale-invoice", "2026-11-02", [
    line("1", "ar", "debit", "20000", { partyId: "customer-1", openItemId: "invoice-1" }),
    line("2", "revenue", "credit", "20000"),
  ]),
  journal("stock-issue", "2026-11-02", [
    line("1", "cogs", "debit", "12000"),
    line("2", "stock", "credit", "12000", { stockMovementId: "sale-stock-issue" }),
  ]),
  journal("customer-receipt", "2026-11-04", [
    line("1", "bank", "debit", "8000"),
    line("2", "ar", "credit", "8000", { partyId: "customer-1", openItemId: "invoice-1" }),
  ]),
  journal("vendor-payment", "2026-11-04", [
    line("1", "ap", "debit", "6000", { partyId: "vendor-1", openItemId: "bill-1" }),
    line("2", "bank", "credit", "6000"),
  ]),
];
const payload: AccountingSnapshotInput = {
  organizationId, currency: "PKR", asOfDate: "2026-11-20",
  sourceComplete: true, accounts, journals: sampleJournals,
};
const row = (rows: ReturnType<typeof buildFinancialSnapshot>["trialBalance"]["rows"], id: string) =>
  rows.find((item) => item.accountId === id);

describe("AQVORA exact posted-journal reports", () => {
  it("reconciles the blueprint stock/credit fixture to a balanced TB, earnings and balance sheet", () => {
    const result = buildFinancialSnapshot(payload);
    expect(result.trialBalance.totalDebitMinor).toBe("64000");
    expect(result.trialBalance.totalCreditMinor).toBe("64000");
    expect(result.trialBalance.closingDebitMinor).toBe("32000");
    expect(result.trialBalance.closingCreditMinor).toBe("32000");
    expect(row(result.trialBalance.rows, "bank")?.closingDebitMinor).toBe("2000");
    expect(row(result.trialBalance.rows, "ar")?.closingDebitMinor).toBe("12000");
    expect(row(result.trialBalance.rows, "stock")?.closingDebitMinor).toBe("6000");
    expect(row(result.trialBalance.rows, "ap")?.closingCreditMinor).toBe("12000");
    expect(result.incomeStatement).toMatchObject({
      revenueMinor: "20000", costOfSalesMinor: "12000", netEarningsMinor: "8000",
    });
    expect(result.balanceSheet).toMatchObject({
      assetsMinor: "20000", liabilitiesMinor: "12000",
      unclosedEarningsMinor: "8000", differenceMinor: "0",
    });
  });

  it("applies as-of cutoff rather than leaking subsequent receipts into earlier balances", () => {
    const result = buildFinancialSnapshot({ ...payload, asOfDate: "2026-11-03" });
    expect(row(result.trialBalance.rows, "bank")?.closingDebitMinor).toBe("0");
    expect(row(result.trialBalance.rows, "ar")?.closingDebitMinor).toBe("20000");
    expect(row(result.trialBalance.rows, "ap")?.closingCreditMinor).toBe("18000");
    expect(result.balanceSheet).toMatchObject({
      assetsMinor: "26000", liabilitiesMinor: "18000", unclosedEarningsMinor: "8000",
    });
  });

  it("keeps inactive/archived posting leaves in historic financial reports", () => {
    const archived = accounts.map((account) => account.id === "ar" ? { ...account, isActive: false } : account);
    expect(row(buildFinancialSnapshot({ ...payload, accounts: archived }).trialBalance.rows, "ar")?.closingDebitMinor)
      .toBe("12000");
  });

  it("includes original and reversing journals exactly once rather than double-subtracting", () => {
    const original = journal("cash-sale", "2026-11-08", [
      line("1", "bank", "debit", "1250"), line("2", "revenue", "credit", "1250"),
    ]);
    const reversal = journal("cash-sale-reversal", "2026-11-09", [
      line("1", "bank", "credit", "1250"), line("2", "revenue", "debit", "1250"),
    ]);
    const result = buildFinancialSnapshot({ ...payload, journals: [original, reversal] });
    expect(result.trialBalance.totalDebitMinor).toBe("2500");
    expect(result.trialBalance.totalCreditMinor).toBe("2500");
    expect(result.trialBalance.closingDebitMinor).toBe("0");
    expect(result.incomeStatement.netEarningsMinor).toBe("0");
    expect(result.balanceSheet.differenceMinor).toBe("0");
  });

  it("rejects incomplete data, cross-tenant lines and currency substitution", () => {
    expect(() => buildFinancialSnapshot({ ...payload, sourceComplete: false })).toThrow(/incomplete/i);
    expect(() => buildFinancialSnapshot({ ...payload, currency: "USD" })).toThrow(/different company or currency/i);
    expect(() => buildFinancialSnapshot({
      ...payload, accounts: [{ ...accounts[0], organizationId: "other-company" }, ...accounts.slice(1)],
    })).toThrow(/another company/i);
    expect(() => buildFinancialSnapshot({ ...payload, asOfDate: "2026-11-31" })).toThrow(/cutoff/i);
  });

  it("rejects duplicated intent keys and imbalanced/corrupted posted journals", () => {
    expect(() => buildFinancialSnapshot({
      ...payload, journals: [...sampleJournals, { ...sampleJournals[0], id: "duplicate", intentId: "intent-stock-purchase" }],
    })).toThrow(/duplicate or missing journal\/intent/i);
    const bad = { ...sampleJournals[0], lines: [
      { ...sampleJournals[0].lines[0], debitMinor: "18001" },
      sampleJournals[0].lines[1],
    ] };
    expect(() => buildFinancialSnapshot({ ...payload, journals: [bad] })).toThrow(/not exactly balanced/i);
    const side = { ...sampleJournals[0], lines: [
      { ...sampleJournals[0].lines[0], creditMinor: "1" }, sampleJournals[0].lines[1],
    ] };
    expect(() => buildFinancialSnapshot({ ...payload, journals: [side] })).toThrow(/side invariant/i);
  });

  it("rejects out-of-range posted money even when a fake two-sided amount matches", () => {
    const max = "9223372036854775808";
    expect(() => buildFinancialSnapshot({
      ...payload, journals: [journal("overflow", "2026-11-10", [
        line("1", "bank", "debit", max), line("2", "revenue", "credit", max),
      ])],
    })).toThrow(/64-bit/i);
  });

  it("treats transfers as balance-neutral with no revenue/expense recognition", () => {
    const cash = makeAccount("cash", "1010", "asset", "cash");
    const open = journal("opening-capital", "2026-11-01", [
      line("1", "bank", "debit", "10000"),
      line("2", "equity", "credit", "10000"),
    ]);
    const transfer = journal("bank-to-cash", "2026-11-02", [
      line("1", "cash", "debit", "2500"),
      line("2", "bank", "credit", "2500"),
    ]);
    const equity = makeAccount("equity", "3010", "equity");
    const result = buildFinancialSnapshot({
      ...payload, accounts: [...accounts, cash, equity], journals: [open, transfer],
    });
    expect(result.balanceSheet).toMatchObject({
      assetsMinor: "10000", recordedEquityMinor: "10000", unclosedEarningsMinor: "0",
    });
    expect(row(result.trialBalance.rows, "bank")?.closingDebitMinor).toBe("7500");
    expect(row(result.trialBalance.rows, "cash")?.closingDebitMinor).toBe("2500");
  });
});
