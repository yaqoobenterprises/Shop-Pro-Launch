/**
 * Read-only V2 AR integration, never a posting authority. The server is the
 * source of truth for cash attestation, approvals, balances and permissions.
 */
import type {
  InvoiceOpenBalance, ReceivablesReconciliation,
} from "../accounting/receiptContracts";
import type { AccountingReadSource } from "../accounting/readContracts";
import {validateReportCurrencyEvidence,requireMatchingInvoicePolicyForReport}
  from "../accounting/currencyReportEvidence";
import {
  verifyInvoiceOpenBalance, verifyOpenInvoicePage,
  verifyReceivablesReconciliation,
} from "../accounting/verifiedReceiptReads";
import {
  money, uuid,
} from "../accounting/receiptReadPrimitives";
import {
  requestIsolatedReceivablesRpc, requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";

export interface CompleteV2OpenInvoices {
  /** Complete only for this V2 company/customer/currency/business-date cutoff. */
  complete: true;
  source: AccountingReadSource;
  invoices: InvoiceOpenBalance[];
  matchedCount: string;
  pageCount: number;
  legacyIncluded: false;
  bankVerified: false;
}

export interface OpenInvoiceCollectionOptions {
  pageSize?: number;
  maxPages?: number;
  maxRows?: number;
}

function bounded(
  value: number | undefined, defaultValue: number, max: number, label: string,
): number {
  const result = value ?? defaultValue;
  if (!Number.isSafeInteger(result) || result < 1 || result > max) {
    throw new Error(`Invalid AQVORA ${label} limit.`);
  }
  return result;
}

/** Actual company-scoped invoice-open-balance RPC; no guessed paid amount. */
export async function loadIsolatedInvoiceOpenBalance(
  context: IsolatedReceivablesContext,
  invoiceId: string,
): Promise<InvoiceOpenBalance> {
  uuid(invoiceId, "invoice");
  const raw = await requestIsolatedReceivablesRpc(
    context, "get_aqvora_invoice_open_balance", {
      p_organization_id: context.organizationId,
      p_invoice_id: invoiceId,
      p_as_of_date: context.asOfDate,
    },
  );
  return verifyInvoiceOpenBalance(raw, { ...context, invoiceId });
}

/** Customer/company AR report reconciled to the source-owned V2 control GL. */
export async function loadIsolatedReceivablesReconciliation(
  context: IsolatedReceivablesContext,
): Promise<ReceivablesReconciliation> {
  const raw = await requestIsolatedReceivablesRpc(
    context, "read_aqvora_receivables", {
      p_organization_id: context.organizationId,
      p_currency: context.currency,
      p_as_of_date: context.asOfDate,
      p_customer_id: context.customerId ?? null,
    },
  );
  const result = verifyReceivablesReconciliation(raw, context);
  if (result.source.authorized_user_id !== context.userId) {
    throw new Error("AQVORA receivables report belongs to another authorized user.");
  }
  return result;
}

/**
 * Atomic-at-the-client reporting: all pages or an error. A SQL 40001 requires
 * a brand-new invocation; never resume or cache previously collected rows.
 */
export async function collectIsolatedOpenInvoices(
  context: IsolatedReceivablesContext & { customerId: string },
  options: OpenInvoiceCollectionOptions = {},
): Promise<CompleteV2OpenInvoices> {
  uuid(context.customerId, "customer");
  const pageSize = bounded(options.pageSize, 100, 200, "page size");
  const maxPages = bounded(options.maxPages, 100, 1000, "page count");
  const maxRows = bounded(options.maxRows, 10_000, 200_000, "row count");
  await requireIsolatedReceivablesSession(context);

  const invoices: InvoiceOpenBalance[] = [];
  let afterId: string | null = null;
  let source: AccountingReadSource | null = null;
  let matched: bigint | null = null;
  const cursors = new Set<string>();

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const raw = await requestIsolatedReceivablesRpc(
      context, "list_aqvora_open_invoices", {
        p_organization_id: context.organizationId,
        p_customer_id: context.customerId,
        p_currency: context.currency,
        p_as_of_date: context.asOfDate,
        p_after_id: afterId,
        p_limit: pageSize,
        p_snapshot_token: source?.snapshot_token ?? null,
      },
    );
    const page = verifyOpenInvoicePage(raw, {
      ...context, afterId, pageLimit: pageSize,
      expectedToken: source?.snapshot_token,
    });
    if (page.source.authorized_user_id !== context.userId ||
        source && (
          page.source.authorized_role !== source.authorized_role ||
          page.source.source_journal_count !== source.source_journal_count ||
          page.source.source_line_count !== source.source_line_count ||
          page.source.source_debit_minor !== source.source_debit_minor ||
          page.source.source_credit_minor !== source.source_credit_minor
        )) {
      throw new Error("AQVORA open-invoice source identity changed during paging.");
    }
    const scope={organizationId:context.organizationId,
      currency:context.currency,asOfDate:context.asOfDate};
    const expectedEvidence=source===null?undefined:
      validateReportCurrencyEvidence(source,scope);
    const pageEvidence=validateReportCurrencyEvidence(
      page.source,scope,expectedEvidence);
    page.rows.forEach(invoice=>requireMatchingInvoicePolicyForReport(
      invoice,pageEvidence));
    const count = money(page.matchedCount, "matched invoices");
    if (matched !== null && matched !== count) {
      throw new Error("AQVORA open-invoice count changed during paging.");
    }
    if (count > BigInt(maxRows) ||
        BigInt(invoices.length + page.rows.length) > count) {
      throw new Error("AQVORA open-invoice report exceeds its safe row bounds.");
    }
    source ??= page.source;
    matched ??= count;
    invoices.push(...page.rows);
    if (!page.hasMore) {
      if (BigInt(invoices.length) !== count) {
        throw new Error("AQVORA open-invoice read ended with missing source rows.");
      }
      await requireIsolatedReceivablesSession(context);
      return {
        complete: true, source, invoices, matchedCount: count.toString(),
        pageCount: pageNumber + 1, legacyIncluded: false, bankVerified: false,
      };
    }
    if (!page.nextId || cursors.has(page.nextId) ||
        BigInt(invoices.length) >= count) {
      throw new Error("AQVORA open-invoice continuation is missing or looping.");
    }
    cursors.add(page.nextId);
    afterId = page.nextId;
  }
  throw new Error("AQVORA open-invoice report exceeded the safe pagination limit.");
}
