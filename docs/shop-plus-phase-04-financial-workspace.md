# Shop Plus — Phase 04: financial workspace (2026-11-27)

## Decisions and implemented changes

### Overview
- Compact neutral cards, current account balance explicitly separated from selected-period income, expenses and operating result.
- Cloud-account overview uses existing authoritative read policy, active posted records and existing reportAnalytics totals/category reducers; pending local drafts/queued entries excluded from these cloud results. No migration or changes to ledger posting or calculation semantics. Local/demo views remain available and clearly qualified. A cloud read failure is unavailable, not a local zero.
- Revenue category breakdown (top five recorded income categories), category-total mismatch notices, compact empty states, straight-line chart paths without decorative gradients. Current totals do not imply accrual profit.
- Stale data requests invalidated on cleanup; no fabricated comparisons or trends. Recent transactions, verified previous-period comparisons, and separating account-read errors from period-read errors remain follow-up work.

### Cashbook
- Composer now precedes recorded activity in DOM and visual layout. Compact summary, neutral surfaces, explicit review instructions, no automatic input focus on mere navigation; New entry requests focus.
- Loading and failed activity states distinct from a confirmed empty day. Existing day summary includes locally queued records; the UI qualifies completeness and does not present it as a verified account balance.
- Existing deterministic parser, explicit review, numeric input mode, posting service and draft workflow preserved. IME composition is not submitted by Enter; category chips disabled during review submission. Synchronous submit locks for confirmation and pending draft assignment; preserve review field edits when accounts/categories refresh. Queued result is a warning, not a posted success. Demo void/restore/edit affordances disabled.
- Existing service retains draft before posting and handles retry by draft ID. The current review UI still needs a dedicated end-to-end lost-acknowledgment/partial-batch retry audit; no claim that every possible duplicate posting failure has been resolved. Standard entry mode feature flag retained.

### Transactions
- Compact responsive records, no decorative initials, unknown account is not silently labeled Cash; explicit type/category/status/account/business-date filters and description-only search (matching the existing service query). Invalid date range rejected. Search applies explicitly on submit; reset clears all fields. 25-row server pagination retained.
- accountId predicate applied before pagination in primary cloud, fallback cloud and local queue queries. List and all-filtered CSV use same filter object and strict cloud-read option for cloud accounts, excluding unconfirmed local data. Demo/local scope explicitly labeled. Export blocked while loading, invalid, stale typed search, or failed. Synchronous export lock. No historical records reclassified.
- In-memory filter/page state scoped to user and organization; no search text persisted to storage or URL. Transaction detail remains in overlay, preserving list context. Stale read results ignored, out-of-range page corrected. Void affordance gated using existing permission and demo mode; authoritative service still owns mutation. Existing role policies and database unchanged.
- Date sorting, amount filter, inactive historical account discovery, native semantic table conversion and explicit audit-history details are not fully implemented; existing transaction detail remains available. Internal transfer records remain in existing Accounts/ledger contract rather than inventing a new transaction type.

### Navigation regression
- Move phone More dialog to document.body portal, outside the transformed/fixed mobile dock. Updated browser locator to find the portal dialog. This is a fix for the failed Phase 03 mobile checks; verification pending.

## Verification
- Previous Phase 03 CI: 383 passing tests, 62 files, build and lint passed. Desktop/tablet browser navigation passed, mobile More failed.
- Added tests for cloud-only Overview reads and errors, account filter in both cloud paths and offline pagination/export, Cashbook loading/unavailable state and explicit composer focus.
- Browser workflow now also exercises matching description search, restoring filters after navigation, invalid date range and export disabling, resetting filters, and opening/canceling a cashbook review without posting. Both themes, eight widths, isolated demo only, external requests blocked.
- Final CI and browser results pending at time of writing. Manual accessibility, screen-reader, visual comparison, performance and live authorization gates remain. No production deployment or financial data modification.

## Phase 04 verification follow-up

[Browser run 45956775193](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45956775193) built successfully in both themes and recorded eight passing navigation interactions per theme, including the repaired phone More dialog. The financial interaction check reached the review-dialog stage but timed out at all widths; the locator excluded the valid `Clarify transaction` heading. The test selector was expanded in Phase 05; a fresh passing result is required. CI 45956775655 passed both type checks and lint but failed existing file-size limits; Phase 05 extracted account-filter tests and reduced ConfirmationModal length without changing limits. CI 45957461664 subsequently passed type checks, lint and file-size checks. Full regression and current browser runs remain outstanding.
