import { describe, expect, it } from "vitest";
import {
  calculateOperationalDocument,
  type OperationalDocumentDraft,
  type OperationalDocumentLine,
} from "../src/erp/operationalDocuments";

const line = (overrides: Partial<OperationalDocumentLine> = {}): OperationalDocumentLine => ({
  lineId: "line-1",
  description: "Service",
  quantityMillionths: "1500000",
  unitPriceMinor: "101",
  discountMinor: "12",
  taxMinor: "5",
  ...overrides,
});
const draft = (overrides: Partial<OperationalDocumentDraft> = {}): OperationalDocumentDraft => ({
  organizationId: "company-a",
  documentId: "invoice-100",
  partyId: "customer-1",
  kind: "sales_invoice",
  currency: "PKR",
  businessDate: "2026-11-20",
  lines: [line()],
  ...overrides,
});

describe("AQVORA sales and purchases exact document calculations", () => {
  it("calculates fractional quantities, per-line half-up, discounts and tax without floats", () => {
    const value = calculateOperationalDocument(draft({ lines: [
      line(), line({ lineId: "line-2", quantityMillionths: "1000000",
        unitPriceMinor: "50", discountMinor: "0", taxMinor: "0" }),
    ] }));
    expect(value.lines).toEqual([
      { lineId: "line-1", grossMinor: "152", discountMinor: "12", taxMinor: "5", totalMinor: "145" },
      { lineId: "line-2", grossMinor: "50", discountMinor: "0", taxMinor: "0", totalMinor: "50" },
    ]);
    expect([value.grossMinor, value.discountMinor, value.taxMinor, value.totalMinor])
      .toEqual(["202", "12", "5", "195"]);
    expect(value.partyId).toBe("customer-1");
    expect(value.organizationId).toBe("company-a");
  });

  it("uses the identical exact arithmetic for vendor purchase bills", () => {
    const bill = calculateOperationalDocument(draft({ kind: "purchase_bill", partyId: "vendor-1" }));
    expect(bill.kind).toBe("purchase_bill");
    expect(bill.totalMinor).toBe("145");
  });

  it("rounds positive minor-unit half ties once per line, not once per document", () => {
    const calculated = calculateOperationalDocument(draft({lines: [
      line({lineId: "a", quantityMillionths: "500000", unitPriceMinor: "1", discountMinor: "0", taxMinor: "0"}),
      line({lineId: "b", quantityMillionths: "500000", unitPriceMinor: "1", discountMinor: "0", taxMinor: "0"}),
    ]}));
    expect(calculated.totalMinor).toBe("2");
  });

  it("preserves the maximum representable exact minor-unit amount", () => {
    expect(calculateOperationalDocument(draft({ lines: [line({
      quantityMillionths: "1000000", unitPriceMinor: "9223372036854775807",
      discountMinor: "0", taxMinor: "0",
    })] })).totalMinor).toBe("9223372036854775807");
  });

  it.each([
    ["negative unit price", {unitPriceMinor: "-1"}, /negative/],
    ["negative discount", {discountMinor: "-1"}, /negative/],
    ["negative tax", {taxMinor: "-1"}, /negative/],
    ["zero quantity", {quantityMillionths: "0"}, /Quantity must be positive/],
    ["negative quantity", {quantityMillionths: "-1"}, /Quantity must be positive/],
    ["fractional amount string", {unitPriceMinor: "1.50"}, /canonical/],
    ["leading-zero unit amount", {unitPriceMinor: "01"}, /canonical/],
    ["float notation", {taxMinor: "1e2"}, /canonical/],
    ["discount larger than gross", {discountMinor: "999"}, /Discount exceeds/],
    ["overflowed total", {quantityMillionths: "2000000", unitPriceMinor: "9223372036854775807", discountMinor: "0", taxMinor: "0"}, /supported range/],
  ] as const)("rejects %s", (_name, changes, error) => {
    expect(() => calculateOperationalDocument(draft({lines: [line(changes)]}))).toThrow(error);
  });

  it("fails closed on empty company, party, document, lines or invalid business date", () => {
    const cases: Partial<OperationalDocumentDraft>[] = [
      { organizationId: "" }, { partyId: " " }, { documentId: "" },
      { lines: [] }, { businessDate: "2026-02-30" }, {currency: "pkr"},
      {kind: "credit_note" as OperationalDocumentDraft["kind"]},
    ];
    for (const item of cases) expect(() => calculateOperationalDocument(draft(item))).toThrow();
  });

  it("rejects duplicated IDs and missing line descriptions", () => {
    expect(() => calculateOperationalDocument(draft({ lines: [line(), line()] })))
      .toThrow(/Duplicate document line ID/);
    expect(() => calculateOperationalDocument(draft({ lines: [line({description: " "})] })))
      .toThrow(/Line description/);
  });

  it("never treats a zero-value document as payable invoice or bill", () => {
    expect(() => calculateOperationalDocument(draft({ lines: [line({
      quantityMillionths: "1000000", unitPriceMinor: "100",
      discountMinor: "100", taxMinor: "0",
    })] }))).toThrow(/positive amount/);
  });
});
