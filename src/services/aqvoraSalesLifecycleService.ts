import type {
  SalesInvoice, SalesIssueReceipt, SalesIssueRequest, SalesTransitionRequest,
} from "../accounting/salesContracts";
import { verifySalesLifecycleInvoice } from "../accounting/verifiedSalesLifecycle";
import { money, object, uuid } from "../accounting/receiptReadPrimitives";
import { getSupabaseClient } from "../lib/supabase";
import {
  requestIsolatedReceivablesRpc, requireIsolatedReceivablesSession,
  type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";
import { isIsolatedSalesDraftCreationEnabled } from "./aqvoraStagingSalesDraftService";

/** Sensitive financial actions require their own explicit opt-in, always OFF by default. */
export const isIsolatedInvoiceLifecycleEnabled = (): boolean =>
  isIsolatedSalesDraftCreationEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_INVOICE_LIFECYCLE === "true";
export const isIsolatedInvoiceIssueEnabled = (): boolean =>
  isIsolatedInvoiceLifecycleEnabled() &&
  import.meta.env.VITE_ENABLE_AQVORA_STAGING_FINANCIAL_ISSUE === "true";

function revision(value: string): bigint {
  const amount = money(value, "sales source revision");
  if (amount < 1n || amount > 9223372036854775807n) {
    throw new Error("Invalid invoice optimistic revision.");
  }
  return amount;
}
function same(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error("Invoice " + label + " changed or mismatched.");
}

async function mutation(
  context: IsolatedReceivablesContext,
  method: "transition_aqvora_sales_invoice" | "issue_aqvora_sales_invoice",
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!isIsolatedInvoiceLifecycleEnabled() ||
      method === "issue_aqvora_sales_invoice" && !isIsolatedInvoiceIssueEnabled()) {
    throw new Error("Isolated invoice lifecycle/financial posting is disabled.");
  }
  await requireIsolatedReceivablesSession(context);
  const { data, error } = await getSupabaseClient().rpc(method, args);
  if (error) throw error;
  await requireIsolatedReceivablesSession(context);
  return data;
}

export async function loadIsolatedSalesInvoice(
  context: IsolatedReceivablesContext, invoiceId: string,
): Promise<SalesInvoice> {
  uuid(invoiceId, "invoice");
  const data = await requestIsolatedReceivablesRpc(context, "get_aqvora_sales_invoice", {
    p_organization_id: context.organizationId, p_invoice_id: invoiceId,
  });
  return verifySalesLifecycleInvoice(data, { ...context, invoiceId });
}

/** One compare-and-swap transition; NEVER blindly retry after a lost response. */
export async function transitionIsolatedSalesInvoice(
  context: IsolatedReceivablesContext, request: SalesTransitionRequest,
): Promise<SalesInvoice> {
  if (!isIsolatedInvoiceLifecycleEnabled()) {
    throw new Error("Isolated invoice lifecycle/financial posting is disabled.");
  }
  same(request.p_organization_id, context.organizationId, "company");
  uuid(request.p_invoice_id, "invoice");
  const expected = revision(request.p_expected_revision);
  const action = request.p_action;
  const next: Record<string, SalesInvoice["state"]> = {
    submit: "submitted", approve: "approved", reject: "draft", cancel: "cancelled",
  };
  if (!(action in next)) throw new Error("Unsupported sales transition action.");
  const reason = request.p_reason ?? null;
  if ((action === "reject" || action === "cancel") &&
      (typeof reason !== "string" || !reason.trim() || reason.length > 500)) {
    throw new Error("A specific rejection/cancellation reason is required.");
  }
  if ((action === "approve" || action === "submit") && reason !== null) {
    throw new Error("Unexpected transition reason.");
  }
  const before = await loadIsolatedSalesInvoice(context, request.p_invoice_id);
  same(before.revision, expected.toString(), "revision");
  if (before.state === "issued" || before.state === "cancelled" ||
      action === "submit" && (before.state !== "draft" || before.created_by !== context.userId) ||
      (action === "approve" || action === "reject") && before.state !== "submitted" ||
      action === "approve" && before.created_by === context.userId) {
    throw new Error("Invoice state or maker-checker permissions reject this transition.");
  }
  const raw = await mutation(context, "transition_aqvora_sales_invoice", {
    p_organization_id: context.organizationId,
    p_invoice_id: request.p_invoice_id,
    p_expected_revision: request.p_expected_revision,
    p_action: action,
    p_reason: reason,
  });
  const after = verifySalesLifecycleInvoice(raw, { ...context, invoiceId: before.id });
  same(after.state, next[action], "new state");
  same(revision(after.revision), expected + 1n, "next revision");
  for (const field of ["id", "organization_id", "created_by", "customer_id",
    "business_date", "due_date", "currency", "face_minor", "gross_minor",
    "discount_minor", "creation_intent"]) {
    same(after[field as keyof SalesInvoice], before[field as keyof SalesInvoice], field);
  }
  if (action === "submit") same(after.fingerprint !== null, true, "submission fingerprint");
  if (action === "approve") {
    same(after.approved_by, context.userId, "checker");
    same(after.fingerprint, before.fingerprint, "approved fingerprint");
  }
  return after;
}

