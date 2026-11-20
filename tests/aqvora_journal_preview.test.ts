import { describe, expect, it } from "vitest";
import { assertValidChart } from "../src/accounting/chartOfAccounts";
import { previewJournalDraft } from "../src/accounting/journalPreview";
import { parseMinorUnits } from "../src/accounting/minorUnits";
import type { ChartAccount, JournalDraftInput, JournalPreviewPolicy } from "../src/accounting/types";

const company = "company-a";
const account = (id: string, code: string, accountClass: ChartAccount["accountClass"],
  controlRole?: ChartAccount["controlRole"]): ChartAccount => ({
  id, code, accountClass, name: id, normalSide: "debit",
  organizationId: company, parentId: null, isPosting: true, isActive: true,
  ...(controlRole ? { controlRole } : {}),
});
const accounts: ChartAccount[] = [
  account("cash", "1010", "asset", "cash"),
  account("bank", "1020", "asset", "cash"),
  account("ar", "1100", "asset", "receivable"),
  account("inventory", "1200", "asset", "inventory"),
  { ...account("ap", "2010", "liability", "payable"), normalSide: "credit" },
  { ...account("revenue", "4020", "revenue"), normalSide: "credit" },
  account("expense", "6020", "expense"),
];
const context: JournalPreviewPolicy = {
  organizationId: company, currency: "PKR",
  periodStart: "2026-11-01", periodEnd: "2026-11-30", periodState: "open",
};
const draft: JournalDraftInput = {
  organizationId: company, currency: "PKR", businessDate: "2026-11-20", intentId: "purchase-1",
  lines: [
    { lineId: "1", accountId: "expense", debitMinor: "10050", creditMinor: "0" },
    { lineId: "2", accountId: "cash", debitMinor: "0", creditMinor: "10050" },
  ],
};

describe("AQVORA V2 Chart of Accounts and draft review", () => {
  it("reads exact integer strings and rejects floating-point/unsafe values", () => {
    expect(parseMinorUnits("123456789012345")).toBe(123456789012345n);
    expect(parseMinorUnits("9223372036854775807")).toBe(9223372036854775807n);
    for (const value of ["1.01", "1e3", "2abc", "1,000", "+1", "-0", "01", " 1", "9223372036854775808"]) {
      expect(() => parseMinorUnits(value)).toThrow();
    }
  });

  it("allows a balanced multiple-line journal preview and never marks it posted", () => {
    const result = previewJournalDraft(draft, context, accounts);
    expect(result).toMatchObject({
      debitMinor: "10050", creditMinor: "10050", differenceMinor: "0",
      balanced: true, canSubmitForServerReview: true, issues: [],
    });
  });

  it("rejects even one minor-unit imbalance", () => {
    const changed = {
      ...draft, lines: [{ ...draft.lines[0], debitMinor: "10051" }, draft.lines[1]],
    };
    const result = previewJournalDraft(changed, context, accounts);
    expect(result.canSubmitForServerReview).toBe(false);
    expect(result.differenceMinor).toBe("1");
    expect(result.issues.some((issue) => issue.code === "unbalanced")).toBe(true);
  });

  it("rejects heading/nonposting and inactive accounts", () => {
    const heading = { ...accounts[0], isPosting: false };
    const inactive = { ...accounts[0], isActive: false };
    for (const replacement of [heading, inactive]) {
      const result = previewJournalDraft(draft, context, [replacement, ...accounts.slice(1)]);
      expect(result.canSubmitForServerReview).toBe(false);
      expect(result.issues.some((issue) => issue.code === "account" || issue.code === "invalid_chart")).toBe(true);
    }
  });

  it("rejects closed periods, company mismatch and invalid dates", () => {
    expect(previewJournalDraft(draft, { ...context, periodState: "closed" }, accounts).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "period_locked" })]));
    const cross = previewJournalDraft({ ...draft, organizationId: "company-b" }, context, accounts);
    expect(cross.issues.some((issue) => issue.code === "company_mismatch")).toBe(true);
    for (const date of ["2026-11-31", "2026-10-30", "November 20"]) {
      expect(previewJournalDraft({ ...draft, businessDate: date }, context, accounts).canSubmitForServerReview).toBe(false);
    }
  });

  it("requires party/open-item for AR/AP and a linked stock movement for inventory", () => {
    const ar = previewJournalDraft({
      ...draft, lines: [
        { ...draft.lines[0], accountId: "ar" },
        { ...draft.lines[1], accountId: "revenue" },
      ],
    }, context, accounts);
    expect(ar.issues.some((issue) => issue.message.includes("party and open-item"))).toBe(true);
    const stock = previewJournalDraft({
      ...draft, lines: [
        { ...draft.lines[0], accountId: "inventory" },
        { ...draft.lines[1], accountId: "ap" },
      ],
    }, context, accounts);
    expect(stock.issues.some((issue) => issue.message.includes("stock movement"))).toBe(true);
    expect(stock.issues.some((issue) => issue.message.includes("party and open-item"))).toBe(true);
  });

  it("rejects duplicate company codes and cross-company chart nodes", () => {
    expect(() => assertValidChart(company, [...accounts, { ...account("fake", "1020", "asset") }]))
      .toThrow(/duplicate account code/i);
    expect(() => assertValidChart(company, [{ ...accounts[0], organizationId: "company-b" }]))
      .toThrow(/another company/i);
  });

  it("detects parent cycles and prohibits posting to headings", () => {
    const root = { ...account("root", "1000", "asset"), isPosting: false, parentId: "node" };
    const node = { ...account("node", "1001", "asset"), isPosting: false, parentId: "root" };
    expect(() => assertValidChart(company, [root, node])).toThrow(/cycle/i);
    expect(() => assertValidChart(company, [
      account("root", "1000", "asset"),
      { ...account("child", "1001", "asset"), parentId: "root" },
    ])).toThrow(/non-posting parent/i);
  });

  it("rejects duplicate lines, both-sided amounts and out-of-range money", () => {
    const doubleLine = previewJournalDraft({
      ...draft, lines: [draft.lines[0], { ...draft.lines[1], lineId: "1" }],
    }, context, accounts);
    expect(doubleLine.issues.some((issue) => issue.code === "line_id")).toBe(true);
    const both = previewJournalDraft({
      ...draft, lines: [{ ...draft.lines[0], creditMinor: "1" }, draft.lines[1]],
    }, context, accounts);
    expect(both.issues.some((issue) => issue.code === "side")).toBe(true);
    const unsafe = previewJournalDraft({
      ...draft, lines: [{ ...draft.lines[0], debitMinor: "9223372036854775808" }, draft.lines[1]],
    }, context, accounts);
    expect(unsafe.issues.some((issue) => issue.code === "amount")).toBe(true);
  });
});
