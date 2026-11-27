import { describe,it,expect } from "vitest";
import { parseAmountBound,readAmountBounds,exactMajorUnits,transactionOrder } from "../src/lib/transactionFilters";
import { workbookMoney } from "../src/components/reports/buildReportsWorkbook";
import { precedingPeriod } from "../src/lib/overviewComparison";

describe("read-only financial filters",()=>{
  it("parses exact inclusive bounds without rounding",()=>{
    expect(parseAmountBound("0")).toBe(0);
    expect(parseAmountBound("12.50")).toBe(1250);
    expect(parseAmountBound("")).toBeUndefined();
    expect(parseAmountBound("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(exactMajorUnits(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  });
  it.each(["1.234","-1","12abc","1e3","90071992547409.92"])("rejects malformed or unsafe bound %s",value=>expect(()=>parseAmountBound(value)).toThrow());
  it("rejects a reversed amount range",()=>expect(readAmountBounds("10","5").error).toContain("Minimum"));
  it("selects explicit ordering for each supported mode",()=>{
    expect(transactionOrder("amount-high")).toEqual({column:"amount_paisa",ascending:false});
    expect(transactionOrder("oldest")).toEqual({column:"device_entry_time",ascending:true});
  });
  it("rejects amounts beyond Excel numeric precision without silently rounding",()=>{
    expect(workbookMoney(1250)).toBe(12.5);
    expect(()=>workbookMoney(1_000_000_000_000_001)).toThrow(/Excel monetary precision/);
    expect(()=>workbookMoney(1.5)).toThrow();
  });
  it("uses equal inclusive business dates across calendar boundaries",()=>{
    expect(precedingPeriod("2024-03-01","2024-03-02")).toEqual(["2024-02-28","2024-02-29"]);
    expect(precedingPeriod("2026-01-01","2026-01-01")).toEqual(["2025-12-31","2025-12-31"]);
    expect(()=>precedingPeriod("2026-01-02","2026-01-01")).toThrow();
  });
});
