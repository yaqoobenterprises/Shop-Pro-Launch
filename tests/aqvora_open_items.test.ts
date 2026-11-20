import { describe, expect, it } from "vitest";
import {
  previewOpenItemEvent, projectOpenItem,
  type OpenItemDocument, type OpenItemEvent, type OpenItemSource,
} from "../src/erp/openItems";

const doc = (overrides: Partial<OpenItemDocument> = {}): OpenItemDocument => ({
  organizationId: "company-a",
  documentId: "invoice-100",
  kind: "sales_invoice",
  partyId: "customer-1",
  currency: "PKR",
  businessDate: "2026-11-20",
  postedJournalId: "journal-100",
  faceAmountMinor: "1000",
  ...overrides,
});
const event = (overrides: Partial<OpenItemEvent> = {}): OpenItemEvent => ({
  organizationId: "company-a",
  documentId: "invoice-100",
  currency: "PKR",
  intentId: "intent-1",
  sourceRef: "payment-1",
  kind: "payment",
  amountMinor: "600",
  businessDate: "2026-11-20",
  sequence: 1,
  ...overrides,
});
const source = (events: OpenItemEvent[] = [], document = doc()): OpenItemSource => ({
  document, events, sourceComplete: true,
});

describe("AQVORA sales AR and purchase AP complete-source open items", () => {
  it("returns unpaid balance from a posted source with no payments", () => {
    expect(projectOpenItem(source())).toMatchObject({
      kind: "sales_invoice", faceAmountMinor: "1000",
      paidMinor: "0", creditedMinor: "0",
      outstandingMinor: "1000", state: "unpaid", eventCount: 0,
    });
  });

  it("projects partial receipts, a credit note and full settlement", () => {
    const events = [
      event(),
      event({ intentId: "credit-1", sourceRef: "credit-note-1",
        kind: "credit_note", amountMinor: "150", sequence: 2 }),
      event({ intentId: "pay-2", sourceRef: "payment-2",
        amountMinor: "250", sequence: 3 }),
    ];
    expect(projectOpenItem(source(events))).toMatchObject({
      paidMinor: "850", creditedMinor: "150",
      outstandingMinor: "0", state: "settled", eventCount: 3,
    });
    expect(projectOpenItem(source(events.slice(0, 2)))).toMatchObject({
      outstandingMinor: "250", state: "partially_settled",
    });
  });

  it("runs the same AP settlement policy against a vendor's posted bill", () => {
    const bill = doc({kind: "purchase_bill", partyId: "vendor-9"});
    expect(projectOpenItem(source([event()], bill))).toMatchObject({
      kind: "purchase_bill", outstandingMinor: "400",
    });
  });

  it("reversal of original payment restores only that allocation, preserving full history", () => {
    const entries = [
      event(),
      event({intentId: "credit", sourceRef: "credit-source", kind: "credit_note", amountMinor: "400", sequence: 2}),
      event({intentId: "refund-1", sourceRef: "refund-document-1", kind: "payment_reversal",
        amountMinor: "600", sequence: 3, reversesIntentId: "intent-1"}),
    ];
    expect(projectOpenItem(source(entries))).toMatchObject({
      paidMinor: "0", creditedMinor: "400", outstandingMinor: "600",
      state: "partially_settled", eventCount: 3,
    });
    expect(entries).toHaveLength(3);
  });

  it("credit note reversal restores an outstanding receivable", () => {
    const s = source([
      event({kind: "credit_note", intentId: "credit", sourceRef: "credit-1", amountMinor: "1000"}),
      event({kind: "credit_note_reversal", intentId: "undo-credit",
        sourceRef: "credit-reversal-1", reversesIntentId: "credit",
        amountMinor: "1000", sequence: 2}),
    ]);
    expect(projectOpenItem(s)).toMatchObject({
      creditedMinor: "0", outstandingMinor: "1000", state: "unpaid",
    });
  });

  it("previews a new exact allocation without mutating the source array", () => {
    const entries = [event()];
    const result = previewOpenItemEvent(source(entries),
      event({intentId: "intent-2", sourceRef: "receipt-2", amountMinor: "400", sequence: 2}));
    expect(result).toMatchObject({outstandingMinor: "0", state: "settled"});
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amountMinor).toBe("600");
  });

  it("accepts an identical intent retry as a read-only replay", () => {
    const s = source([event()]);
    expect(previewOpenItemEvent(s, event())).toEqual(projectOpenItem(s));
    expect(s.events).toHaveLength(1);
  });

  it("rejects same intent with modified value, source or reversal metadata", () => {
    const s = source([event()]);
    for (const changed of [
      { amountMinor: "700" }, {sourceRef: "receipt-fake"},
      {businessDate: "2026-11-21"}, {reversesIntentId: "other"},
    ]) expect(() => previewOpenItemEvent(s, event(changed)))
      .toThrow(/Idempotency intent/);
  });

  it("rejects overpayments, excess credit notes and duplicate source allocations", () => {
    const one = source([event()]);
    expect(() => previewOpenItemEvent(one, event({
      intentId: "intent-2", sourceRef: "pay-2", sequence: 2, amountMinor: "401",
    }))).toThrow(/exceed/);
    expect(() => previewOpenItemEvent(one, event({
      intentId: "intent-2", sourceRef: "credit-1", sequence: 2,
      kind: "credit_note", amountMinor: "401",
    }))).toThrow(/exceed/);
    expect(() => previewOpenItemEvent(one, event({
      intentId: "intent-2", sourceRef: "payment-1", sequence: 2, amountMinor: "1",
    }))).toThrow(/Duplicate/);
  });

  it("never certifies incomplete source as a zero or estimated open-item balance", () => {
    expect(() => projectOpenItem({...source(), sourceComplete: false}))
      .toThrow(/incomplete source/);
  });

  it("rejects incomplete or unposted document identity", () => {
    for (const changed of [
      {postedJournalId: ""}, {faceAmountMinor: "0"}, {faceAmountMinor: "-1"},
      {partyId: ""}, {organizationId: ""}, {currency: "pkr"},
      {businessDate: "2026-02-31"},
    ]) expect(() => projectOpenItem(source([], doc(changed)))).toThrow();
  });

  it.each([
    ["tenant", { organizationId: "company-b" }, /different company/],
    ["document", { documentId: "invoice-999" }, /different company/],
    ["currency", { currency: "USD" }, /different company/],
    ["posting order", { sequence: 2 }, /contiguous/],
    ["invalid date", { businessDate: "2026-02-30" }, /Invalid settlement/],
    ["before invoice date", { businessDate: "2026-11-19" }, /Invalid settlement/],
    ["noncanonical amount", { amountMinor: "1.5" }, /canonical/],
    ["negative amount", { amountMinor: "-5" }, /positive/],
    ["zero amount", { amountMinor: "0" }, /positive/],
    ["missing receipt reference", { sourceRef: " " }, /Settlement source/],
    ["unknown event kind", { kind: "custom" as OpenItemEvent["kind"] }, /Unsupported/],
  ] as const)("fails closed on %s", (_case, changes, expected) => {
    expect(() => projectOpenItem(source([event(changes)]))).toThrow(expected);
  });

  it("rejects unmatched, changed, wrong-type and duplicated reversals", () => {
    const valid = event();
    const reversal = event({
      kind: "payment_reversal", intentId: "rev-1",
      sourceRef: "reversal-1", amountMinor: "600",
      sequence: 2, reversesIntentId: "intent-1",
    });
    for (const changes of [
      {amountMinor: "601"}, {reversesIntentId: "missing"},
      {kind: "credit_note_reversal" as OpenItemEvent["kind"]},
    ]) expect(() => projectOpenItem(source([valid, {...reversal, ...changes}]))).toThrow(/Invalid/);
    expect(() => projectOpenItem(source([
      valid, reversal, {...reversal, intentId: "rev-2", sourceRef: "reversal-2", sequence: 3},
    ]))).toThrow(/already reversed/);
  });

  it("rejects duplicated posted events even if idempotent parameters look identical", () => {
    expect(() => projectOpenItem(source([event(), event({sequence: 2})]))).toThrow(/Duplicate/);
  });

  it("uses exact 64-bit integer arithmetic for large payments without precision loss", () => {
    const large = doc({faceAmountMinor: "9223372036854775807"});
    const s = source([
      event({amountMinor: "9223372036854775806"}),
      event({intentId: "last-paisa", sourceRef: "last-1", amountMinor: "1", sequence: 2}),
    ], large);
    expect(projectOpenItem(s)).toMatchObject({
      outstandingMinor: "0", paidMinor: "9223372036854775807", state: "settled",
    });
  });
});