/**
 * Distinct opt-in required for actual financial posting on disposable staging.
 * RPC issues exactly once; a lost response must be recovered with the ORIGINAL key.
 */
export async function issueIsolatedSalesInvoice(
  context: IsolatedReceivablesContext, request: SalesIssueRequest,
): Promise<{receipt: SalesIssueReceipt; invoice: SalesInvoice}> {
  if (!isIsolatedInvoiceIssueEnabled()) {
    throw new Error("Isolated financial issuance is explicitly disabled.");
  }
  same(request.p_organization_id, context.organizationId, "company");
  uuid(request.p_invoice_id, "invoice");
  revision(request.p_expected_revision);
  if (!/^[0-9a-f]{64}$/.test(request.p_fingerprint) ||
      typeof request.p_intent_key !== "string" || !request.p_intent_key.trim() ||
      request.p_intent_key !== request.p_intent_key.trim() ||
      request.p_intent_key.length > 100) {
    throw new Error("Invalid immutable issuance fingerprint or intent key.");
  }
  const before = await loadIsolatedSalesInvoice(context, request.p_invoice_id);
  if (before.state !== "approved" || before.created_by === before.approved_by ||
      before.fingerprint !== request.p_fingerprint ||
      before.revision !== request.p_expected_revision) {
    throw new Error("Invoice is not independently approved with matching source revision.");
  }
  const raw = await mutation(context, "issue_aqvora_sales_invoice", { ...request });
  const receipt = object(raw, "durable sales issuance receipt");
  same(receipt.organization_id, context.organizationId, "issue company");
  same(receipt.invoice_id, before.id, "issue invoice");
  same(receipt.intent_key, request.p_intent_key, "issue intent");
  same(receipt.fingerprint, before.fingerprint, "issue fingerprint");
  same(receipt.source_revision, before.revision, "approved revision");
  same(receipt.face_minor, before.face_minor, "issue face");
  uuid(receipt.journal_id, "posted journal");
  const invoice = await loadIsolatedSalesInvoice(context, before.id);
  if (invoice.state !== "issued" || invoice.journal_id !== receipt.journal_id ||
      invoice.document_number !== receipt.document_number) {
    throw new Error("Issued invoice source could not confirm durable journal receipt.");
  }
  return {receipt: raw as SalesIssueReceipt, invoice};
}

export type SalesIssueRecovery =
  | {status: "unresolved"; safeToChangeIntent: false}
  | {status: "found"; receipt: SalesIssueReceipt; invoice: SalesInvoice};

export async function lookupIsolatedSalesIssue(
  context: IsolatedReceivablesContext, originalIntent: string,
): Promise<SalesIssueRecovery> {
  if (typeof originalIntent !== "string" || !originalIntent.trim() ||
      originalIntent !== originalIntent.trim() || originalIntent.length > 100) {
    throw new Error("Invalid original issue intent.");
  }
  const raw = await requestIsolatedReceivablesRpc(context,"lookup_aqvora_sales_issue",{
    p_organization_id: context.organizationId, p_intent_key: originalIntent,
  });
  if (raw === null) return {status: "unresolved", safeToChangeIntent: false};
  const receipt = object(raw,"original issuance");
  same(receipt.organization_id, context.organizationId, "lookup company");
  same(receipt.intent_key, originalIntent, "lookup intent");
  const invoiceId = uuid(receipt.invoice_id, "recovered invoice");
  const invoice = await loadIsolatedSalesInvoice(context, invoiceId);
  if (invoice.state !== "issued" || !invoice.issue_receipt) {
    throw new Error("Recovered issue has no verified posted invoice.");
  }
  for (const [key, value] of Object.entries(invoice.issue_receipt)) {
    same(receipt[key], value, "recovered " + key);
  }
  return {status: "found", receipt: raw as SalesIssueReceipt, invoice};
}
