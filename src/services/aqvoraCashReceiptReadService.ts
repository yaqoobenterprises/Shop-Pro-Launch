/**
 * Durable, source-backed cash evidence and customer receipt READS only.
 * This service cannot confirm cash, approve a receipt or post journals.
 */
import type { CustomerReceipt } from "../accounting/receiptContracts";
import {
  verifyControlledCashCollection, type VerifiedCashEvidence,
} from "../accounting/verifiedCashCollection";
import { verifyCustomerReceiptDetail } from "../accounting/verifiedCustomerReceipt";
import { object, uuid } from "../accounting/receiptReadPrimitives";
import {
  requestIsolatedReceivablesRpc, type IsolatedReceivablesContext,
} from "./aqvoraReceivablesStagingGate";

export interface VerifiedReceiptDetails {
  receipt: CustomerReceipt;
  cash: VerifiedCashEvidence;
  bankVerified: false;
}

export async function loadIsolatedCashCollection(
  context: IsolatedReceivablesContext,
  collectionId: string,
): Promise<VerifiedCashEvidence> {
  uuid(collectionId, "cash collection");
  const raw = await requestIsolatedReceivablesRpc(
    context, "get_aqvora_cash_collection", {
      p_organization_id: context.organizationId,
      p_collection_id: collectionId,
    },
  );
  return verifyControlledCashCollection(raw, { ...context, collectionId });
}

/** Always independently re-read the underlying controlled-cash evidence. */
export async function loadIsolatedCustomerReceipt(
  context: IsolatedReceivablesContext,
  receiptId: string,
): Promise<VerifiedReceiptDetails> {
  uuid(receiptId, "customer receipt");
  const raw = await requestIsolatedReceivablesRpc(
    context, "get_aqvora_customer_receipt", {
      p_organization_id: context.organizationId,
      p_receipt_id: receiptId,
    },
  );
  const receipt = verifyCustomerReceiptDetail(raw, { ...context, receiptId });
  const cash = await loadIsolatedCashCollection(context, receipt.collection_id);
  if (cash.attestation !== "dual_control" ||
      cash.collection.fingerprint !== receipt.collection_fingerprint ||
      cash.collection.customer_id !== receipt.customer_id ||
      cash.collection.amount_minor !== receipt.amount_minor ||
      cash.collection.business_date !== receipt.business_date ||
      cash.collection.created_by !== receipt.created_by ||
      (receipt.state === "posted" && cash.linkedPostedReceiptId !== receipt.id)) {
    throw new Error("Receipt and original cash evidence do not reconcile.");
  }
  return { receipt, cash, bankVerified: false };
}

export type ReceiptIssueRecovery =
  | { status:"not_found"; safeToCreateNewIntent:false }
  | { status:"found"; original: VerifiedReceiptDetails };

/** Lost ACK lookup never authorizes a second posting with a new intent. */
export async function lookupIsolatedCustomerReceiptIssue(
  context: IsolatedReceivablesContext,
  intentKey: string,
): Promise<ReceiptIssueRecovery> {
  if (typeof intentKey !== "string" || !intentKey.trim() ||
      intentKey !== intentKey.trim() || intentKey.length > 100) {
    throw new Error("Invalid original receipt posting intent.");
  }
  const raw = await requestIsolatedReceivablesRpc(
    context, "lookup_aqvora_customer_receipt_issue", {
      p_organization_id: context.organizationId,
      p_intent_key: intentKey,
    },
  );
  if (raw === null) {
    return { status: "not_found", safeToCreateNewIntent: false };
  }
  const issue = object(raw, "durable receipt issue");
  if (issue.organization_id !== context.organizationId ||
      issue.intent_key !== intentKey) {
    throw new Error("Foreign or mismatched receipt posting intent.");
  }
  const receiptId = uuid(issue.receipt_id, "recovered receipt");
  const original = await loadIsolatedCustomerReceipt(context, receiptId);
  if (original.receipt.state !== "posted" || !original.receipt.issue_receipt) {
    throw new Error("Recovered issue has no certified posted receipt.");
  }
  const certified = original.receipt.issue_receipt as unknown as Record<string,unknown>;
  for (const key of [
    "organization_id","receipt_id","collection_id","source_ref","receipt_number",
    "intent_key","journal_id","journal_intent_key","customer_id","business_date",
    "currency","amount_minor","source_revision","posted_revision","fingerprint",
    "posted_by","posted_at","evidence_method",
  ]) {
    if (issue[key] !== certified[key]) {
      throw new Error("Recovered receipt issue disagrees with immutable source.");
    }
  }
  const left = issue.allocations;
  const right = certified.allocations;
  if (!Array.isArray(left) || !Array.isArray(right) ||
      left.length !== right.length) {
    throw new Error("Recovered allocation receipt list is incomplete.");
  }
  for (let index=0; index<left.length; index++) {
    const a=object(left[index],"recovered allocation");
    const b=object(right[index],"certified allocation");
    for(const key of ["allocation_id","invoice_id","amount_minor","journal_id","line_no"]) {
      if (a[key] !== b[key]) {
        throw new Error("Recovered receipt allocations disagree with source.");
      }
    }
  }
  return {status:"found",original};
}
