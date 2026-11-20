import { addExact, parseMinorUnits, validBusinessDate } from "../accounting/minorUnits";

/**
 * Stateless sales/purchase document arithmetic. This is NOT a posting writer.
 * A future authorized server must validate tax, catalog and source provenance.
 */
export type OperationalDocumentKind = "sales_invoice" | "purchase_bill";

export interface OperationalDocumentLine {
  lineId: string;
  description: string;
  /** Positive integer, 1 whole unit = 1,000,000 quantity units. */
  quantityMillionths: string;
  /** Price of one whole unit, in canonical signed-64-bit minor units. */
  unitPriceMinor: string;
  /** Per-line discount in minor units, not a discount rate. */
  discountMinor: string;
  /** Tax amount supplied by a separately verified jurisdiction rule. */
  taxMinor: string;
}

export interface OperationalDocumentDraft {
  organizationId: string;
  documentId: string;
  kind: OperationalDocumentKind;
  partyId: string;
  currency: string;
  businessDate: string;
  lines: readonly OperationalDocumentLine[];
}

export interface OperationalLineTotal {
  lineId: string;
  grossMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
}

export interface OperationalDocumentTotals {
  organizationId: string;
  documentId: string;
  kind: OperationalDocumentKind;
  partyId: string;
  currency: string;
  businessDate: string;
  grossMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
  lines: OperationalLineTotal[];
}

const SCALE = 1_000_000n;

function required(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
}

function nonNegativeMinor(value: string, label: string): bigint {
  const parsed = parseMinorUnits(value);
  if (parsed < 0n) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

/**
 * Uses exact BigInt arithmetic; positive half-minor ties round up, PER LINE.
 * This is an explicitly chosen calculation policy, not a tax compliance rule.
 */
export function calculateOperationalDocument(
  draft: OperationalDocumentDraft,
): OperationalDocumentTotals {
  required(draft.organizationId, "Organization");
  required(draft.documentId, "Document ID");
  required(draft.partyId, "Customer or vendor");
  if (draft.kind !== "sales_invoice" && draft.kind !== "purchase_bill") {
    throw new Error("Unsupported operational document kind.");
  }
  if (!/^[A-Z]{3}$/.test(draft.currency)) {
    throw new Error("Currency must be a three-letter uppercase code.");
  }
  if (!validBusinessDate(draft.businessDate)) {
    throw new Error("Invalid operational document date.");
  }
  if (!draft.lines.length) throw new Error("Document requires at least one line.");

  const ids = new Set<string>();
  let gross = 0n;
  let discount = 0n;
  let tax = 0n;
  const lines: OperationalLineTotal[] = [];

  for (const line of draft.lines) {
    required(line.lineId, "Line ID");
    required(line.description, "Line description");
    if (ids.has(line.lineId)) throw new Error("Duplicate document line ID.");
    ids.add(line.lineId);

    const quantity = parseMinorUnits(line.quantityMillionths);
    if (quantity <= 0n) throw new Error("Quantity must be positive.");
    const unitPrice = nonNegativeMinor(line.unitPriceMinor, "Unit price");
    const lineDiscount = nonNegativeMinor(line.discountMinor, "Discount");
    const lineTax = nonNegativeMinor(line.taxMinor, "Tax");
    const extended = unitPrice * quantity;
    const lineGross = addExact(0n, (extended + SCALE / 2n) / SCALE);
    if (lineDiscount > lineGross) {
      throw new Error("Discount exceeds the line gross amount.");
    }
    const lineTotal = addExact(addExact(lineGross, -lineDiscount), lineTax);
    gross = addExact(gross, lineGross);
    discount = addExact(discount, lineDiscount);
    tax = addExact(tax, lineTax);
    lines.push({
      lineId: line.lineId,
      grossMinor: lineGross.toString(),
      discountMinor: lineDiscount.toString(),
      taxMinor: lineTax.toString(),
      totalMinor: lineTotal.toString(),
    });
  }
  const total = addExact(addExact(gross, -discount), tax);
  if (total <= 0n) {
    throw new Error("Document must have a positive amount; use an approved credit document for refunds.");
  }

  return {
    organizationId: draft.organizationId,
    documentId: draft.documentId,
    kind: draft.kind,
    partyId: draft.partyId,
    currency: draft.currency,
    businessDate: draft.businessDate,
    grossMinor: gross.toString(),
    discountMinor: discount.toString(),
    taxMinor: tax.toString(),
    totalMinor: total.toString(),
    lines,
  };
}
