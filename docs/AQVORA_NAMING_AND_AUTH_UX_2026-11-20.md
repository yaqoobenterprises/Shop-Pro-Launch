# AQVORA naming and account journey — 20 November 2026

**Private design review; not a product launch or legal clearance.**

## Naming system

| Concept | User-facing language | Implementation / qualification |
| --- | --- | --- |
| Product | AQVORA | Provisional until name/trademark clearance and finalized brand assets |
| Account | Account | Personal identity, not synonymous with company |
| Organization | Company | Industry-neutral; retailer, consultancy, workshop or service business |
| Signed-in area | Workspace | One company at a time, explicit switcher required later |
| Setup | Company setup | Company identity → region/currency/timezone → review |
| Daily cashbook | Cashbook | Do **not** claim it is a full General Ledger |
| Journal | Journal entries | Feature planned, not shipped |
| General Ledger | General Ledger | Canonical posted accounting ledger; distinct from legacy cashbook |
| Operating result | Cashbook operating result | Not an accrual P&L |
| Revenue/expenses | Income / Expenses | Explicit time period and data basis |
| Employee records | Employees | No automatic app access |
| App invitations | Team & access | Auth provider invitations, role demotion and session revocation, **no stored plaintext passwords** |

Remove “shop only” descriptions gradually as individual flows are migrated. Do not blindly rename tables, SQL policies, API field names, browser storage keys, events, URLs, Supabase objects or financial accounts; these require a signed-off backward-compatible migration. Keep `src/config/app.ts` legacy integration value until its uses are inventoried and brand clearance completed.

## Stage 02: account journey

- New `AuthFrame` branded entry for Sign In, Sign Up, password reset and email confirmation. 
- Desktop two-column frame / mobile compact form; navy/emerald symbol and lavender/white backdrop share the workspace's visual language.
- Persistent labels, accessible password controls, clear progress/error/success states and intentional action hierarchy. No placeholder replacing a field label, no walls of instructions.
- Existing `useAuth` logic retained: email/password, Google OAuth, email confirmation, recovery and cached-session reset.
- New explicit Back to home action on unauthenticated entry; no forced sign out.
- Auth credentials are not sent to new services by these presentation changes.
- CI regression cases test real UI-to-action calls through mocked auth provider, rather than fake “success” UX.

## Constraints before production

1. Review the **actual** auth/tenant boundary from Draft PR #27 and MFA/security work (#26, #30) in an isolated Supabase test project.
2. Confirm email verification, OAuth redirect URI, password recovery, rate limiting, multi-company membership and stale-session revocation.
3. Real Google / password login is **disabled** on this Vercel preview by branch-scoped deliberately invalid Supabase URL/key. No customer credentials or financial data for design preview.
4. Review PIN unlock, MFA challenge, edge states, keyboard and mobile snapshots; improve next while preserving the authorization state machine.
5. Complete a separate visual inventory for remaining legacy “Shop Pro” strings, metadata, PWA manifest, email templates, legal pages and mobile app icons; only replace branding after clearance and compatibility review.
6. Never merge this stacked branch to main without reconciliation of UI foundations and backend hardening.

## Next user-flow modules

1. Email verification / MFA / PIN recovery polish.
2. Real company setup and membership switcher backed by staging Auth.
3. Overview→ Entries→ Journal / COA / GL / reporting with a verified transactional writer.
4. Sales/AR, Purchases/AP, inventory, payroll and multi-company administration under feature-gated release criteria.
