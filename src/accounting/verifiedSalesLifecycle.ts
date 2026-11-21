import type { SalesInvoice } from "./salesContracts";
import { date, money, object, uuid, validateContext, type ReceivableReadContext } from "./receiptReadPrimitives";

const HASH = /^[0-9a-f]{64}$/;
const MAX = 9223372036854775807n;
const SCALE = 1000000n;
function exact(value: unknown, name: string, positive = false): bigint {
  const n = money(value, name, true);
  if (n > MAX || (positive && n === 0n)) throw new Error("Invalid exact sales " + name);
  return n;
}
function same(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw new Error("Sales source mismatch: " + name);
}

/** Fail-closed runtime schema: documents cannot manufacture a posting or receipt. */
export function verifySalesLifecycleInvoice(
  raw: unknown,
  context: ReceivableReadContext & { invoiceId: string },
): SalesInvoice {
  validateContext(context);
  uuid(context.invoiceId, "requested sales invoice");
  const v = object(raw, "sales invoice");
  same(v.organization_id, context.organizationId, "company");
  same(v.id, context.invoiceId, "invoice");
  same(v.currency, context.currency, "currency");
  if (context.customerId) same(v.customer_id, context.customerId, "customer");
  uuid(v.customer_id, "sales customer");
  uuid(v.created_by, "sales maker");
  const business = date(v.business_date, "invoice business");
  const due = date(v.due_date, "invoice due");
  if (due < business || typeof v.creation_intent !== "string" ||
      v.creation_intent.length < 1 || v.creation_intent.length > 100) {
    throw new Error("Malformed service invoice provenance.");
  }
  const revision = exact(v.revision, "revision", true);
  if (revision < 1n || !Array.isArray(v.lines) || v.lines.length < 1 ||
      v.lines.length > 100) throw new Error("Invalid invoice revision or lines.");

  let grossTotal = 0n;
  let discountTotal = 0n;
  for (const [index,rawLine] of v.lines.entries()) {
    const line = object(rawLine, "invoice line");
    same(line.line_no, index + 1, "line order");
    if (typeof line.description !== "string" ||
        !line.description.trim() || line.description !== line.description.trim() ||
        line.description.length > 300) throw new Error("Invalid service line description.");
    const q = exact(line.quantity_millionths, "quantity", true);
    const p = exact(line.unit_price_minor, "unit price", true);
    const discount = exact(line.discount_minor, "discount");
    const gross = (q * p + SCALE / 2n) / SCALE;
    if (gross > MAX || gross === 0n || discount > gross) {
      throw new Error("Invalid invoice line amount/discount.");
    }
    same(exact(line.gross_minor, "line gross").toString(), gross.toString(), "line gross");
    same(exact(line.net_minor, "line net").toString(), (gross - discount).toString(), "line net");
    grossTotal += gross; discountTotal += discount;
  }
  const face = grossTotal - discountTotal;
  if (grossTotal > MAX || face <= 0n ||
      exact(v.gross_minor, "gross") !== grossTotal ||
      exact(v.discount_minor, "discount total") !== discountTotal ||
      exact(v.face_minor, "face") !== face) {
    throw new Error("Sales invoice total does not reconcile.");
  }

  if (!["draft", "submitted", "approved", "issued", "cancelled"].includes(String(v.state))) {
    throw new Error("Invalid sales invoice state.");
  }
  if (v.state === "draft" && (v.fingerprint !== null || v.approved_by !== null ||
      v.customer_snapshot !== null || v.policy_snapshot !== null)) {
    throw new Error("Unsubmitted draft cannot claim financial approval evidence.");
  }
  if (v.state === "submitted" && v.approved_by !== null) {
    throw new Error("Submitted invoice cannot claim a checker approval.");
  }
  if (v.state === "cancelled" &&
      (typeof v.cancel_reason !== "string" || !v.cancel_reason.trim())) {
    throw new Error("Cancelled invoice must retain an audit reason.");
  }
  const committed = v.state === "submitted" || v.state === "approved" || v.state === "issued";
  if (committed) {
    if (typeof v.fingerprint !== "string" || !HASH.test(v.fingerprint) ||
        !v.customer_snapshot || !v.policy_snapshot) {
      throw new Error("Certified invoice policy/customer snapshot is missing.");
    }
    same(object(v.customer_snapshot, "customer snapshot").id, v.customer_id, "customer snapshot");
  }
  if (v.state === "approved" || v.state === "issued") {
    uuid(v.approved_by, "invoice checker");
    if (v.approved_by === v.created_by) {
      throw new Error("Invoice approval violates distinct maker/checker.");
    }
  }
  if (v.state !== "issued") {
    if (v.journal_id !== null || v.document_number !== null ||
        v.issue_receipt !== undefined || v.reconciliation !== undefined) {
      throw new Error("Unissued invoice cannot claim a posted journal.");
    }
  } else {
    uuid(v.journal_id, "invoice journal");
    if (typeof v.document_number !== "string" ||
        !/^SI-[1-9][0-9]*$/.test(v.document_number)) {
      throw new Error("Issued sales invoice number is invalid.");
    }
    const receipt = object(v.issue_receipt, "source issue receipt");
    for (const key of ["organization_id", "customer_id", "business_date", "currency",
      "fingerprint", "document_number", "journal_id", "face_minor"]) {
      same(receipt[key], v[key], "receipt " + key);
    }
    same(receipt.invoice_id, v.id, "receipt invoice");
    same(exact(receipt.issued_revision, "issued revision"), revision, "issued revision");
    same(exact(receipt.source_revision, "approved revision", true), revision - 1n, "approved revision");
    uuid(receipt.posted_by, "posting actor");
    const sums = object(v.reconciliation, "sales reconciliation");
    if (sums.source_complete !== true || sums.settlements_supported !== true ||
        sums.basis !== "v2_posted_receipt_allocations" ||
        exact(sums.face_minor, "reconciliation face") !== face ||
        exact(sums.ar_debit_minor, "AR debit") !== face ||
        exact(sums.revenue_credit_minor, "revenue credit") !== face) {
      throw new Error("Posted AR / revenue source is inconsistent.");
    }
    const allocated = exact(sums.allocated_minor, "posted allocations");
    const outstanding = exact(sums.outstanding_minor, "remaining receivable");
    if (allocated + outstanding !== face) {
      throw new Error("Invoice allocations do not equal source face.");
    }
  }
  return v as unknown as SalesInvoice;
}
