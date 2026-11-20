import { describe, expect, it } from "vitest";
import { previewSettlementBatch, type SettlementBatch } from "../src/erp/settlementBatch";
import type { OpenItemDocument, OpenItemEvent, OpenItemSource } from "../src/erp/openItems";

const document = (
  documentId: string, overrides: Partial<OpenItemDocument> = {},
): OpenItemDocument => ({
  organizationId: "shop-a",
  documentId,
  partyId: "customer-a",
  kind: "sales_invoice",
  currency: "PKR",
  businessDate: "2026-11-10",
  postedJournalId: `journal-${documentId}`,
  faceAmountMinor: documentId === "invoice-a" ? "1000" : "700",
  ...overrides,
});

const source = (
  documentId: string, events: OpenItemEvent[] = [],
  overrides: Partial<OpenItemDocument> = {},
): OpenItemSource => ({
  document: document(documentId, overrides),
  events,
  sourceComplete: true,
});

const batch = (overrides: Partial<SettlementBatch> = {}): SettlementBatch => ({
  organizationId: "shop-a",
  partyId: "customer-a",
  currency: "PKR",
  direction: "customer_receipt",
  paymentSourceId: "receipt-a",
  intentId: "payment-a",
  businessDate: "2026-11-20",
  amountMinor: "1000",
  allocations: [
    { allocationId: "allocate-a", documentId: "invoice-a", amountMinor: "600" },
    { allocationId: "allocate-b", documentId: "invoice-b", amountMinor: "400" },
  ],
  ...overrides,
});

const booked = (
  doc: string, allocation: string, amount: string,
): OpenItemEvent => ({
  organizationId: "shop-a",
  documentId: doc,
  currency: "PKR",
  intentId: JSON.stringify(["intent", "payment-a", allocation]),
  sourceRef: JSON.stringify(["payment-source", "receipt-a", allocation]),
  kind: "payment",
  amountMinor: amount,
  businessDate: "2026-11-20",
  sequence: 1,
});

const both = (): OpenItemSource[] => [source("invoice-a"), source("invoice-b")];

