# AQVORA — owner-authorized fresh manual Journal Entry (isolated staging)

**Founder direction (2026-11-21):** AQVORA is a fresh, multi-company ERP with ZERO opening journals and ZERO balances. Old Shop Pro Cashbook CSV is privately exported and NOT imported for launch. Any later entries must be individually documented and authorized.

**Branch:** Child of Draft #97 (owner CoA/fiscal setup) → #96 (zero-start/P&L tests) → #87 (integrated V2). Does not include deferred historic import Drafts #90–#95. **Not a production release.**

## Real supported staging workflow

1. The new **Journal posting** sidebar route `aqvora-manual-journal` is visible **ONLY to real logged-in OWNER** when `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`, `VITE_ENABLE_AQVORA_VERIFIED_REPORT_READS=true`, `VITE_ENABLE_AQVORA_STAGING_MANUAL_JOURNALS=true` and the existing strict isolated project ref gate passes. Known original business Supabase projects cannot pass the inherited ref guard.
2. It reads the active company-only PostgreSQL `list_aqvora_accounts` and `list_aqvora_periods` RPCs through authenticated current session checks. Only active/posting records are available. Generic manual entries **exclude verified-source control accounts** (receivable, payable, inventory, tax). Cash is a bookkeeping account, not bank-clearing evidence.
3. The OWNER chooses a business date and 2–100 posting lines and enters **exact integer currency minor units** (no guessed PKR/FX scale). UI validates one positive debit OR credit per line, canonical amount, int64 bound, and **Dr=Cr**. A positive balance is NOT approval: the server remains authoritative for all journal rules.
4. The OWNER explicitly confirms supporting evidence before pressing **Post verified journal**. The browser must durably reserve exactly ONE random UUID `intent_key` plus unchanged source company, actor, date, currency and lines **in sessionStorage BEFORE making the network call**. A second intent is rejected while this one is unresolved.
5. `src/services/aqvoraManualJournalService.ts` rechecks the exact stored request and the current authorized account/period source, then calls existing audited `post_aqvora_journal` PostgreSQL RPC. The server enforces AAL2 MFA, live auth.sessions, OWNER/MANAGER active membership, company-scoped source accounts, period open state, atomically balanced journal and immutable receipt. This client limits mutation to OWNER; it does **not** activate the writer or write into raw tables.
6. The service independently calls `lookup_aqvora_receipt` for the SAME intent and compares journal ID, actor, company, amount and timestamps. The tab clears pending state **only after a verified original receipt**. An HTTP timeout/lost acknowledgement **does not mean SQL rollback**: keep original request locked and show **Recover original receipt**. If lookup returns no receipt, do not create a new key or auto-retry.
7. The UI displays verified journal ID, exact major/unknown minor money with explicit bank caveat. It cannot turn missing reports, invalid permissions or corrupted storage into a fake successful entry.

## Explicitly excluded

- This is a **staging-only user interface on top of an already separately enrolled, explicitly approved new-company V2 financial writer**. It does not provide company activation, and without that the server refuses posting. No production database has V2 schema.
- These generic journals are for explicitly documented normal financial events. AR/AP, customer receipt, inventory, stock costing, taxes and bank reconciliation **must use separately verified source workflows**; they are not supported by free-text bypass.
- Zero-start opening capital must be a **real, proven owner contribution**; no silent opening capital/AR/AP/inventory/bank seed. The current stage accepts exact minor-unit input only, not final international localized money entry UX. No statutory audit/tax/IFRS 18 claim.
- SessionStorage is a **tab-local original-intent hold**, NOT offline/PWA queued posting. Users must not post financial entries while offline. A corrupted store fails closed; administrators need an authenticated reconciliation path.
- Full maker/checker enforcement and activation policy, invoice/AP/inventory/payroll, hosted real staging Auth/MFA E2E, independent backup/restore, mobile PWA tests and production release are outstanding.

## Test coverage

- `tests/aqvora_pending_manual_journal.test.ts` tests exact balance, int64 guard, original-key durability, changed/invalid/corrupt intent, denial of duplicated intent, tenant isolation.
- `tests/aqvora_manual_journal_service.test.ts` tests guarded session/role, source-controlled account filtering, open-period preflight, original RPC payload, separate posted receipt lookup, missing/altered receipt fail-closed, lost-ACK same-key recovery and no automatic retry.
- `tests/aqvora_manual_journal_ui.test.tsx` tests actual interactive form, balanced voucher confirmation, posting button, returned server receipt, timeout locked state, recovery, corrupt storage, non-owner exclusion.
- Parent #96 already exercises **real V2 server SQL** via ephemeral PostgreSQL, including seven balanced synthetic journals, MFA, receipts, cross-company and imbalance rejection; child service/UX tests use **mocked Supabase transport**. Hosted E2E is NOT proven.

**Operational status:** Review-only until exact head CI, independent Codex backend posting/activation review and founder-approved isolated hosted staging. No release to main, no production Supabase migrations, no real finance writer activated, no paid services, no automatic historical data migration.

Tracked in https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89.
