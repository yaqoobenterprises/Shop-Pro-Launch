import {validateCurrencyUnitPolicy} from "./currencyReportEvidence";
import type { CashCollection } from "./receiptContracts";
import {
  date, money, object, uuid, validateContext, type ReceivableReadContext,
} from "./receiptReadPrimitives";

/**
 * A source can be manually two-person attested without being bank-verified.
 * Only the authenticated database RPC can certify the underlying audit.
 */
export interface VerifiedCashEvidence {
  collection: CashCollection;
  attestation: "unconfirmed" | "dual_control";
  bankVerified: false;
  linkedPostedReceiptId: string | null;
}

const HASH = /^[0-9a-f]{64}$/;
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}
function fingerprint(value: unknown, label: string): void {
  if (!HASH.test(text(value, label))) {
    throw new Error(`Invalid ${label} fingerprint.`);
  }
}

export function verifyControlledCashCollection(
  input: unknown,
  context: ReceivableReadContext & { collectionId: string },
): VerifiedCashEvidence {
  validateContext(context);
  uuid(context.collectionId, "cash collection");
  const cash = object(input, "cash collection");
  if (cash.organization_id !== context.organizationId ||
      cash.id !== context.collectionId ||
      cash.currency !== context.currency ||
      context.customerId !== undefined && cash.customer_id !== context.customerId ||
      cash.source_kind !== "controlled_cash") {
    throw new Error("Foreign or unsupported AQVORA cash collection source.");
  }
  uuid(cash.customer_id, "cash customer");
  uuid(cash.created_by, "cash maker");
  text(cash.creation_intent, "cash creation intent");
  if (!/^CC-[1-9][0-9]*$/.test(String(cash.collection_number))) {
    throw new Error("Invalid cash collection number.");
  }
  fingerprint(cash.maker_session_fingerprint, "cash maker session");
  text(cash.created_at, "cash creation time");
  const cashDate = date(cash.business_date, "cash business");
  if (cashDate > context.asOfDate) {
    throw new Error("Cash source falls after the requested cutoff.");
  }
  if(cash.currency_policy!=null){
    validateCurrencyUnitPolicy(cash.currency_policy,{
      organizationId:context.organizationId,currency:context.currency,
      asOfDate:cashDate,
    });
  }
  const amount = money(cash.amount_minor, "cash amount", true);
  if (amount <= 0n) throw new Error("Cash collection amount must be positive.");
  const revision = money(cash.revision, "cash revision");
  if (!["draft","confirmed","cancelled"].includes(String(cash.state))) {
    throw new Error("Invalid controlled-cash lifecycle state.");
  }

  const postedId = cash.posted_receipt_id;
  if (cash.state !== "confirmed") {
    if (revision < 1n || revision > 2n || cash.confirmed_by !== null ||
        cash.confirmed_at !== null || cash.checker_session_fingerprint !== null ||
        cash.fingerprint !== null || cash.evidence_method !== "unconfirmed_claim" ||
        postedId !== null && postedId !== undefined) {
      throw new Error("Unconfirmed cash cannot claim confirmed or posted evidence.");
    }
    return {
      collection: cash as unknown as CashCollection,
      attestation: "unconfirmed", bankVerified: false,
      linkedPostedReceiptId: null,
    };
  }
  if (revision !== 2n || cash.evidence_method !== "dual_control_cash_attestation" ||
      cash.confirmed_by === cash.created_by) {
    throw new Error("Controlled cash requires distinct two-person confirmation.");
  }
  uuid(cash.confirmed_by, "cash checker");
  fingerprint(cash.checker_session_fingerprint, "cash checker session");
  fingerprint(cash.fingerprint, "cash source");
  text(cash.confirmed_at, "cash confirmation timestamp");
  const customer = object(cash.customer_snapshot, "verified cash customer");
  const policy = object(cash.policy_snapshot, "verified cash policy");
  if (customer.id !== cash.customer_id ||
      policy.currency !== context.currency ||
      policy.source_kind !== "controlled_cash") {
    throw new Error("Confirmed cash policy or customer snapshot is inconsistent.");
  }
  if (postedId !== null && postedId !== undefined) {
    uuid(postedId, "linked posted customer receipt");
  }
  return {
    collection: cash as unknown as CashCollection,
    attestation: "dual_control", bankVerified: false,
    linkedPostedReceiptId: (postedId as string | null | undefined) ?? null,
  };
}
