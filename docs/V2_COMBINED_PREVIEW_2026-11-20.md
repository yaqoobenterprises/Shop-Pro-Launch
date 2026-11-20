# Shop Pro V2 combined review preview (20 November 2026)

**REVIEW-ONLY BRANCH — DO NOT MERGE OR DEPLOY AS PRODUCTION.**

## Included for integration testing

- #26 plus #30: canonical company roles, MFA draft-post checks, payment-account write restrictions.
- #31: legacy balance snapshot quarantine (not reconciliation).
- #23 plus #29: safe draft acknowledgement retry and offline receipt replay.
- #25: Quick Expense verified cashbook posting.
- #27: cloud signup and membership cache safety checks.
- #28: feature-gated company setup wizard.
- #24: proposed accounting architecture and rollout documents.

#18 LedgerMate and the overlapping #8/#9 implementations are deliberately excluded. No full journal engine or AQVORA redesign exists in this branch.

## Isolation and preview

This branch **forcibly returns empty Supabase configuration** in `src/lib/supabase.ts`, regardless of inherited Vercel environment settings. It must never be merged as an application release. Vercel preview variables are separately scoped to `preview/shop-pro-v2-combined-20261120`: onboarding flag true, Supabase URL/key nonfunctional placeholders. No independent Supabase staging database exists.

Visitors may use the landing page's **Try Demo** flow to enter a synthetic local workspace. The company setup modal opens once in demo and can be reopened using **Company setup** in the demo top bar. Any entered company metadata is local browser test data; do not submit real business/financial entries in this review environment.

A Vercel READY build does not prove real Supabase Auth/RLS/MFA/database compatibility. All production migrations and customer data remain untouched.

## Before real release

1. Obtain an isolated Supabase test project and rehearse the exact deployed migration order with real Auth, MFA and multi-tenant permissions.
2. Reconcile pending account balance sync, historical movements, IndexedDB durability, report scope, backup/restore and old-client fencing.
3. Resolve PR dependencies and #18 service conflicts; choose approved accounting B1–B10 architecture decisions.
4. Remove all preview-only code and env flags from any release PR.
5. Run complete CI, backend migration and mobile/browser checks separately, then approve production migration and deployment.
