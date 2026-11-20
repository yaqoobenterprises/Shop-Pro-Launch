# AQVORA multi-invoice receipt and supplier-payment audit (2026-11-20)

## Status and ownership

This document accompanies **Draft PR #53**, stacked on the independent Sales/Purchase domain **Draft PR #52**, ultimately based on the accounting read model (#38). This is the ChatGPT product/domain track. Codex works separately on Issue #51 / V2 GL+TB PostgreSQL reader based on backend Draft PR #44.

**Do not merge these sibling histories, enable financial posting, deploy migrations or change production Supabase.**

## Audit findings and fixes

| Severity | Finding in the pure source contract | Treatment in this PR | Server integration blocker |
| --- | --- | --- | --- |
| Critical | A receipt used across two invoices can be mistakenly treated as two separate receipts; per-invoice outstanding projection cannot prove a global payment cap. | Exact multi-document batch preview, one source instrument, one intended amount, unique allocations. | PostgreSQL must lock the actual payment source and every affected open item in stable order, enforcing an atomic instrument-level cap **across all invoices**. The browser cannot certify instrument validity. |
| Critical | A crash/lost response after saving only one of several allocations can make retry double-book money. | Reject partial-replay fixtures; accept only all-new or exact all-recorded previews. | One SQL transaction must atomically create the allocations, journal, audit and durable idempotent receipt. No partial database commits. |
| High | An allocation from another company, counterparty, currency or document kind could contaminate an open balance. | Reject mixed-company, counterparty, currency or Sales-vs-Purchase documents. | Use server-verified canonical membership and company-owned foreign keys; RLS is supplemental, not the sole authorization mechanism. |
| High | A reversal can be sequenced after a payment but given an earlier business date, corrupting as-of reports. | `projectOpenItem` now rejects reversal `businessDate` earlier than original event date, with regression test. | Server enforces fiscal locking/period visibility and stores both immutable posting time and business date. |
| High | Incomplete pages can be passed as zero or fully settled balances. | `projectOpenItem` requires `sourceComplete`; the batch preview validates *every* document stream. | `sourceComplete` is only trustworthy when issued by a verified server snapshot. Client-controlled boolean provides **no security**. |
| High | A user can assert any amount or external payment-source ID to the local preview. | Document and UI contract explicitly identify this as a dry-run. | A bank/cash instrument with authorized amount and no duplicate use must be verified **inside** the posting RPC. |
| Medium | One receipt may be split into multiple allocations for the same invoice with confusing idempotency provenance. | Disallow more than one allocation per invoice per batch; use stable length-safe tuple keys for distinct allocation intents/references. | Additional nuanced allocation operations require a separate reviewed API contract. |

## Implementation

- `src/erp/settlementBatch.ts`: pure `previewSettlementBatch` with strict positive canonical minor-unit amounts and exact `BigInt` sum, one receipt/vendor-payment instrument, one company/party/currency/document kind, uniquely identified allocations, complete posted document streams, per-document outstanding checks, and total replay semantics.
- `tests/aqvora_settlement_batch.test.ts`: multi-document happy paths and negative cases: wrong tenant, wrong party, mixed currency/kind, missing/incomplete source, overpayment, exact match, duplicates, replay collision, partial replay, dates and BIGINT max.
- `src/erp/openItems.ts` + existing regression test: reversal date protection.

No posted journal, SQL migration, payment, fiscal period or invoice table is added. No user-visible ERP module is being labeled complete.

## Future authorized SQL interface: required contract, NOT implemented

```text
post_receipt_allocations(
  p_organization_id,
  p_payment_source_id,
  p_intent_key,
  p_expected_source_revision,
  p_business_date,
  p_allocations[]
) → immutable posting receipt with ledger journal ID, source ID, final allocations
```

- The SQL function must resolve the active company from Auth/session, verify AAL2/role requirements based on existing platform policy, validate company/currency/party on every referenced invoice, fiscal open state, verified payment instrument and confirmed posted source journals.
- Lock the company/period/source/open-item rows consistently against concurrent modifications, sort all affected invoice IDs before obtaining locks; make debit/credit and AR/AP control-account mapping inside server-verified source routing.
- Persist exactly once with unique company+intent and robust payload identity; refuse changed-payload replay. If the client loses its response, retrieve original receipt before considering a retry.
- A payment instrument **must not** allocate more than its authorized unallocated balance even if its recipient invoices have sufficient outstanding amounts.
- Never use a JS/UI recomputation as the authoritative journal. RLS and RPC grants must deny direct table writes.
- Atomic rollback when any invoice fails, including with concurrent credit notes, period close, party deactivation or role revocation.
- Separate server-backed credit note and refund flow; a pure `payment_reversal` event alone is NOT an authorized bank refund.

## Must-have verification before real ERP activation

1. Local PostgreSQL concurrent sessions: same invoice receiving two payments, same source used for multiple invoices, different source IDs with same idempotency key, split batch partially invalid, lost ACK and replay.
2. Real isolated Supabase Auth/PostgREST fixtures: OWNER/MANAGER/CASHIER policy, AAL1/AAL2, session revocation, deactivation, cross-tenant IDs, unauthorized source.
3. End-to-end verified invoice → receivable control posting → receipt split → GL/TB → AR aging reconciliation with matching source IDs, currency, as-of date and immutable audit.
4. Bank/cash reconciliation, backup/restore, old-client and offline-queue safety and rollout approval.
5. Locale tax compliance, currency decimal scale and rounding policy require explicit regional configuration; this slice makes **no** tax or FX determination.

**Reference architecture:** `docs/AQVORA_SALES_PURCHASES_AR_AP_CONTRACT_2026-11-20.md` in PR #52 and `docs/aqvora-admin-api.md` in backend PR #44. Do not assume #51's future GL/TB RPC signatures until Codex publishes the tested contract.
