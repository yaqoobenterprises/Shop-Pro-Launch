import type { CustomerReceipt } from "./receiptContracts";
import {
  date, money, object, uuid, validateContext, type ReceivableReadContext,
} from "./receiptReadPrimitives";

const SHA = /^[0-9a-f]{64}$/;
const CASH_NUMBER = /^CC-[1-9][0-9]*$/;
const RECEIPT_NUMBER = /^CR-[1-9][0-9]*$/;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error(`Invalid AQVORA ${label}.`);
  }
  return value;
}
function hash(value: unknown, label: string): void {
  if (!SHA.test(text(value, label))) {
    throw new Error(`Invalid AQVORA ${label} fingerprint.`);
  }
}
function match(row: Record<string, unknown>, key: string, value: unknown): void {
  if (row[key] !== value) {
    throw new Error(`Receipt issue source mismatch: ${key}.`);
  }
}

/**
 * Read-only verification for the actual source-backed receipt RPC in PR #63.
 * Never assume a posted receipt was independently bank-cleared.
 */
export function verifyCustomerReceiptDetail(
  input: unknown,
  context: ReceivableReadContext & { receiptId: string },
): CustomerReceipt {
  validateContext(context);
  uuid(context.receiptId, "customer receipt");
  const receipt = object(input, "customer receipt");
  if (receipt.organization_id !== context.organizationId ||
      receipt.id !== context.receiptId || receipt.currency !== context.currency ||
      context.customerId !== undefined && receipt.customer_id !== context.customerId) {
    throw new Error("Foreign or mismatched customer receipt source.");
  }
  uuid(receipt.collection_id, "collection");
  uuid(receipt.customer_id, "receipt customer");
  uuid(receipt.created_by, "receipt maker");
  text(receipt.creation_intent, "creation intent");
  hash(receipt.collection_fingerprint, "collection");
  if (date(receipt.business_date, "receipt business") > context.asOfDate) {
    throw new Error("Receipt is after the selected report cutoff.");
  }
  const amount = money(receipt.amount_minor, "receipt amount", true);
  const revision = money(receipt.revision, "receipt revision");
  if (amount <= 0n || revision < 1n) {
    throw new Error("Receipt amount and revision must be positive.");
  }
  if (!["draft","submitted","approved","posted","cancelled"].includes(String(receipt.state))) {
    throw new Error("Unrecognized AQVORA customer receipt lifecycle state.");
  }
  const allocations = receipt.allocations;
  if (!Array.isArray(allocations) || allocations.length < 1 || allocations.length > 99) {
    throw new Error("Receipt must contain 1–99 distinct allocations.");
  }
  let total = 0n;
  const normalized: Array<{invoiceId:string;amount:bigint}> = [];
  let lastInvoice = "";
  for (const raw of allocations) {
    const alloc = object(raw, "receipt allocation");
    const invoiceId = uuid(alloc.invoice_id, "allocated invoice");
    if (invoiceId <= lastInvoice) {
      throw new Error("Receipt invoices must be unique and ordered.");
    }
    lastInvoice = invoiceId;
    if (money(alloc.invoice_revision, "invoice revision") <= 0n) {
      throw new Error("Allocated invoice revision must be positive.");
    }
    hash(alloc.invoice_fingerprint, "invoice");
    const allocated = money(alloc.amount_minor, "allocated amount", true);
    if (allocated <= 0n) throw new Error("Receipt allocation must be positive.");
    total += allocated;
    normalized.push({invoiceId,amount:allocated});
  }
  if (total !== amount) {
    throw new Error("Receipt allocations do not match the exact cash amount.");
  }

  if (receipt.state !== "posted") {
    if (receipt.journal_id !== null || receipt.receipt_number !== null ||
        receipt.issue_receipt !== undefined || receipt.reconciliation !== undefined) {
      throw new Error("Unposted receipt cannot claim journal or settlement evidence.");
    }
    return receipt as unknown as CustomerReceipt;
  }

  uuid(receipt.journal_id, "posted receipt journal");
  uuid(receipt.approved_by, "receipt checker");
  if (receipt.approved_by === receipt.created_by) {
    throw new Error("Receipt maker/checker must be distinct.");
  }
  hash(receipt.fingerprint, "receipt");
  if (!RECEIPT_NUMBER.test(text(receipt.receipt_number, "receipt number"))) {
    throw new Error("Invalid posted receipt number.");
  }
  const issue = object(receipt.issue_receipt, "durable receipt issue");
  for(const [key,value] of Object.entries({
    organization_id: receipt.organization_id, receipt_id: receipt.id,
    collection_id:receipt.collection_id, customer_id:receipt.customer_id,
    currency:receipt.currency, business_date:receipt.business_date,
    amount_minor:receipt.amount_minor, fingerprint:receipt.fingerprint,
    journal_id:receipt.journal_id, receipt_number:receipt.receipt_number,
    posted_revision:receipt.revision,
  })) match(issue,key,value);
  uuid(issue.posted_by, "posting actor");
  text(issue.intent_key, "posting intent");
  text(issue.journal_intent_key, "journal intent");
  text(issue.posted_at, "posting time");
  if (money(issue.source_revision, "approved revision") !== revision - 1n ||
      issue.evidence_method !== "dual_control_cash_attestation" ||
      !CASH_NUMBER.test(text(issue.source_ref, "cash reference"))) {
    throw new Error("Posted receipt provenance does not match approved cash evidence.");
  }
  if (!Array.isArray(issue.allocations) || issue.allocations.length !== normalized.length) {
    throw new Error("Durable issue allocations are missing.");
  }
  for (const [index, allocation] of issue.allocations.entries()) {
    const item = object(allocation, "issued allocation");
    const expected = normalized[index]!;
    uuid(item.allocation_id, "allocation ID");
    match(item,"invoice_id",expected.invoiceId);
    match(item,"amount_minor",expected.amount.toString());
    match(item,"journal_id",receipt.journal_id);
    match(item,"line_no",index + 2);
  }
  const audit = object(receipt.reconciliation, "receipt reconciliation");
  if (audit.source_complete !== true || audit.bank_verified !== false ||
      audit.evidence_method !== "dual_control_cash_attestation" ||
      money(audit.cash_debit_minor, "cash debit") !== amount ||
      money(audit.ar_credit_minor, "AR credit") !== amount ||
      money(audit.allocated_minor, "allocated receipt") !== amount) {
    throw new Error("Posted Cash/AR reconciliation or evidence is inconsistent.");
  }
  const policy = object(receipt.policy_snapshot, "receipt policy");
  if (policy.currency !== context.currency || policy.source_kind !== "controlled_cash") {
    throw new Error("Posted receipt does not have controlled-cash policy provenance.");
  }
  return receipt as unknown as CustomerReceipt;
}
