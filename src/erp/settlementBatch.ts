import { addExact, parseMinorUnits, validBusinessDate } from "../accounting/minorUnits";
import { previewOpenItemEvent, projectOpenItem } from "./openItems";
import type { OpenItemEvent, OpenItemProjection, OpenItemSource } from "./openItems";

/**
 * Pure, non-authoritative batch planner. The real payment source, global
 * allocation cap, authorization and atomic journal posting belong to SQL.
 */
export interface SettlementAllocation {
  allocationId: string;
  documentId: string;
  amountMinor: string;
}

export interface SettlementBatch {
  organizationId: string;
  partyId: string;
  currency: string;
  direction: "customer_receipt" | "supplier_payment";
  paymentSourceId: string;
  intentId: string;
  businessDate: string;
  /** Exact amount of the instrument, not a browser-verified bank receipt. */
  amountMinor: string;
  allocations: readonly SettlementAllocation[];
}

export interface SettlementBatchPreview {
  organizationId: string;
  paymentSourceId: string;
  intentId: string;
  amountMinor: string;
  status: "new" | "already_recorded";
  allocations: Array<{
    allocationId: string;
    documentId: string;
    amountMinor: string;
    eventIntentId: string;
    projection: OpenItemProjection;
  }>;
}

const requiredId = (id: string, label: string): void => {
  if (typeof id !== "string" || !id.trim() || id.trim() !== id) {
    throw new Error(`${label} must be a nonempty canonical ID.`);
  }
};

const positiveMinor = (value: string, label: string): bigint => {
  const amount = parseMinorUnits(value);
  if (amount <= 0n) throw new Error(`${label} must be positive.`);
  return amount;
};

const reference = (type: string, intentId: string, allocationId: string): string =>
  JSON.stringify([type, intentId, allocationId]);

/**
 * Previews one source instrument distributed across multiple documents.
 * All document streams must be complete and authorized by a future server.
 * Replaying any but ALL allocation intents is rejected as a partial commit.
 */
export function previewSettlementBatch(
  batch: SettlementBatch,
  documents: readonly OpenItemSource[],
): SettlementBatchPreview {
  requiredId(batch.organizationId, "Organization");
  requiredId(batch.partyId, "Counterparty");
  requiredId(batch.paymentSourceId, "Payment source");
  requiredId(batch.intentId, "Payment intent");
  if (!/^[A-Z]{3}$/.test(batch.currency)) throw new Error("Invalid payment currency.");
  if (!validBusinessDate(batch.businessDate)) throw new Error("Invalid payment date.");
  if (batch.direction !== "customer_receipt" && batch.direction !== "supplier_payment") {
    throw new Error("Unsupported payment direction.");
  }
  if (batch.allocations.length === 0) {
    throw new Error("A payment needs at least one document allocation.");
  }
  const instrumentAmount = positiveMinor(batch.amountMinor, "Payment source amount");
  const docMap = new Map<string, OpenItemSource>();
  for (const doc of documents) {
    const id = doc.document.documentId;
    requiredId(id, "Source document");
    if (docMap.has(id)) throw new Error("Duplicate document source snapshot.");
    // Ensure incomplete source cannot be silently treated as an empty balance.
    projectOpenItem(doc);
    docMap.set(id, doc);
  }

  const seenAllocations = new Set<string>();
  const seenDocuments = new Set<string>();
  let total = 0n;
  let replayCount = 0;
  const planned: Array<{
    allocation: SettlementAllocation;
    source: OpenItemSource;
    event: OpenItemEvent;
    existing: boolean;
  }> = [];
  for (const allocation of batch.allocations) {
    requiredId(allocation.allocationId, "Allocation");
    requiredId(allocation.documentId, "Allocated document");
    if (seenAllocations.has(allocation.allocationId) ||
        seenDocuments.has(allocation.documentId)) {
      throw new Error("Duplicate allocation or document in payment batch.");
    }
    seenAllocations.add(allocation.allocationId);
    seenDocuments.add(allocation.documentId);

    const source = docMap.get(allocation.documentId);
    if (!source) throw new Error("Allocated document is absent from complete source.");
    const doc = source.document;
    const expectedKind = batch.direction === "customer_receipt"
      ? "sales_invoice" : "purchase_bill";
    if (doc.organizationId !== batch.organizationId ||
        doc.partyId !== batch.partyId ||
        doc.currency !== batch.currency ||
        doc.kind !== expectedKind) {
      throw new Error("Payment source has a foreign company, counterparty, currency or document type.");
    }
    const amount = positiveMinor(allocation.amountMinor, "Allocation amount");
    total = addExact(total, amount);
    const intentId = reference("intent", batch.intentId, allocation.allocationId);
    const sourceRef = reference("payment-source", batch.paymentSourceId, allocation.allocationId);
    const existingEvent = source.events.find((event) => event.intentId === intentId);
    if (existingEvent) replayCount += 1;
    const event: OpenItemEvent = {
      organizationId: batch.organizationId,
      documentId: allocation.documentId,
      currency: batch.currency,
      intentId,
      sourceRef,
      kind: "payment",
      amountMinor: allocation.amountMinor,
      businessDate: batch.businessDate,
      sequence: existingEvent?.sequence ?? source.events.length + 1,
    };
    planned.push({ allocation, source, event, existing: Boolean(existingEvent) });
  }
  if (total !== instrumentAmount) {
    throw new Error("Payment allocations do not exactly match the source amount.");
  }
  if (replayCount > 0 && replayCount !== planned.length) {
    throw new Error("Partial payment replay: an atomic server transaction is required.");
  }

  const allocations = planned.map(({ allocation, source, event }) => ({
    allocationId: allocation.allocationId,
    documentId: allocation.documentId,
    amountMinor: allocation.amountMinor,
    eventIntentId: event.intentId,
    projection: previewOpenItemEvent(source, event),
  }));
  return {
    organizationId: batch.organizationId,
    paymentSourceId: batch.paymentSourceId,
    intentId: batch.intentId,
    amountMinor: instrumentAmount.toString(),
    status: replayCount ? "already_recorded" : "new",
    allocations,
  };
}
