import { validBusinessDate } from "./minorUnits";
import type {
  InvoiceOpenBalance, ReceivablesReconciliation,
} from "./receiptContracts";
import type { AccountingReadSource } from "./readContracts";

/**
 * Runtime checks for untrusted JSON from the certified V2 reads in PR #63.
 * The SQL server, not this browser code, authenticates and certifies records.
 * No money is posted, no cached amount authorizes a settlement.
 */
const UINT = /^(0|[1-9][0-9]*)$/;
const SHA = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT_MAX = 9223372036854775807n;

export interface ReceivableReadContext {
  organizationId: string;
  currency: string;
  asOfDate: string;
  customerId?: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed AQVORA " + label + " response.");
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error("Invalid AQVORA " + label + " string.");
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  if (!UUID.test(nonempty(value, label))) {
    throw new Error("Invalid AQVORA " + label + " identifier.");
  }
  return value as string;
}

function date(value: unknown, label: string): string {
  const valueDate = nonempty(value, label);
  if (!validBusinessDate(valueDate)) {
    throw new Error("Invalid AQVORA " + label + " date.");
  }
  return valueDate;
}

function money(value: unknown, label: string, bigintOnly = false): bigint {
  if (typeof value !== "string" || !UINT.test(value)) {
    throw new Error("Invalid exact AQVORA " + label + " minor-unit string.");
  }
  const amount = BigInt(value);
  if (bigintOnly && amount > BIGINT_MAX) {
    throw new Error("AQVORA " + label + " exceeds signed BIGINT.");
  }
  return amount;
}

function validateContext(context: ReceivableReadContext): void {
  uuid(context.organizationId, "organization");
  if (!/^[A-Z]{3}$/.test(context.currency)) {
    throw new Error("Invalid AQVORA currency.");
  }
  date(context.asOfDate, "as-of");
  if (context.customerId !== undefined) uuid(context.customerId, "customer");
}

/**
 * Certified source metadata is V2-only and excludes historical legacy books.
 * Its token is a change detector, NOT a cryptographic authorization proof.
 */
export function verifyReceivablesSource(
  value: unknown,
  context: ReceivableReadContext,
  expectedToken?: string,
): AccountingReadSource {
  validateContext(context);
  const src = object(value, "source certification");
  if (src.contract_version !== "aqvora-read-v1" ||
      src.organization_id !== context.organizationId ||
      src.currency !== context.currency ||
      src.from_date !== "0001-01-01" ||
      src.to_date !== context.asOfDate ||
      src.basis !== "v2_posted_journals" ||
      src.source_complete !== true ||
      src.legacy_included !== false ||
      src.opening_migration_verified !== false ||
      src.consistency !== "restart_on_source_change") {
    throw new Error("AQVORA source is not a complete matching V2 read.");
  }
  if (src.authorized_role !== "OWNER" && src.authorized_role !== "MANAGER") {
    throw new Error("Unexpected AQVORA source authorization role.");
  }
  uuid(src.authorized_user_id, "certified reader");
  nonempty(src.observed_at, "observation timestamp");
  if (typeof src.snapshot_token !== "string" || !SHA.test(src.snapshot_token) ||
      expectedToken !== undefined && src.snapshot_token !== expectedToken) {
    throw new Error("AQVORA certified source changed; restart from first page.");
  }
  const journals = money(src.source_journal_count, "journal count");
  const lines = money(src.source_line_count, "line count");
  const dr = money(src.source_debit_minor, "source debits");
  const cr = money(src.source_credit_minor, "source credits");
  if (dr !== cr || journals === 0n && (lines !== 0n || dr !== 0n)) {
    throw new Error("AQVORA source financial totals are inconsistent.");
  }
  return src as unknown as AccountingReadSource;
}

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
