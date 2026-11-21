# AQVORA — Isolated Customer Receipt Draft and Approval Workspace
**Status:** NEW code-only Draft stacked directly on [cash collection Draft #74](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/74), which is based on invoice lifecycle Draft #71 and the verified V2 receipt backend #63. Writer remains default-OFF. No production, existing business cloud projects, migrations, paid staging, main merge, or hosted E2E were touched.

## Supported user journey (no financial posting in this PR)
1. Original cash maker creates a **controlled-cash claim** in #74. A **different OWNER** must attest to the exact count in person using the server RPC. This is **manual evidence, never bank clearing**.
2. Original cash maker opens **Customer receipts**, supplies the confirmed collection UUID and requests **the complete V2 open-invoice source** at the cash business date. Source is tenant/user/currency/snapshot validated and incomplete or changing pages are refused.
3. Choose 1–99 distinct issued invoices for **the same company, customer, currency and cutoff**. Exact positive signed BIGINT allocations must equal the entire confirmed cash amount and not exceed any invoice's source-verified outstanding. No overpayment, empty payment, partial instrument, legacy balance, stock, tax, FX, refunds, bank deposits or unapplied cash.
4. The creation RPC **`create_aqvora_customer_receipt_draft`** saves the original cash ID, exact allocations and a persisted per-company/per-actor original UUID intent. On lost acknowledgement, the interface permits only the **same original stored intent and allocation payload** to be reissued. Corrupt/denied session storage blocks unsafe creation.
5. The creator submits. A **different OWNER** loads the same receipt UUID on their own cloud session and approves it. Rejection to draft or cancellation requires an explicit reason. Every compare-and-swap `transition_aqvora_customer_receipt` action re-reads authoritative current revision/state first. After any uncertain response, the UI clears stale state, requires a fresh read and does **not** retry the transition.
6. After approval, the workflow stops. The receipt is **NOT posted**. No Cash/AR journal and no automatic paid/settled invoice or bank status is claimed. A separate future opt-in original-key posting/recovery slice must be reviewed after Issue #68 currency policy and Issue #72 staged acceptance.

## Code and contract
- `src/accounting/receiptDraftAllocations.ts`: exact, defensive source scope and full-allocation preparation; no JS floating money.
- `src/accounting/pendingReceiptDraft.ts`: original intent + entire frozen allocation source preserved in tab session storage; refuses conflicting new intent or altered recovery.
- `src/services/aqvoraReceiptDraftService.ts`: default-OFF authenticated PostgreSQL RPC adapter with live session checks before/after, independent source recertification and original actor/state/revision guards. The server remains the only authority.
- `src/components/accounting/CustomerReceiptDraftWorkspace.tsx` and `ReceiptAllocationForm.tsx`: dedicated responsive, keyboard-accessible, non-pretending finance workflow.
- Existing default-OFF `aqvora-receipt-drafts` lazy route and shared V2 staging finance navigation.

### Explicit OFF-by-default gate
All existing gates from #74 are mandatory, **plus**:
`VITE_ENABLE_AQVORA_STAGING_RECEIPT_DRAFTS=true`.

The following remain distinct:
- This frontend flag is **not** server permission.
- Company MUST already have a permitted synthetic staging policy and independent OWNER/checker sessions for any write.
- SQL #63's receipt posting RPC is **intentionally not wired** here.
- The known existing Supabase business project refs are denied by the shared staging gate.

## QA required
Unit: exact minor-unit allocation sum, duplicate/overdue/foreign/incomplete invoices, excess amounts, status, company, time cutoff, stable original creation key and storage corruption. CI: TypeScript strict/typecheck, lint, React/browser checks, PG17, local Auth/PostgREST and production build. Hosted isolated synthetic E2E, real multiple users, restore, source-to-GL/TB, currency precision (#68), opening/legacy queue reconciliation and founder signoff are **NOT completed** by this PR.

Do not close or merge ancestor Drafts #41→#74 independently. Reconcile the founder-approved UI sibling #50 only in a separate reviewed integration branch.
