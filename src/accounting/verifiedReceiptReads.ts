import type { InvoiceOpenBalance, ReceivablesReconciliation } from "./receiptContracts";
export { verifyReceivablesSource } from "./receiptReadPrimitives";
import type { AccountingReadSource } from "./readContracts";
import {
  date, money, object, uuid, validateContext, verifyReceivablesSource,
  type ReceivableReadContext,
} from "./receiptReadPrimitives";

/** One invoice's authoritative server-certified business-date balance. */
export function verifyInvoiceOpenBalance(
  value: unknown,
  context: ReceivableReadContext & { invoiceId: string },
): InvoiceOpenBalance {
  validateContext(context);
  uuid(context.invoiceId, "requested invoice");
  const item = object(value, "invoice balance");
  if (item.organization_id !== context.organizationId ||
      item.invoice_id !== context.invoiceId ||
      item.currency !== context.currency ||
      item.as_of_date !== context.asOfDate ||
      context.customerId !== undefined && item.customer_id !== context.customerId ||
      item.source_complete !== true || item.scope !== "v2_invoice_allocations" ||
      item.legacy_included !== false || item.opening_migration_verified !== false) {
    throw new Error("AQVORA open invoice is foreign, incomplete or has a different cutoff.");
  }
  uuid(item.customer_id, "open-invoice customer");
  const invoiceDate = date(item.business_date, "invoice business");
  const dueDate = date(item.due_date, "invoice due");
  if (invoiceDate > context.asOfDate || dueDate < invoiceDate) {
    throw new Error("Invoice date is inconsistent with the selected cutoff.");
  }
  if (typeof item.fingerprint !== "string" || !SHA.test(item.fingerprint)) {
    throw new Error("AQVORA open invoice fingerprint is invalid.");
  }
  const face = money(item.face_minor, "invoice face", true);
  const allocated = money(item.allocated_minor, "allocated receipt", true);
  const outstanding = money(item.outstanding_minor, "outstanding invoice", true);
  const allPosted = money(item.all_posted_allocated_minor, "all posted allocations", true);
  if (face <= 0n || allocated > allPosted || allPosted > face ||
      allocated + outstanding !== face) {
    throw new Error("AQVORA invoice face, paid and outstanding amounts do not reconcile.");
  }
  const status = allocated === 0n ? "unpaid"
    : outstanding === 0n ? "settled" : "partial";
  if (item.status !== status || !Array.isArray(item.allocations)) {
    throw new Error("AQVORA invoice settlement status or allocation list is inconsistent.");
  }

  const seen = new Set<string>();
  let allocatedByRows = 0n;
  for (const raw of item.allocations) {
    const row = object(raw, "allocation");
    const allocationId = uuid(row.allocation_id, "allocation");
    uuid(row.receipt_id, "payment receipt");
    uuid(row.collection_id, "cash collection");
    uuid(row.journal_id, "settlement journal");
    if (seen.has(allocationId)) {
      throw new Error("Duplicate receipt allocation in the invoice read.");
    }
    seen.add(allocationId);
    if (typeof row.receipt_number !== "string" ||
        !/^CR-[1-9][0-9]*$/.test(row.receipt_number) ||
        !Number.isSafeInteger(row.line_no) || (row.line_no as number) < 2 ||
        (row.line_no as number) > 100) {
      throw new Error("Invalid receipt allocation provenance.");
    }
    const paidDate = date(row.business_date, "allocation business");
    if (paidDate < invoiceDate || paidDate > context.asOfDate) {
      throw new Error("Receipt allocation falls outside the invoice cutoff.");
    }
    const amount = money(row.amount_minor, "allocation", true);
    if (amount <= 0n) throw new Error("Receipt allocation must be positive.");
    allocatedByRows += amount;
  }
  if (allocatedByRows !== allocated) {
    throw new Error("Invoice allocation source rows do not sum to the certified payment.");
  }
  return item as unknown as InvoiceOpenBalance;
}

