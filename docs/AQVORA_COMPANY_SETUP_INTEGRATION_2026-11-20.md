# AQVORA: Onboarding user flow integration — 20 November 2026

**Draft review only. No merge or production database changes.**

## What changed
- Reused the existing actual PR #28 company setup implementation, validation, service and tests rather than recreating a mock wizard.
- Current AQVORA frontend chain: Landing (PR #34) → Authentication UX (PR #36) → explicit company setup (this PR) → Overview (PR #35).
- Kept owner-only server receipt checks and existing ledger-based currency/timezone lock: financial amounts are not created, reset, or converted by onboarding.
- Company wizard is **off by default**. The branch's private Vercel preview enables it with `VITE_ENABLE_COMPANY_SETUP_WIZARD=true` while using invalid Supabase preview URL/key.
- The demo workspace exposes **Preview company setup** in its top bar. The modal is closable **only in demo**, so testing never traps a user; a signed-in owner whose region is unconfigured must still complete setup.
- Added scoped pastel styling, clear disabled-currency explanation, reset-to-step-1 on reopening, and UI regression tests.
- Reduced Sign Up card spacing for shorter laptop displays while preserving 44px minimum touch targets and readable labeled fields.

## Scope/risk limitations
- This is **not complete verified cloud onboarding**: PR #27 cloud workspace identity boundary, PRs #26/#30 permission and MFA repairs, and isolated Supabase staging remain separate unmerged work. Do not claim real cloud signup works because CI and a Vercel sample preview are green.
- PR #28's company metadata writes are reused under a feature gate. Its client-side empty-ledger checks alone are not an atomic server-side currency/timezone lock. Production requires an approved transactional server policy.
- **No automatic opening balance** and no simulated journals are created.
- The demo uses local sample data. On the private preview, do **not** enter real credentials or customer data. Vercel READY is only a build status, not a verified browser walkthrough.
- No financial report, ledger, payroll or inventory implementation is represented as complete.

## Exact reviewer flow
1. Open the private preview landing.
2. Check Sign in / Create account appearance and Back to home. The credentials flow is intentionally not connected to live Supabase.
3. Use **Explore demo**.
4. From the demo bar choose **Preview company setup**.
5. In Company step, enter a name and optional business type; verify blank-name error.
6. In Location & currency, check disabled local currency/timezone with explanation; continue.
7. Review saved metadata and the explicit *no journal entries or opening balances* statement.
8. Save within demo or close safely; reopen and verify the wizard starts at Step 1.
9. Check desktop and mobile (360/390/768/1024/1440), light/dark and keyboard-only access.

## Work best delegated to Codex next
- Cross-PR financial architecture and SQL transaction writer, Chart of Accounts, immutable journal lines and fiscal period locks.
- Production-ready MFA + canonical tenant RBAC migration order, staging integration and rollback/rehearsal.
- Atomic server-side company currency/timezone lock with concurrency tests and explicit recovery.
- Legacy sync queue and financial account-balance reconciliation before security migration deployment.
- Finance report reconciliation, audited backups, IndexedDB durable acknowledgements.
These require deeper database integration, **not** visual-only frontend PRs.
