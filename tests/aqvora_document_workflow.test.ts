import { describe, expect, it } from "vitest";
import {
  previewDocumentTransition,
  type DocumentApprovalPolicy, type DocumentWorkflowAction,
  type DocumentWorkflowRecord,
} from "../src/erp/documentWorkflow";

const policy: DocumentApprovalPolicy = {
  requireDistinctApprover: true,
  allowOwnerSelfApproval: false,
};
const doc = (overrides: Partial<DocumentWorkflowRecord> = {}): DocumentWorkflowRecord => ({
  organizationId: "company-a",
  documentId: "invoice-a",
  kind: "sales_invoice",
  currency: "PKR",
  partyId: "customer-a",
  state: "draft",
  revision: 1,
  financialFingerprint: "hash-source-v1",
  ...overrides,
});
const action = (overrides: Partial<DocumentWorkflowAction> = {}): DocumentWorkflowAction => ({
  type: "submit",
  organizationId: "company-a",
  actorId: "salesperson-a",
  actorRole: "sales",
  expectedRevision: 1,
  ...overrides,
} as DocumentWorkflowAction);

const approved = (): DocumentWorkflowRecord => {
  const submitted = previewDocumentTransition(doc(), action(), policy);
  return previewDocumentTransition(submitted, action({
    type: "approve", expectedRevision: 2,
    actorId: "manager-b", actorRole: "manager",
  }), policy);
};

