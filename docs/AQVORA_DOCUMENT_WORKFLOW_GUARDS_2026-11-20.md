# AQVORA — operational invoice/bill lifecycle guard and audit

**Scope:** pure business rules, Draft PR stacked on independent Sales/AR/Purchases/AP contract #52 and split-payment preview #54. This is a proposal for testable state transitions, **not** an authenticated document service or posting engine.

## Document states and permitted actions

| From | Action | To | Permitted local role | Further server checks still required |
| --- | --- | --- | --- | --- |
| `draft` | `edit` | `draft` (revision +1) | Owner, Manager, Accountant; Sales only for invoice, Purchasing only for bill | Verify actor's membership, actual financial lines/fingerprint and amendment history |
| `draft` | `submit` | `submitted` | Same creators | Server-issued immutable submission snapshot and source version |
| `submitted` | `approve` | `approved` | Owner or Manager | Maker-checker policy from trusted company configuration, approver revocation, policy state, fiscal eligibility |
| `submitted` | `reject` | `draft` | Owner or Manager | Record append-only rejection reason, actor and previous version |
| `approved` | `issue` | `issued` | Owner, Manager or Accountant | Atomic authorized verified-source journal + company receipt; **never trust supplied IDs** |
| `draft/submitted/approved` | `cancel` | `cancelled` | Owner or Manager | Append-only actor/reason and no concurrent issue |
| `issued` | any action | Rejected | None | Correct via linked credit note/reversal/refund, never edit/delete |
| `cancelled` | any action | Rejected | None | New document intent required |

The pure `previewDocumentTransition` returns a NEW document record. An expected revision mismatch fails closed; approval records an opaque financial fingerprint. Editing is only permitted in Draft state; financial fields cannot be changed under an existing approval. The state machine requires an explicit actor, canonical ID, company, role, source fingerprint and consistent approval/receipt fields. The maker-checker policy defaults to a required object and has an explicit Owner-self-approval exception configuration.

## Accounting/security boundaries

- The `actorRole` / `organizationId` / `financialFingerprint` / `DocumentApprovalPolicy` / `postedJournalId` / `postingReceiptId` supplied to these pure functions are **not authenticated**. UI checks may improve clarity but **must never grant server access**.
- A real issuing RPC must verify the approved document version under a row lock **in the same transaction** as the source-backed journal, receipt and immutable audit event. Direct table writes to posted books must remain blocked.
- Company policy, membership and MFA are server-only. A manager's role must be rechecked at commit time; authorization cannot rely on the cached role in this object.
- The presented `financialFingerprint` is deliberately opaque. A server must derive it from canonical company/currency/party/price/discount/tax/line data and compare it to the approved version. A browser cannot choose a trusted hash.
- `revision` increments are guidance for future SQL compare-and-swap. Two concurrent approvals cannot both succeed if expected revision is stale. SQL should use `UPDATE ... WHERE revision = expected` under company, period, source locks.
- The issue action is an acknowledgment of a **separately verified** posted receipt, not authorization to generate one; losing an ACK must cause server receipt lookup with idempotency key, not duplicate posting.
- Tax, account mapping, inventory availability, due dates, real issuance numbers, permissions, payments, refunds and true server audit are unimplemented.

## Critical future negative tests

1. Two approvers racing on the same revision; only one committed approved transition.
2. A cashier/vendor or company B tries to issue company A's sales invoice.
3. Document line edits after approval but before journal posting; fingerprint/revision mismatch must fail.
4. Fiscal close concurrently with issue; one wins, never partial commit.
5. Role demotion or session revocation during an authorization check.
6. Lost ACK after actual journal issue; receipt lookup returns identical immutable result.
7. Duplicate document number and source intent across parallel sessions.
8. Rejected/cancelled invoice must not have a posted journal or receivable.
9. Correct linked credit/return/credit-note flow after issuing, without rewriting voucher history.

**Release rule:** This is domain logic and tests only. Do not call it a live Sales/Purchases module. No production Supabase, schema, financial writer, demo fallback, or `main` merge is authorized. Keep styling paused per founder.
