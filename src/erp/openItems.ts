import { addExact, parseMinorUnits, validBusinessDate } from "../accounting/minorUnits";
import type { OperationalDocumentKind } from "./operationalDocuments";

/** Pure AR/AP open-item projection; it never reads or writes a database. */
export interface OpenItemDocument {
  organizationId: string;
  documentId: string;
  partyId: string;
  kind: OperationalDocumentKind;
  currency: string;
  businessDate: string;
  postedJournalId: string;
  /** A verified and posted document's canonical face amount. */
  faceAmountMinor: string;
}

export type OpenItemEventKind =
  | "payment"
  | "credit_note"
  | "payment_reversal"
  | "credit_note_reversal";

export interface OpenItemEvent {
  organizationId: string;
  documentId: string;
  currency: string;
  intentId: string;
  /** Unique source allocation/reference; reversals require a NEW source reference. */
  sourceRef: string;
  kind: OpenItemEventKind;
  /** Exact positive minor-unit amount. */
  amountMinor: string;
  businessDate: string;
  /** Consecutive posting order, issued by the future server; not a user timestamp. */
  sequence: number;
  reversesIntentId?: string;
}

export interface OpenItemSource {
  document: OpenItemDocument;
  events: readonly OpenItemEvent[];
  /** May ONLY be asserted by an authorized complete server source. */
  sourceComplete: boolean;
}

export interface OpenItemProjection {
  organizationId: string;
  documentId: string;
  kind: OperationalDocumentKind;
  faceAmountMinor: string;
  paidMinor: string;
  creditedMinor: string;
  outstandingMinor: string;
  state: "unpaid" | "partially_settled" | "settled";
  eventCount: number;
}

const isReversal = (kind: OpenItemEventKind): boolean =>
  kind === "payment_reversal" || kind === "credit_note_reversal";

function required(value: string | undefined, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
}

function positiveAmount(value: string): bigint {
  const amount = parseMinorUnits(value);
  if (amount <= 0n) throw new Error("Open-item amount must be positive.");
  return amount;
}

function assertDocument(document: OpenItemDocument): bigint {
  required(document.organizationId, "Company ID");
  required(document.documentId, "Document ID");
  required(document.partyId, "Customer or vendor");
  required(document.postedJournalId, "Posted journal");
  if (document.kind !== "sales_invoice" && document.kind !== "purchase_bill") {
    throw new Error("Unrecognized open-item document kind.");
  }
  if (!/^[A-Z]{3}$/.test(document.currency)) {
    throw new Error("Invalid open-item currency code.");
  }
  if (!validBusinessDate(document.businessDate)) {
    throw new Error("Invalid open-item issue date.");
  }
  return positiveAmount(document.faceAmountMinor);
}

/**
 * Requires a COMPLETE trusted server snapshot. The flag alone is not proof of
 * server authorization; API integration must enforce tenancy and provenance.
 */
export function projectOpenItem(source: OpenItemSource): OpenItemProjection {
  if (!source.sourceComplete) {
    throw new Error("Cannot certify an open-item balance from incomplete source.");
  }
  const { document, events } = source;
  const face = assertDocument(document);
  let paid = 0n;
  let credited = 0n;
  const byIntent = new Map<string, OpenItemEvent>();
  const reversed = new Set<string>();
  const sourceRefs = new Set<string>();

  for (const [index, event] of events.entries()) {
    required(event.intentId, "Settlement intent");
    required(event.sourceRef, "Settlement source");
    if (event.organizationId !== document.organizationId ||
        event.documentId !== document.documentId ||
        event.currency !== document.currency) {
      throw new Error("Settlement belongs to a different company, document or currency.");
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== index + 1) {
      throw new Error("Open-item events must have contiguous server sequence.");
    }
    if (!validBusinessDate(event.businessDate) ||
        event.businessDate < document.businessDate) {
      throw new Error("Invalid settlement business date.");
    }
    if (byIntent.has(event.intentId) || sourceRefs.has(event.sourceRef)) {
      throw new Error("Duplicate open-item intent or source reference.");
    }
    const amount = positiveAmount(event.amountMinor);
    if (isReversal(event.kind)) {
      required(event.reversesIntentId, "Reversed settlement intent");
      const original = byIntent.get(event.reversesIntentId!);
      const expectedKind = event.kind === "payment_reversal" ? "payment" : "credit_note";
      if (!original || original.kind !== expectedKind ||
          original.amountMinor !== event.amountMinor ||
          reversed.has(original.intentId)) {
        throw new Error("Invalid, changed, duplicated or already reversed allocation.");
      }
      reversed.add(original.intentId);
      if (expectedKind === "payment") paid = addExact(paid, -amount);
      else credited = addExact(credited, -amount);
    } else if (event.kind === "payment") {
      if (event.reversesIntentId !== undefined) {
        throw new Error("A normal payment cannot reference a reversal.");
      }
      paid = addExact(paid, amount);
    } else if (event.kind === "credit_note") {
      if (event.reversesIntentId !== undefined) {
        throw new Error("A credit note cannot reference a reversal.");
      }
      credited = addExact(credited, amount);
    } else {
      throw new Error("Unsupported open-item event kind.");
    }
    byIntent.set(event.intentId, event);
    sourceRefs.add(event.sourceRef);
    if (paid < 0n || credited < 0n || paid + credited > face) {
      throw new Error("Open-item allocations exceed the posted face amount.");
    }
  }

  const outstanding = face - paid - credited;
  return {
    organizationId: document.organizationId,
    documentId: document.documentId,
    kind: document.kind,
    faceAmountMinor: face.toString(),
    paidMinor: paid.toString(),
    creditedMinor: credited.toString(),
    outstandingMinor: outstanding.toString(),
    state: outstanding === 0n
      ? "settled"
      : outstanding === face ? "unpaid" : "partially_settled",
    eventCount: events.length,
  };
}

/**
 * Dry-run only; the real writer must issue the next sequence and enforce the
 * idempotent receipt atomically in PostgreSQL. No money is posted here.
 */
export function previewOpenItemEvent(
  source: OpenItemSource, proposed: OpenItemEvent,
): OpenItemProjection {
  const current = projectOpenItem(source);
  const existing = source.events.find((event) => event.intentId === proposed.intentId);
  if (existing) {
    const same = existing.organizationId === proposed.organizationId &&
      existing.documentId === proposed.documentId &&
      existing.currency === proposed.currency &&
      existing.sourceRef === proposed.sourceRef &&
      existing.kind === proposed.kind &&
      existing.amountMinor === proposed.amountMinor &&
      existing.businessDate === proposed.businessDate &&
      existing.sequence === proposed.sequence &&
      existing.reversesIntentId === proposed.reversesIntentId;
    if (!same) throw new Error("Idempotency intent was reused with changed settlement parameters.");
    return current;
  }
  return projectOpenItem({ ...source, events: [...source.events, proposed] });
}
