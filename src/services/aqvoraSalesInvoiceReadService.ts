/**
 * Inactive, isolated-staging-only, READ-ONLY service for the verified Sales
 * Invoice APIs from backend Draft PR #59. It never posts money and never
 * infers invoice payments (the settlement writer is a separate milestone).
 */
import {
  getSupabaseClient, getSupabaseConfig, hasConfiguredCloudSession,
  isSupabaseConfigured,
} from "../lib/supabase";
import type { SalesIssueReceipt } from "../accounting/salesContracts";
import {
  verifyServiceInvoiceSource, type VerifiedServiceInvoice,
} from "../accounting/verifiedSalesInvoice";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSINESS_REFS = new Set(["xarbzazjzcaezcpstiga", "ienwbrrzsutbispaiymi"]);

export interface IsolatedSalesReadContext {
  organizationId: string;
  userId: string;
  isCloudAccount: boolean;
}

export interface IsolatedInvoicePage {
  invoices: VerifiedServiceInvoice[];
  /** List RPC uses live keyset pages, not a transactionally certified export. */
  sourceComplete: false;
  hasPotentialNextPage: boolean;
  nextId: string | null;
}

/**
 * Safety routing gate only. Server-side live session, membership, AAL2 and
 * source certification are the actual authorization boundaries.
 */
export function isIsolatedSalesReadEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_AQVORA_VERIFIED_SALES_READS !== "true" ||
      import.meta.env.VITE_AQVORA_ISOLATED_STAGING_REVIEW !== "true" ||
      !isSupabaseConfigured()) return false;
  const ref = (import.meta.env.VITE_AQVORA_STAGING_PROJECT_REF as string | undefined)
    ?.trim().toLowerCase();
  if (!ref || !/^[a-z]{20}$/.test(ref) || BUSINESS_REFS.has(ref)) return false;
  return getSupabaseConfig().url.toLowerCase() === `https://${ref}.supabase.co`;
}

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`Invalid ${name} identifier for verified sales read.`);
  }
  return value.toLowerCase();
}

async function requireSalesSession(context: IsolatedSalesReadContext): Promise<void> {
  if (!isIsolatedSalesReadEnabled()) {
    throw new Error("AQVORA verified sales reads are disabled outside isolated staging.");
  }
  id(context.organizationId, "company");
  id(context.userId, "user");
  if (!context.isCloudAccount || !(await hasConfiguredCloudSession(context.userId))) {
    throw new Error("A matching live cloud session is required for sales reads.");
  }
}

async function salesRpc(
  context: IsolatedSalesReadContext,
  name: "get_aqvora_sales_invoice" | "lookup_aqvora_sales_issue" |
    "list_aqvora_sales_invoices",
  args: Record<string, unknown>,
): Promise<unknown> {
  await requireSalesSession(context);
  const { data, error } = await getSupabaseClient().rpc(name, args);
  if (error) throw error; // No demo/zero fallback on SQLSTATE 42501, 23514, etc.
  await requireSalesSession(context);
  return data;
}

/** Validates the actual source receipt and Dr AR / Cr revenue journal summary. */
export async function loadVerifiedServiceInvoice(
  context: IsolatedSalesReadContext,
  invoiceId: string,
): Promise<VerifiedServiceInvoice> {
  const org = id(context.organizationId, "company");
  const invoice = id(invoiceId, "invoice");
  const data = await salesRpc(context, "get_aqvora_sales_invoice", {
    p_organization_id: org, p_invoice_id: invoice,
  });
  return verifyServiceInvoiceSource(data, { organizationId: org, invoiceId: invoice });
}

export type IssueLookupResult =
  | { status: "not_found"; safeToReissue: false }
  | { status: "found"; receipt: SalesIssueReceipt; invoice: VerifiedServiceInvoice };

/**
 * Lost-ACK recovery is READ ONLY: a missing receipt is *not* permission to
 * issue again with a different key. Only the server can resolve that safely.
 */
export async function lookupVerifiedSalesIssue(
  context: IsolatedSalesReadContext,
  intentKey: string,
): Promise<IssueLookupResult> {
  const org = id(context.organizationId, "company");
  if (!intentKey || intentKey.trim() !== intentKey || intentKey.length > 100) {
    throw new Error("Invalid original sales issuance intent.");
  }
  const raw = await salesRpc(context, "lookup_aqvora_sales_issue", {
    p_organization_id: org, p_intent_key: intentKey,
  });
  if (raw === null) return { status: "not_found", safeToReissue: false };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Malformed sales issuance lookup receipt.");
  }
  const receipt = raw as Record<string, unknown>;
  if (receipt.organization_id !== org || receipt.intent_key !== intentKey) {
    throw new Error("Sales issuance lookup returned foreign or mismatched receipt.");
  }
  const invoice = await loadVerifiedServiceInvoice(context, id(receipt.invoice_id, "issued invoice"));
  if (invoice.sourceBasis !== "verified_issued_service_invoice" ||
      !invoice.invoice.issue_receipt) {
    throw new Error("Sales issuance receipt lacks a verified issued invoice.");
  }
  const original = invoice.invoice.issue_receipt as unknown as Record<string, unknown>;
  for (const key of Object.keys(original)) {
    if (receipt[key] !== original[key]) {
      throw new Error("Sales issuance lookup disagrees with durable source receipt.");
    }
  }
  return { status: "found", receipt: raw as SalesIssueReceipt, invoice };
}

/**
 * Single page only: live invoice UUID pagination is not a consistent complete
 * report. Never label an empty page as 'all transactions' or as an AR balance.
 */
export async function loadVerifiedSalesInvoicePage(
  context: IsolatedSalesReadContext,
  options: { afterId?: string; limit?: number } = {},
): Promise<IsolatedInvoicePage> {
  const org = id(context.organizationId, "company");
  const after = options.afterId ? id(options.afterId, "invoice cursor") : null;
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Sales invoice page size must be between 1 and 200.");
  }
  const data = await salesRpc(context, "list_aqvora_sales_invoices", {
    p_organization_id: org, p_after_id: after, p_limit: limit,
  });
  if (!Array.isArray(data) || data.length > limit) {
    throw new Error("Sales invoice page has an invalid source or length.");
  }
  let previous = after;
  const invoices: VerifiedServiceInvoice[] = [];
  for (const item of data) {
    const record = item as Record<string, unknown>;
    const invoiceId = id(record?.id, "listed invoice");
    if (previous !== null && invoiceId <= previous) {
      throw new Error("Sales invoice page is out of order or duplicated.");
    }
    invoices.push(verifyServiceInvoiceSource(item, { organizationId: org, invoiceId }));
    previous = invoiceId;
  }
  return {
    invoices, sourceComplete: false,
    hasPotentialNextPage: invoices.length === limit,
    nextId: previous === after ? null : previous,
  };
}
