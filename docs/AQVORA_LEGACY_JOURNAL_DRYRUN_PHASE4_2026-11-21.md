# AQVORA — legacy source → double-entry dry-run proposals (Phase 4)

**2026-11-21. REVIEW ONLY. ZERO financial posting.** This is a child of PR #92 → #91 → #90 → #88. Track release coordination issue #89. The source project remains unchanged.

## What is implemented

Script: scripts/aqvora_legacy_journal_dry_run.mjs. Test suite: tests/aqvora_legacy_journal_dry_run.test.ts.

Input A: a private, all-seven-table, one-UUID historical source snapshot exported consistently through #92 (not the limited user CSV). Input B: an explicit private accounting-review policy that names the SAME source project + organization UUID, source snapshot SHA256 from #91, target ERP company UUID, PKR minor-unit exponent=2, unique source payment account → target CoA asset mappings, category/transaction treatment mappings, and approved-for-review fiscal period IDs.

The simulator FIRST runs the legacy account ledger reconciliation from #91 and fails if its sources disagree. It also rejects source fingerprint drift, wrong target/source identity, non-PKR, repeated target CoA cash account assignment, bad precision and unsupported input modes.

It produces PRIVATE, unposted, deterministic two-line journal review candidates with exact BigInt minor units:
- Legacy earned cash revenue: Dr mapped Cash/Bank; Cr explicitly mapped Revenue.
- Collection on behalf of others (e.g. ticket/stamp agency): Dr Cash/Bank; Cr explicitly mapped Liability, NOT gross sales.
- Customer advance: Dr Cash/Bank; Cr customer advance Liability until earned.
- Legacy expense: Dr mapped Expense; Cr Cash/Bank.
- Inventory acquisition: Dr explicitly mapped Inventory Asset; Cr Cash/Bank (policy/stock evidence required).
- Owner drawing: Dr Equity Drawings; Cr Cash/Bank, never falsely operating expense.
- Owner contribution: Dr Cash/Bank; Cr owner Equity, only with transaction-specific review mapping.
- Cash-to-bank transfer: Dr destination Cash/Bank, Cr source Cash/Bank (no P&L). Both source transfer legs were previously verified by the #91 reconciler.

The simulator refuses to silently classify investment or adjustment source types. It intentionally quarantines explicit pagination-test fixtures, historical voids and active records with edit/restore history; those remain fully preserved as source evidence for a future authorized, immutable reversal-chain implementation. Repeated same-signature transactions remain separate and must each be individually reviewed; there is NO auto-deduplication. Cloud drafts are excluded; device offline queues are NOT included in a cloud snapshot.

For each source payment account the review calculates total source activity, proposed cash activity and unconverted difference. It produces separate opening balances NOT POSTED, not an invented offsetting equity journal. Each candidate has source/project/org/revision hash + deterministic intent key, proposed fiscal period and balanced Dr/Cr amounts. The review total debits always equal total credits. **Even if all candidates balance, NO journal is approved or posted by this code.**

## Private review policy shape (illustrative, not approval)

    {
      "review_mode": "dry_run_only",
      "source_key": "source-business-a",
      "source_project_ref": "example-source-001",
      "source_organization_id": "<source UUID>",
      "target_company_id": "<target company UUID>",
      "currency": "PKR",
      "minor_unit_exponent": 2,
      "expected_source_sha256": "<full source digest from #91>",
      "payment_accounts": {
        "<source cash account UUID>": {
          "coa_account_id": "<target Cash asset CoA UUID>",
          "account_class": "ASSET"
        }
      },
      "categories": {
        "<source printing category UUID>": {
          "coa_account_id": "<target Printing Revenue CoA UUID>",
          "account_class": "REVENUE",
          "treatment": "earned_revenue"
        }
      },
      "periods": [{"period_id":"<fiscal UUID>","start":"2026-01-01","end":"2026-12-31"}],
      "duplicate_reviewed_source_ids": []
    }

This local JSON is an accounting-review input, NOT a signed authorization claim. An independent accountant/founder still has to validate classification, legal company ownership, period opening, evidence and bank/cash balances. Tenant ownership of target CoA accounts and maker/checker/AAL2 role enforcement must be implemented by the separate Codex staging/backend API, never trusted from this policy file.

## How to review privately

    node scripts/aqvora_legacy_journal_dry_run.mjs \
      --snapshot "/private/source-a.json" \
      --policy "/private/source-a-mapping.json" \
      --out "/private/source-a-unposted-review.json"

Output is exclusive-create 0600 outside the repository. STDOUT contains only aggregate counts, amount totals and the review status. Source UUID, transaction IDs, candidate journals and accounting mappings stay in private output, never GitHub CI attachments.

## Founder's current source-specific caveats

The 415-row private source CSV contains 395 active/20 voided transactions. Some current categories (ticket, stamp, agreements, Home, Etc) require economic substance review; ledger cash movement is NOT certified earned revenue. The other transaction-bearing source contains 1,000 explicit pagination-test fixtures: preserve as historical source evidence but do not count in earned revenue. Two other UUID partitions have no transactions, including one with an unverified PKR 70,000 opening balance. All four UUID scopes remain distinct until legal company mapping is signed.

## Gates for real V2 historical migration

1. Independently verified full consistent source snapshots and physical/point-in-time backup/restore; offline installed-PWA device queue backup/delta capture.
2. Documented source-to-target company UUID mapping, official bank/cash confirmation, CoA/period policy, unresolved duplicate and edited transaction reviewer decisions; preserve all source revision chains.
3. Authorized, tenant-checked, immutable, atomic, idempotent server migration receipt/API on isolated staging, not direct insertion into V2 journal tables and not client-side source state rewriting. Use separate actual reviewer for maker/checker until a specific audited single-owner policy is independently approved.
4. Staging traceability, rollback, retry/lost-ACK, replay and exact GL/TB reconciliation; hosted Auth/RLS/MFA, mobile/PWA offline QA and founder written rollout approval.

**Explicit non-goals:** No SQL migrations, no Supabase source modification, no V2 posting, no opening equity guesses, no test fixture deletion, no production deployment, no merge into main, no claim that preview balances are audited IFRS/GAAP statements.
