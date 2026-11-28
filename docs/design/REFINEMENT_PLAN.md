# Shop Pro refinement

## Approved scope

Refine existing workflows only. Preserve financial calculations, permissions, offline replay, account scoping and confirmation before posting. Keep the existing chart engine and visual direction.

## Delivery sequence

1. **Shell and identity**: text-only Shop Pro wordmark; remove organization breadcrumbs, workspace tile, status dot, shortcut/collapse footer, visible comparison toggle and cashbook install promotion. Use the canvas color for the sidebar/header. Build a real inline search with keyboard support; no search dialog. Replace app/PWA/favicon artwork with a distinct code-native monogram and versioned assets.
2. **Page composition**: rebuild cashbook, entries, accounts, reports and settings around clear actions, surface fills and spacing rather than outlines. Preserve keyboard focus and form errors. Keep transaction entry reachable, compact report filters, improve activity descriptions and receipt hierarchy. Retain comparison capability in the date controls without the removed standalone toggle.
3. **LedgerMate**: professional conversation layout and explicit history selection. Start at a fresh conversation on entry; preserve prior chats in history. Prevent stale hydration, thread-switch races and old responses reappearing. Keep actions and financial writes behind review. Improve streaming scroll behavior without stealing the reader's position.
4. **Motion and reliability**: supply actual enter/exit keyframes, purposeful page/control feedback and reduced-motion support. Stable category colors, reliable refresh after changes/sync, honest unavailable-data states, matching search behavior and safe OAuth message origins.
5. **Performance and backend preparation**: reduce repeated supporting-data reads and eager frontend imports; retain complete exports. Prepare reviewed tenant-safe summary/index/RPC migration changes with regression coverage. Do not apply production database migrations as part of preview preparation.
6. **Verification and review**: lint, strict types, focused regression tests, full suite, production build, token/size checks and rendered desktop/light/dark/narrow-screen QA. Open a PR and provide a preview. Production merge and database rollout are separate from the preview.

## Visual acceptance

- No old logo icon or workspace tagline in visible branding.
- No organization tile/breadcrumb, connection status dot, shortcut footer, search popup, standalone comparison switch or cashbook install button.
- Header/sidebar blend with the canvas. Cards and controls have no decorative outline borders; focus indicators and error states remain visible.
- Every existing view has intentional composition, meaningful empty/loading/error states, and usable small-screen controls.
- LedgerMate never chooses an old conversation without an explicit history selection, and never drops saved history.
- No fabricated financial data, ornamental charts or new accounting modules.
