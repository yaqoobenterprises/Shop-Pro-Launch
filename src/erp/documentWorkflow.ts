import type { OperationalDocumentKind } from "./operationalDocuments";

/**
 * Document workflow guards. Pure advisory domain logic, not server authority:
 * caller-supplied actor roles, policies, fingerprints and journal receipt IDs
 * MUST be independently verified by a company-scoped authorized SQL action.
 */
export type OperationalActorRole =
  | "owner" | "manager" | "accountant"
  | "sales" | "purchasing" | "cashier" | "viewer";

export type OperationalDocumentState =
  | "draft" | "submitted" | "approved" | "issued" | "cancelled";

export interface DocumentWorkflowRecord {
  organizationId: string;
  documentId: string;
  kind: OperationalDocumentKind;
  currency: string;
  partyId: string;
  state: OperationalDocumentState;
  /** Server-assigned optimistic-concurrency revision; positive safe integer. */
  revision: number;
  /** Opaque server-calculated identity of immutable financial line contents. */
  financialFingerprint: string;
  submittedBy?: string;
  approvedBy?: string;
  approvedFingerprint?: string;
  postedJournalId?: string;
  postingReceiptId?: string;
}

interface ActionBase {
  organizationId: string;
  actorId: string;
  actorRole: OperationalActorRole;
  expectedRevision: number;
}

export type DocumentWorkflowAction =
  | (ActionBase & { type: "edit"; financialFingerprint: string })
  | (ActionBase & { type: "submit" })
  | (ActionBase & { type: "approve" })
  | (ActionBase & { type: "reject" })
  | (ActionBase & { type: "issue"; postedJournalId: string; postingReceiptId: string })
  | (ActionBase & { type: "cancel" });

/** In production derive from a trusted company policy, never browser input. */
export interface DocumentApprovalPolicy {
  requireDistinctApprover: boolean;
  allowOwnerSelfApproval: boolean;
}

function required(id: string | undefined, label: string): void {
  if (typeof id !== "string" || !id.trim() || id.trim() !== id) {
    throw new Error(`${label} requires a canonical nonempty identifier.`);
  }
}

function canDraft(kind: OperationalDocumentKind, role: OperationalActorRole): boolean {
  return role === "owner" || role === "manager" || role === "accountant" ||
    (kind === "sales_invoice" && role === "sales") ||
    (kind === "purchase_bill" && role === "purchasing");
}
const canApprove = (role: OperationalActorRole): boolean =>
  role === "owner" || role === "manager";
const canIssue = (role: OperationalActorRole): boolean =>
  role === "owner" || role === "manager" || role === "accountant";

function assertRecord(record: DocumentWorkflowRecord): void {
  required(record.organizationId, "Document company");
  required(record.documentId, "Document ID");
  required(record.partyId, "Document party");
  required(record.financialFingerprint, "Financial fingerprint");
  if (record.kind !== "sales_invoice" && record.kind !== "purchase_bill") {
    throw new Error("Unknown source-document kind.");
  }
  if (!/^[A-Z]{3}$/.test(record.currency)) {
    throw new Error("Invalid source-document currency.");
  }
  if (!Number.isSafeInteger(record.revision) || record.revision < 1 ||
      record.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid source-document revision.");
  }
  const states: OperationalDocumentState[] =
    ["draft", "submitted", "approved", "issued", "cancelled"];
  if (!states.includes(record.state)) throw new Error("Invalid document workflow state.");
  const hasPosting = Boolean(record.postedJournalId || record.postingReceiptId);
  if (record.state === "issued") {
    required(record.postedJournalId, "Journal receipt source");
    required(record.postingReceiptId, "Posting receipt");
  } else if (hasPosting) {
    throw new Error("Unissued document cannot claim a posted financial receipt.");
  }
  if (record.state === "submitted" || record.state === "approved" ||
      record.state === "issued") {
    required(record.submittedBy, "Original submitter");
  }
  if (record.state === "approved" || record.state === "issued") {
    required(record.approvedBy, "Approving actor");
    if (record.approvedFingerprint !== record.financialFingerprint) {
      throw new Error("Approval is stale relative to document financial content.");
    }
  }
}

/** Deterministic proposed transition, with no persistence or posting. */
export function previewDocumentTransition(
  record: DocumentWorkflowRecord,
  action: DocumentWorkflowAction,
  policy: DocumentApprovalPolicy,
): DocumentWorkflowRecord {
  assertRecord(record);
  required(action.organizationId, "Action company");
  required(action.actorId, "Acting user");
  if (action.organizationId !== record.organizationId) {
    throw new Error("Cross-company document action denied.");
  }
  if (action.expectedRevision !== record.revision) {
    throw new Error("Stale document revision; reload before retrying.");
  }
  if (record.state === "issued" || record.state === "cancelled") {
    throw new Error("Issued or cancelled documents are immutable; use a linked correction.");
  }
  const next = { ...record, revision: record.revision + 1 };
  switch (action.type) {
    case "edit":
      if (record.state !== "draft" || !canDraft(record.kind, action.actorRole)) {
        throw new Error("Only authorized draft editors may edit financial content.");
      }
      required(action.financialFingerprint, "Updated financial fingerprint");
      if (action.financialFingerprint === record.financialFingerprint) {
        throw new Error("No financial revision change was supplied.");
      }
      return { ...next, financialFingerprint: action.financialFingerprint };
    case "submit":
      if (record.state !== "draft" || !canDraft(record.kind, action.actorRole)) {
        throw new Error("Document submission requires draft state and role.");
      }
      return { ...next, state: "submitted", submittedBy: action.actorId };
    case "approve":
      if (record.state !== "submitted" || !canApprove(action.actorRole)) {
        throw new Error("Document approval requires submitted state and approver role.");
      }
      if (policy.requireDistinctApprover &&
          record.submittedBy === action.actorId &&
          !(policy.allowOwnerSelfApproval && action.actorRole === "owner")) {
        throw new Error("Maker-checker separation requires another approver.");
      }
      return { ...next, state: "approved", approvedBy: action.actorId,
        approvedFingerprint: record.financialFingerprint };
    case "reject":
      if (record.state !== "submitted" || !canApprove(action.actorRole)) {
        throw new Error("Only approvers can reject a submitted document.");
      }
      return { ...next, state: "draft", submittedBy: undefined,
        approvedBy: undefined, approvedFingerprint: undefined };
    case "issue":
      if (record.state !== "approved" || !canIssue(action.actorRole)) {
        throw new Error("Issuance requires approved state and an issuing role.");
      }
      required(action.postedJournalId, "Verified posted journal");
      required(action.postingReceiptId, "Verified posting receipt");
      return { ...next, state: "issued", postedJournalId: action.postedJournalId,
        postingReceiptId: action.postingReceiptId };
    case "cancel":
      if (!canApprove(action.actorRole)) {
        throw new Error("Cancellation requires a manager or owner.");
      }
      return { ...next, state: "cancelled" };
    default:
      throw new Error("Unsupported source-document transition.");
  }
}
