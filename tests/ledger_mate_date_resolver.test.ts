import { describe, expect, it } from "vitest";
import { resolveLedgerMatePeriods } from "../src/services/ledgerMateDateResolver";

const CURRENT_DATE = "2026-11-17";

describe("LedgerMate date and follow-up resolution", () => {
  it.each([
    ["5 Nov 2026", "2026-11-05"],
    ["05-11-2026", "2026-11-05"],
    ["2026-11-05", "2026-11-05"],
    ["November 5, 2026", "2026-11-05"],
  ])("resolves %s to the exact business date", (question, expectedDate) => {
    const result = resolveLedgerMatePeriods(question, [], CURRENT_DATE);
    expect(result.periods).toEqual([{
      kind: "day",
      startDate: expectedDate,
      endDate: expectedDate,
      label: expectedDate,
    }]);
  });

  it("resolves complete calendar month and year ranges", () => {
    expect(resolveLedgerMatePeriods("November 2026 ka profit", [], CURRENT_DATE).periods[0]).toMatchObject({
      kind: "month", startDate: "2026-11-01", endDate: "2026-11-30",
    });
    expect(resolveLedgerMatePeriods("2025 yearly report", [], CURRENT_DATE).periods[0]).toMatchObject({
      kind: "year", startDate: "2025-01-01", endDate: "2025-12-31",
    });
  });

  it("uses the prior user date for a short expense follow-up", () => {
    const result = resolveLedgerMatePeriods("aur expense?", [
      { role: "user", content: "5 November ki sale kitni thi?" },
      { role: "assistant", content: "Rs 530.00" },
    ], CURRENT_DATE);
    expect(result.inheritedFromHistory).toBe(true);
    expect(result.periods[0]).toMatchObject({ kind: "day", startDate: "2026-11-05" });
  });

  it("compares an inherited date with the current month", () => {
    const result = resolveLedgerMatePeriods("is month se compare kro", [
      { role: "user", content: "5 November ki sale kitni thi?" },
    ], CURRENT_DATE);
    expect(result.inheritedFromHistory).toBe(true);
    expect(result.periods.map((period) => period.label)).toEqual(["2026-11-05", "2026-11"]);
  });

  it("compares last month with this month and last year with this year", () => {
    expect(resolveLedgerMatePeriods("Last month ke comparison mein sales kitni increase hui?", [], CURRENT_DATE)
      .periods.map((period) => period.label)).toEqual(["2026-10", "2026-11"]);
    expect(resolveLedgerMatePeriods("Compare last year to this year", [], CURRENT_DATE)
      .periods.map((period) => period.label)).toEqual(["2025", "2026"]);
  });

  it("rejects impossible calendar dates instead of normalizing them", () => {
    expect(resolveLedgerMatePeriods("31-02-2026 ki sale", [], CURRENT_DATE).periods).toEqual([]);
  });
});
