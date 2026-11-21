# AQVORA landing UX — 20 November 2026

**Status: private review preview, stacked on PR #33; no production merge.**

## Scope completed in this slice
- Replaces the old Shop Pro landing page layout with a premium navy/emerald wordmark, decisive hero, functional Create Account / Sign In / Explore Demo actions, clean feature summaries and mobile-safe navigation.
- Adds a realistic *explicitly illustrative* account dashboard; all sample metrics, recent activity and six-month chart are labeled sample. No financial values or features are passed off as real.
- Uses a scoped, two-theme responsive CSS system without rewriting legacy workspace CSS, authentication logic, posting, migrations or RLS.
- Names General Ledger, invoicing, inventory and payroll as **in development**, not shipped.
- Adds accessible chart data table, working skip link, button busy/error state, keyboard focus and reduced motion behavior.
- Tests navigation actions, duplicate demo launch, demo failures, samples and semantics.

## Visual standards
- Inter Variable, navy #172638, emerald #176b54, quiet neutral surfaces and Lucide outline icons.
- Information hierarchy and concise labels before decoration. No long marketing paragraphs inside software UI.
- Header CTA routes to existing signUp and Sign In to existing signIn; **next phase is redesigning those actual forms and completion/recovery states**.
- The temporary typographic AQVORA A-mark is a *preview brand treatment*, not a replacement for the exact approved monogram. Verify final assets and trademark clearance before public rebrand.

## Safety
This PR is **UI-only**, based on PR #33 rather than the security stack or combined PR #32. The branch-scoped Vercel preview environment replaces VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY with deliberately nonfunctional placeholders to prevent real signups and finance records during design review. These placeholders must remain isolated to this preview branch. On the preview, use **Explore Demo** rather than real credentials.

No actual cloud signup or MFA integration test is possible in this mock preview. Real Auth, signup MFA, role membership and production migration validation require an isolated Supabase staging project; the outstanding draft PRs remain gated.

## Next flow
1. Confirm screen at 360, 390, 768, 1024, 1440; light/dark; keyboard.
2. Sign In, Sign Up and password reset screens, including field errors/loading, Google OAuth feedback, verification email and MFA transitions.
3. Verified company onboarding.
4. Workspace navigation and actual accounting workflows, module by module, without demo UI being mistaken for a release.