describe("AQVORA atomic multi-invoice settlement preview — source-only, not posting", () => {
  it("splits one exact customer receipt across two invoices without changing the sources", () => {
    const docs = both();
    const result = previewSettlementBatch(batch(), docs);
    expect(result).toMatchObject({
      organizationId: "shop-a",
      amountMinor: "1000",
      status: "new",
      allocations: [
        { documentId: "invoice-a", amountMinor: "600",
          projection: { paidMinor: "600", outstandingMinor: "400", state: "partially_settled" } },
        { documentId: "invoice-b", amountMinor: "400",
          projection: { paidMinor: "400", outstandingMinor: "300", state: "partially_settled" } },
      ],
    });
    expect(docs[0]?.events).toEqual([]);
    expect(docs[1]?.events).toEqual([]);
  });

  it("splits a supplier payment only across supplier bills for the same vendor", () => {
    const docs = [
      source("invoice-a", [], {kind: "purchase_bill", partyId: "vendor-a"}),
      source("invoice-b", [], {kind: "purchase_bill", partyId: "vendor-a"}),
    ];
    expect(previewSettlementBatch(batch({
      direction: "supplier_payment", partyId: "vendor-a",
    }), docs).allocations).toHaveLength(2);
    expect(() => previewSettlementBatch(batch(), docs)).toThrow(/foreign company/);
  });

  it("treats an entirely committed replay as unchanged, without duplicate money", () => {
    const docs = [
      source("invoice-a", [booked("invoice-a", "allocate-a", "600")]),
      source("invoice-b", [booked("invoice-b", "allocate-b", "400")]),
    ];
    const result = previewSettlementBatch(batch(), docs);
    expect(result.status).toBe("already_recorded");
    expect(result.allocations[0]?.projection.outstandingMinor).toBe("400");
    expect(result.allocations[1]?.projection.outstandingMinor).toBe("300");
    expect(docs[0]?.events).toHaveLength(1);
  });

  it("fails closed on partial replay rather than pretending a split payment committed", () => {
    const docs = [
      source("invoice-a", [booked("invoice-a", "allocate-a", "600")]),
      source("invoice-b"),
    ];
    expect(() => previewSettlementBatch(batch(), docs)).toThrow(/Partial payment replay/);
  });

  it("rejects changed amounts or financial source identity under an existing intent", () => {
    const docs = [
      source("invoice-a", [booked("invoice-a", "allocate-a", "600")]),
      source("invoice-b", [booked("invoice-b", "allocate-b", "400")]),
    ];
    expect(() => previewSettlementBatch(batch({
      amountMinor: "1000",
      allocations: [
        {allocationId: "allocate-a", documentId: "invoice-a", amountMinor: "601"},
        {allocationId: "allocate-b", documentId: "invoice-b", amountMinor: "399"},
      ],
    }), docs)).toThrow(/Idempotency intent/);
    expect(() => previewSettlementBatch(batch({paymentSourceId: "receipt-changed"}), docs))
      .toThrow(/Idempotency intent/);
    expect(() => previewSettlementBatch(batch({businessDate: "2026-11-21"}), docs))
      .toThrow(/Idempotency intent/);
  });

  it("rejects payments larger than an individual invoice's available balance", () => {
    const docs = [
      source("invoice-a", [{
        organizationId: "shop-a", documentId: "invoice-a", currency: "PKR",
        intentId: "other-payment", sourceRef: "other-receipt",
        kind: "payment", amountMinor: "500",
        businessDate: "2026-11-19", sequence: 1,
      }]), source("invoice-b"),
    ];
    expect(() => previewSettlementBatch(batch(), docs)).toThrow(/exceed/);
  });

  it.each([
    ["different company", {organizationId: "shop-b"}, /foreign company/],
    ["different counterparty", {partyId: "other-customer"}, /foreign company/],
    ["different currency", {currency: "USD"}, /foreign company/],
    ["wrong document type", {kind: "purchase_bill" as const}, /foreign company/],
  ])("refuses source document from %s", (_label, override, message) => {
    expect(() => previewSettlementBatch(batch(), [
      source("invoice-a", [], override), source("invoice-b"),
    ])).toThrow(message);
  });

  it("does not accept incomplete or duplicated source document streams", () => {
    const docs = both();
    docs[0]!.sourceComplete = false;
    expect(() => previewSettlementBatch(batch(), docs)).toThrow(/incomplete source/);
    expect(() => previewSettlementBatch(batch(), [
      source("invoice-a"), source("invoice-a"), source("invoice-b"),
    ])).toThrow(/Duplicate document source/);
    expect(() => previewSettlementBatch(batch(), [source("invoice-a")]))
      .toThrow(/absent from complete source/);
  });

  it("requires exactly allocated source amount, no ghost remainder or float", () => {
    for (const amountMinor of ["999", "1001"]) {
      expect(() => previewSettlementBatch(batch({amountMinor}), both()))
        .toThrow(/do not exactly match/);
    }
    expect(() => previewSettlementBatch(batch({amountMinor: "1000.00"}), both()))
      .toThrow(/canonical/);
    expect(() => previewSettlementBatch(batch({amountMinor: "0"}), both()))
      .toThrow(/must be positive/);
  });

  it("rejects duplicate allocation IDs, multiple allocations to one document and no allocations", () => {
    const allocations = batch().allocations;
    expect(() => previewSettlementBatch(batch({allocations: []}), both()))
      .toThrow(/at least one/);
    expect(() => previewSettlementBatch(batch({allocations: [
      allocations[0]!, {...allocations[1]!, allocationId: "allocate-a"},
    ]}), both())).toThrow(/Duplicate allocation/);
    expect(() => previewSettlementBatch(batch({allocations: [
      allocations[0]!, {...allocations[1]!, documentId: "invoice-a"},
    ]}), both())).toThrow(/Duplicate allocation/);
  });

  it("rejects unsupported direction, invalid date and arbitrary/cross-currency payloads", () => {
    expect(() => previewSettlementBatch(batch({
      direction: "refund" as SettlementBatch["direction"],
    }), both())).toThrow(/Unsupported/);
    expect(() => previewSettlementBatch(batch({businessDate: "2026-02-30"}), both()))
      .toThrow(/Invalid payment date/);
    expect(() => previewSettlementBatch(batch({currency: "pkr"}), both()))
      .toThrow(/Invalid payment currency/);
    expect(() => previewSettlementBatch(batch({intentId: " "}), both()))
      .toThrow(/canonical ID/);
  });

  it("splits a maximal BIGINT instrument without losing a minor unit", () => {
    const max = "9223372036854775807";
    const docs = [
      source("invoice-a", [], {faceAmountMinor: max}),
      source("invoice-b", [], {faceAmountMinor: "1"}),
    ];
    const result = previewSettlementBatch(batch({
      amountMinor: max,
      allocations: [
        {allocationId: "allocate-a", documentId: "invoice-a",
          amountMinor: "9223372036854775806"},
        {allocationId: "allocate-b", documentId: "invoice-b", amountMinor: "1"},
      ],
    }), docs);
    expect(result.allocations.map(a=>a.projection.outstandingMinor)).toEqual(["1", "0"]);
  });
});
