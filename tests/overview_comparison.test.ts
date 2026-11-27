import { describe, expect, it } from "vitest";
import { previousRange } from "../src/components/dashboard/useOverviewComparison";
describe("equal length dashboard comparisons", () => {
  it("uses the day immediately before a one-day selection", () => {
    expect(previousRange("2026-01-01", "2026-01-01")).toEqual(["2025-12-31", "2025-12-31"]);
  });
  it("handles month boundaries and leap days without overlapping the current range", () => {
    expect(previousRange("2024-03-01", "2024-03-07")).toEqual(["2024-02-23", "2024-02-29"]);
    expect(previousRange("2026-11-21", "2026-11-27")).toEqual(["2026-11-14", "2026-11-20"]);
  });
});