export interface VerifiedOpenInvoicePage {
  source: AccountingReadSource;
  rows: InvoiceOpenBalance[];
  matchedCount: string;
  hasMore: boolean;
  nextId: string | null;
  /** One page is not a complete financial report. */
  sourceCompletePage: false;
}

/**
 * Validates a single SQL keyset page and its source token. A caller combining
 * pages MUST retain token and restart from page 1 if SQL reports 40001.
 */
export function verifyOpenInvoicePage(
  value: unknown,
  context: ReceivableReadContext & {
    customerId: string;
    afterId?: string | null;
    pageLimit: number;
    expectedToken?: string;
  },
): VerifiedOpenInvoicePage {
  if (!Number.isSafeInteger(context.pageLimit) || context.pageLimit < 1 ||
      context.pageLimit > 200) {
    throw new Error("Invalid AQVORA invoice page size.");
  }
  if (context.afterId !== null && context.afterId !== undefined) {
    uuid(context.afterId, "pagination cursor");
    if (!context.expectedToken) {
      throw new Error("Continuing an open invoice read requires its original snapshot token.");
    }
  }
  const page = object(value, "open invoices page");
  const source = verifyReceivablesSource(page.source, context, context.expectedToken);
  const matchedCount = money(page.matched_count, "matching invoices");
  if (!Array.isArray(page.rows) || page.rows.length > context.pageLimit ||
      BigInt(page.rows.length) > matchedCount ||
      typeof page.has_more !== "boolean") {
    throw new Error("Invalid AQVORA open invoices page metadata.");
  }
  const rows: InvoiceOpenBalance[] = [];
  let previous = context.afterId ?? null;
  for (const raw of page.rows) {
    const r = object(raw, "listed invoice balance");
    const invoiceId = uuid(r.invoice_id, "listed invoice");
    if (previous !== null && invoiceId <= previous) {
      throw new Error("AQVORA open-invoice pages have duplicated or unordered IDs.");
    }
    const verified = verifyInvoiceOpenBalance(raw, {
      ...context, invoiceId,
    });
    if (verified.status === "settled" || verified.outstanding_minor === "0") {
      throw new Error("Open-invoice list contains a settled invoice.");
    }
    rows.push(verified);
    previous = invoiceId;
  }
  const nextId = page.next_after_id;
  if (nextId !== null && typeof nextId !== "string" ||
      rows.length === 0 && nextId !== null ||
      rows.length > 0 && nextId !== rows[rows.length - 1]?.invoice_id ||
      page.has_more && (rows.length === 0 || nextId === null)) {
    throw new Error("AQVORA open-invoice continuation metadata is inconsistent.");
  }
  return {
    source, rows, matchedCount: matchedCount.toString(),
    hasMore: page.has_more as boolean, nextId: nextId as string | null,
    sourceCompletePage: false,
  };
}

/** Certified company/customer AR reconciliation, without invented aging. */
export function verifyReceivablesReconciliation(
  value: unknown,
  context: ReceivableReadContext,
): ReceivablesReconciliation {
  const report = object(value, "AR reconciliation");
  verifyReceivablesSource(report.source, context);
  const customer = context.customerId ?? null;
  if (report.customer_id !== customer ||
      report.as_of_date !== context.asOfDate ||
      report.scope !== (customer === null ? "company" : "customer") ||
      report.aging_supported !== false) {
    throw new Error("AQVORA AR reconciliation scope or as-of period is mismatched.");
  }
  money(report.invoice_count, "AR invoice count");
  const face = money(report.face_minor, "AR face");
  const allocated = money(report.allocated_minor, "AR allocated");
  const outstanding = money(report.outstanding_minor, "AR outstanding");
  const control = money(report.ar_control_minor, "AR control");
  if (allocated > face || face !== allocated + outstanding ||
      outstanding !== control) {
    throw new Error("AR source does not reconcile with the V2 receivables control.");
  }
  return report as unknown as ReceivablesReconciliation;
}
