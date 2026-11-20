import { validBusinessDate } from "./minorUnits";
import type { SalesInvoice } from "./salesContracts";

/**
 * Runtime verification of PR #59's service invoice detail response.
 *
 * This is NOT authentication: the server must authorize AAL2, membership and
 * company. Do not infer customer payment status from this pre-settlement source.
 */
export type VerifiedServiceInvoice = {
  invoice: SalesInvoice;
  sourceBasis: "verified_issued_service_invoice" | "unposted_service_draft";
  /** Deliberately no paid/outstanding fields until the settlement RPC exists. */
  paymentState: "not_available";
};
const MAX_BIGINT = 9223372036854775807n;
const UNIT_SCALE = 1_000_000n;
const CANONICAL = /^(0|[1-9][0-9]*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VALID_STATES = new Set(["draft", "submitted", "approved", "issued", "cancelled"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed sales ${label} response.`);
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`Invalid sales ${label} value.`);
  }
  return value;
}
function positiveMoney(value: unknown, label: string, positive = true): bigint {
  if (typeof value !== "string" || !CANONICAL.test(value)) {
    throw new Error(`Invalid canonical sales ${label} amount.`);
  }
  const n = BigInt(value);
  if (n > MAX_BIGINT || (positive && n <= 0n)) {
    throw new Error(`Sales ${label} amount is outside supported bounds.`);
  }
  return n;
}
function businessDate(value: unknown, label: string): string {
  const date = string(value, label);
  if (!validBusinessDate(date)) throw new Error(`Invalid sales ${label} date.`);
  return date;
}
function hash(value: unknown, label: string): string {
  const h = string(value, label);
  if (!SHA256.test(h)) throw new Error(`Invalid sales ${label} fingerprint.`);
  return h;
}
function matches(object: Record<string, unknown>, key: string, actual: unknown): void {
  if (object[key] !== actual) {
    throw new Error(`Sales source mismatch: ${key}.`);
  }
}

export function verifyServiceInvoiceSource(
  payload: unknown,
  context: { organizationId: string; invoiceId: string },
): VerifiedServiceInvoice {
  const v = record(payload, "invoice");
  if (v.organization_id !== context.organizationId || v.id !== context.invoiceId) {
    throw new Error("Sales source belongs to another company or invoice.");
  }
  string(v.created_by, "creator");
  string(v.customer_id, "customer");
  string(v.creation_intent, "creation intent");
  const currency = string(v.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid sales company currency.");
  const date = businessDate(v.business_date, "business");
  const due = businessDate(v.due_date, "due");
  if (due < date) throw new Error("Sales due date predates invoice.");
  if (!VALID_STATES.has(v.state as string)) {
    throw new Error("Unrecognized sales invoice lifecycle state.");
  }
  const revision = positiveMoney(v.revision, "revision");
  if (!Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 100) {
    throw new Error("Sales source requires 1–100 service lines.");
  }

  let grossSum = 0n;
  let discountSum = 0n;
  for (const [index, line] of v.lines.entries()) {
    const r = record(line, "line");
    if (r.line_no !== index + 1) {
      throw new Error("Sales line numbers must be consecutive.");
    }
    string(r.description, "description");
    const quantity = positiveMoney(r.quantity_millionths, "quantity");
    const price = positiveMoney(r.unit_price_minor, "unit price");
    const discount = positiveMoney(r.discount_minor, "line discount", false);
    const gross = positiveMoney(r.gross_minor, "line gross");
    const net = positiveMoney(r.net_minor, "line net", false);
    const calculated = (quantity * price + UNIT_SCALE / 2n) / UNIT_SCALE;
    if (calculated !== gross || discount > gross || net !== gross - discount) {
      throw new Error("Sales line does not reconcile with exact server arithmetic.");
    }
    grossSum += gross;
    discountSum += discount;
  }
  const gross = positiveMoney(v.gross_minor, "gross");
  const discount = positiveMoney(v.discount_minor, "discount", false);
  const face = positiveMoney(v.face_minor, "face");
  if (grossSum !== gross || discountSum !== discount || gross - discount !== face) {
    throw new Error("Sales document totals do not reconcile.");
  }

  if (v.state === "issued") {
    string(v.journal_id, "journal");
    string(v.approved_by, "approver");
    if (v.approved_by === v.created_by) {
      throw new Error("Issued sales invoice violates maker-checker separation.");
    }
    const fingerprint = hash(v.fingerprint, "invoice");
    const number = string(v.document_number, "number");
    if (!/^SI-[1-9][0-9]*$/.test(number)) {
      throw new Error("Invalid issued sales document number.");
    }
    const customer = record(v.customer_snapshot, "customer snapshot");
    matches(customer, "id", v.customer_id);
    const policy = record(v.policy_snapshot, "approved policy");
    matches(policy, "currency", currency);
    matches(policy, "tax_treatment", "verified_out_of_scope");
    const receipt = record(v.issue_receipt, "issuance receipt");
    for (const [key, value] of Object.entries({
      organization_id: v.organization_id, invoice_id: v.id,
      customer_id: v.customer_id, currency, business_date: date,
      document_number: number, journal_id: v.journal_id,
      fingerprint, face_minor: v.face_minor, issued_revision: v.revision,
    })) matches(receipt, key, value);
    string(receipt.intent_key, "receipt intent");
    string(receipt.posted_by, "posting actor");
    string(receipt.posted_at, "posted time");
    string(receipt.journal_intent_key, "journal intent");
    const sourceRevision = positiveMoney(receipt.source_revision, "approved revision");
    if (sourceRevision !== revision - 1n) {
      throw new Error("Sales issue receipt has a stale approved revision.");
    }
    const reconciliation = record(v.reconciliation, "reconciliation");
    if (reconciliation.source_complete !== true ||
        reconciliation.settlements_supported !== false ||
        reconciliation.basis !== "unsettled_issued_service_invoice" ||
        reconciliation.face_minor !== v.face_minor ||
        reconciliation.ar_debit_minor !== v.face_minor ||
        reconciliation.revenue_credit_minor !== v.face_minor) {
      throw new Error("Issued sales source lacks verified AR/revenue reconciliation.");
    }
    return {
      invoice: v as unknown as SalesInvoice,
      sourceBasis: "verified_issued_service_invoice",
      paymentState: "not_available",
    };
  }

  // Draft/submitted/approved/cancelled are NOT posted receivables.
  if (v.journal_id !== null || v.document_number !== null ||
      "issue_receipt" in v || "reconciliation" in v) {
    throw new Error("Unissued sales document must not claim financial posting.");
  }
  return {
    invoice: v as unknown as SalesInvoice,
    sourceBasis: "unposted_service_draft",
    paymentState: "not_available",
  };
}