describe("AQVORA Sales/Purchase document workflow — advisory transition guards", () => {
  it("moves an invoice from draft to submitted to approved to issued with stable revisions", () => {
    const first = doc();
    const submitted = previewDocumentTransition(first, action(), policy);
    expect(submitted).toMatchObject({state: "submitted", revision: 2, submittedBy: "salesperson-a"});
    expect(first).toMatchObject({state: "draft", revision: 1});
    const approval = previewDocumentTransition(submitted, action({
      type: "approve", actorId: "manager-b", actorRole: "manager",
      expectedRevision: 2,
    }), policy);
    expect(approval).toMatchObject({
      state: "approved", revision: 3,
      approvedBy: "manager-b", approvedFingerprint: "hash-source-v1",
    });
    const issued = previewDocumentTransition(approval, action({
      type: "issue", actorId: "accountant-c", actorRole: "accountant",
      expectedRevision: 3, postedJournalId: "journal-200", postingReceiptId: "receipt-200",
    }), policy);
    expect(issued).toMatchObject({
      state: "issued", revision: 4, financialFingerprint: "hash-source-v1",
      postedJournalId: "journal-200", postingReceiptId: "receipt-200",
    });
    expect(() => previewDocumentTransition(issued, action({
      type: "edit", financialFingerprint: "tampered", actorRole: "owner", expectedRevision: 4,
    }), policy)).toThrow(/immutable/);
    expect(approval.postedJournalId).toBeUndefined();
  });

  it("enforces separation of maker and checker unless a trusted owner-policy exception is explicit", () => {
    const submitted = previewDocumentTransition(doc(), action(), policy);
    expect(() => previewDocumentTransition(submitted, action({
      type: "approve", actorId: "salesperson-a", actorRole: "manager", expectedRevision: 2,
    }), policy)).toThrow(/Maker-checker/);
    expect(previewDocumentTransition(submitted, action({
      type: "approve", actorId: "salesperson-a", actorRole: "owner", expectedRevision: 2,
    }), {...policy, allowOwnerSelfApproval: true}).state).toBe("approved");
  });

  it("blocks unauthorized sales and purchasing role crossover", () => {
    const purchase = doc({kind: "purchase_bill", partyId: "vendor-a"});
    expect(() => previewDocumentTransition(purchase, action(), policy)).toThrow(/submission/);
    expect(previewDocumentTransition(purchase, action({
      actorRole: "purchasing",
    }), policy).state).toBe("submitted");
    expect(() => previewDocumentTransition(doc(), action({
      actorRole: "purchasing",
    }), policy)).toThrow(/submission/);
    for (const actorRole of ["cashier", "viewer"] as const) {
      expect(() => previewDocumentTransition(doc(), action({actorRole}), policy)).toThrow(/submission/);
    }
  });

  it("cannot edit an already submitted or approved document's financial contents", () => {
    const submitted = previewDocumentTransition(doc(), action(), policy);
    expect(() => previewDocumentTransition(submitted, action({
      type: "edit", actorId: "owner-a", actorRole: "owner",
      financialFingerprint: "changed", expectedRevision: 2,
    }), policy)).toThrow(/Only authorized draft editors/);
    expect(() => previewDocumentTransition(approved(), action({
      type: "edit", financialFingerprint: "changed",
      actorRole: "owner", expectedRevision: 3,
    }), policy)).toThrow(/Only authorized draft editors/);
  });

  it("allows revised drafts but invalidates stale expected revisions", () => {
    const revised = previewDocumentTransition(doc(), action({
      type: "edit", financialFingerprint: "hash-source-v2", expectedRevision: 1,
    }), policy);
    expect(revised).toMatchObject({state: "draft", revision: 2, financialFingerprint: "hash-source-v2"});
    expect(() => previewDocumentTransition(revised, action(), policy))
      .toThrow(/Stale document revision/);
    expect(() => previewDocumentTransition(doc(), action({
      type: "edit", financialFingerprint: "hash-source-v1",
    }), policy)).toThrow(/No financial revision change/);
  });

  it("rejection returns submitted document to draft and clears all approval provenance", () => {
    const submitted = previewDocumentTransition(doc(), action(), policy);
    const rejected = previewDocumentTransition(submitted, action({
      type: "reject", actorId: "owner-b", actorRole: "owner", expectedRevision: 2,
    }), policy);
    expect(rejected).toMatchObject({state: "draft", revision: 3});
    expect(rejected.submittedBy).toBeUndefined();
    expect(rejected.approvedBy).toBeUndefined();
    expect(() => previewDocumentTransition(submitted, action({
      type: "reject", actorRole: "cashier", expectedRevision: 2,
    }), policy)).toThrow(/Only approvers/);
  });

  it("cancels an unissued approved document and never reopens it", () => {
    const cancelled = previewDocumentTransition(approved(), action({
      type: "cancel", actorId: "owner-b", actorRole: "owner", expectedRevision: 3,
    }), policy);
    expect(cancelled).toMatchObject({state: "cancelled", revision: 4});
    expect(() => previewDocumentTransition(cancelled, action({
      type: "submit", actorRole: "owner", expectedRevision: 4,
    }), policy)).toThrow(/immutable/);
  });

  it("blocks issuance without genuine-looking receipt identifiers or approval", () => {
    expect(() => previewDocumentTransition(doc(), action({
      type: "issue", postedJournalId: "journal", postingReceiptId: "receipt",
    }), policy)).toThrow(/Issuance requires approved/);
    expect(() => previewDocumentTransition(approved(), action({
      type: "issue", actorRole: "cashier", expectedRevision: 3,
      postedJournalId: "journal", postingReceiptId: "receipt",
    }), policy)).toThrow(/Issuance requires approved/);
    expect(() => previewDocumentTransition(approved(), action({
      type: "issue", actorRole: "manager", expectedRevision: 3,
      postedJournalId: " ", postingReceiptId: "receipt",
    }), policy)).toThrow(/Verified posted journal/);
  });

  it("rejects forged tenant, corrupt history and inconsistent approvals", () => {
    expect(() => previewDocumentTransition(doc(), action({
      organizationId: "company-b",
    }), policy)).toThrow(/Cross-company/);
    for (const changed of [
      {revision: Number.MAX_SAFE_INTEGER},
      {revision: 0},
      {financialFingerprint: ""},
      {state: "issued" as const},
      {state: "draft" as const, postedJournalId: "not-possible"},
      {state: "approved" as const, submittedBy: "a", approvedBy: "b",
        approvedFingerprint: "different-hash"},
    ]) expect(() => previewDocumentTransition(doc(changed), action(), policy)).toThrow();
  });

  it("prevents cancelled documents from issuing and forbidden roles from cancelling", () => {
    expect(() => previewDocumentTransition(doc(), action({
      type: "cancel", actorRole: "sales",
    }), policy)).toThrow(/manager or owner/);
    const cancelled = previewDocumentTransition(doc(), action({
      type: "cancel", actorRole: "manager",
    }), policy);
    expect(() => previewDocumentTransition(cancelled, action({
      type: "issue", actorRole: "manager",
      postedJournalId: "j", postingReceiptId: "r", expectedRevision: 2,
    }), policy)).toThrow(/immutable/);
  });
});
