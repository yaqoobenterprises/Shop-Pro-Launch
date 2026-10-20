# UI audit

## Visual pass — 2026-10-20

### Scope and evidence

Reviewed the local app in demo mode with sample data and the public landing/auth surfaces. Screenshots and layout measurements covered these exact viewport widths; this is a bounded browser pass, not a claim that every device, zoom level, or intermediate width was tested.

| Surface | Visual coverage |
| --- | --- |
| Public landing | 320, 360, and 1280 px, light theme |
| Cashbook | 360 and 1488 px, light theme |
| Overview | 360, 768, and 1280 px, light theme |
| Entries | 360 and 1280 px, light theme |
| Reports | 360, 768, and 1280 px, light theme |
| Accounts | 360, 768, and 1280 px, light theme; 1280 px, dark theme |
| Settings | 360 and 768 px, light theme |
| Transaction details | 360 and 1280 px, light theme |
| Quick expense | 360 px, light theme |
| Sign-in, account creation, password recovery | 360 px; control/card geometry measured without reading autofilled field values or capturing auth screenshots |

Checked page width and key control/card bounds at the responsive breakpoints. No page-level horizontal overflow was found in the inspected states. Settings section links wrap on tablet and phone and measure at least 44 px high. Auth mode tabs, primary controls, and password visibility controls also measure about 44 px high after the touch-target adjustment.

### Findings and changes

| Finding | Disposition |
| --- | --- |
| The desktop sidebar remained visible on phones and compressed the main content. | Hide the sidebar below the mobile breakpoint and use a fixed five-item bottom navigation. |
| Overview date controls and page actions could crowd or exceed their content area. | Let controls wrap and shrink within the responsive page header. |
| Account transfer fields could extend past their panel, and an odd final card sat against the left edge at tablet width. | Constrain form tracks and center the final account card at the two-column breakpoint. |
| The third report summary card sat against the left edge at tablet width. | Center the final card in the two-column layout. |
| Settings section links needed more room and reliable tap targets. | Allow links to wrap and give each a 44 px minimum height. |
| Phone header lacked a clear product label, and account types exposed enum-style text. | Add the compact Shop Pro wordmark and use “Cash drawer,” “Bank account,” and “Digital wallet.” |
| Auth labels and actions used inconsistent capitalization and longer-than-needed copy; password visibility controls were undersized. | Simplify the visible copy, standardize sentence case, and increase visibility controls to 44 px. |
| Several active workspace, landing, and modal surfaces used gradients, blur, or large corners. | Use solid surfaces and consistent, more restrained corner sizes in the audited UI. |

The expense demo had no configured categories, so its category selector and Save Expense action were disabled. This is a demo-data condition; no expense or other business data was changed during the visual pass.

### Coverage limits

- The dark theme was visually checked on Accounts at 1280 px; other pages were checked in light theme only.
- Sign-in, account creation, and recovery were measured for overflow and control sizing. Their screenshots were skipped because the browser showed autofilled auth fields.
- Urdu/RTL was not activated or visually verified. Remaining auth states such as PIN setup/unlock, MFA challenge, and account confirmation received source review, not a full browser pass.
- The browser pass used local demo data at representative widths. It did not cover every browser, device pixel ratio, system font scale, zoom setting, or width between the listed breakpoints.
- No automated tests, lint, or build were run for this visual-only pass.

## Demo identity and Cashbook refinement — 2026-10-20

### Scope and evidence

Manually reviewed the demo Cashbook at 360 px and 1488 px in light theme, the expanded sidebar profile row at 1488 px, and demo Settings/Profile at 360 px. The demo profile menu and visible profile fields were checked for name and email exposure. The user-supplied portrait was converted to `public/assets/jamal-yaqoob.webp` and confirmed loaded in the header at 360 px and in both the header and sidebar at 1488 px.

### Findings and changes

| Finding | Disposition |
| --- | --- |
| Demo Cashbook rows exposed time, queue state, raw entry text, notes, and multiple actions. | Demo rows now keep the category, account, and amount in view; extra metadata and action controls stay hidden in demo mode. Real ledger rows retain their details and controls. |
| Demo profile still used a placeholder owner name and email. | Demo-only sample identity now uses “Jamal Yaqoob” with an empty email; sample transaction authors use the same name. Real profile data is not changed. |
| Header and sidebar profile areas showed more identity text than requested. | The header shows only the circular avatar and the account menu shows the name without email. The expanded demo sidebar aligns the avatar and “Jamal Yaqoob” label across its footer row; the collapsed sidebar shows only the avatar. The demo sidebar also hides the real register lock action. |
| The requested portrait needed to be added as a repo asset. | Converted the user-supplied square portrait to WebP at `public/assets/jamal-yaqoob.webp` (17 KB); the header and sidebar loaded the 460 × 460 image. |

The 360 px Settings/Profile view showed the demo name and profile controls without an email field. No automated tests, lint, or build were run for this visual pass.

## Earlier engineering findings (not revalidated in this visual pass)

The following findings are retained from the earlier source audit. They are not fresh verification of current implementation status.

| File and area | Severity | Finding and disposition |
| --- | --- | --- |
| src/App.tsx, screen switch | Medium | All signed-in screens were loaded from the root entry. They now load as separate chunks, with an announced loading state. |
| src/components/layout/CommandPalette.tsx, page list | High | Palette targets led to POS, inventory, customer, or expense pages that App.tsx did not render. The palette now searches only the six reachable screens and retains the supported expense and shortcut actions. |
| src/context/AppContext.tsx, AppView | High | The type advertised unavailable screens. The union now contains only screens rendered by the application. |
| src/context/AppContext.tsx and ChatView.tsx, Ctrl+N | Medium | The shortcut pointed to a dead POS screen. It now opens the ledger entry surface and focuses the selected form field. |
| index.html and src/index.css, font setup | Medium | Google Fonts were runtime requests, and Urdu used a font family that was not bundled. External font requests were removed; Manrope is local and Noto Naskh Arabic is loaded with the Urdu chunk. |
| src/App.tsx and settings preference sections | High | New region, language, and entry-mode controls were not consistently gated. Region and preference surfaces now check their respective false-by-default flags; region setup is owner-only. |
| src/components/chat/StandardEntryForm.tsx | High | The current form covers income and expense only and does not yet implement every required ledger type, account/date validation, or the full mode switch contract. The entryModes flag remains false. |
| Signed-in pages and i18n catalogs | High | Several signed-in components still contain English literals. Urdu parity and lazy loading are in place, but full translation coverage and RTL layout verification are not. The languageUr flag remains false. |
| Chat query and chip behavior | High | Read-only question detection and frequency-ranked chips are not implemented. The chatQueries flag remains false. |
| docs/ reference comparison | Medium | The reference scaffold is available for source comparison, but screenshots from the running app could not be captured during that earlier audit. |

## Remaining verification

Repeat the page pass in dark theme and, when Urdu is enabled, in RTL. Include PIN/MFA/confirmation states, browser zoom and text scaling, keyboard focus order, and modal scrolling on a physical phone and tablet before making a cross-device parity claim.

## Responsive card and date-control follow-up - 2026-10-20

### Scope and evidence

Rechecked the signed-in demo workspace in light theme at the exact viewport widths below. Measurements use the browser viewport and rendered element bounds; this is a responsive review, not a claim that every device, browser, zoom level, or intermediate width was checked.

| Surface | Viewports | Result |
| --- | --- | --- |
| Cashbook | 360, 768, 1280 px | No page overflow. The three summary cards share a row and equal heights at each width. Transaction rows remain within the content area. |
| Overview date controls and metrics | 360, 768, 1024, 1280 px | Day and Month now keep the picker at the same height and position. The phone layout consistently stacks the toggle and picker; tablet and desktop keep them on one row. Metric cards keep equal widths and heights within each grid. |
| Overview supporting panels | 360, 768, 1024, 1280 px | Panels stack below 1100 px and use the desktop grid above it. No page-level horizontal overflow. |
| Entries | 360, 768, 1280 px | Filter controls wrap at narrower widths. Transaction rows keep a common width and row height within each viewport; no page-level overflow. |
| Reports | 360, 768, 1024, 1440 px | Summary cards use one column on phones, two columns with a centered final card on tablet, and three equal columns on desktop. Card heights match within each row. |
| Accounts | 360, 768, 1024, 1280 px | Cards use one column on phones, two equal columns with a centered final card on tablet, and three equal columns on desktop. The 1024 px grid now stays at two columns so the final card matches the first row. |
| Settings | 360, 768, 1280 px | Section panels share the available content width. Section links wrap on phone and tablet; no page-level horizontal overflow. |

### Changes

| Finding | Disposition |
| --- | --- |
| The Month picker made the Overview header controls wrap while Day stayed on one row at tablet and desktop widths. | Use one responsive grid for both modes, fix both picker triggers and period buttons to the same 2.8rem height, and remove the hover lift from the period buttons. |
| The account card grid could fit three tracks at 1024 px even though its odd-card rule assumed two. The last card became wider than the first row. | Use two tracks throughout the tablet breakpoint and size the centered final card to the same half-row width. |

No automated tests, lint, or build were run for this visual-only pass.

## Financial card copy and alignment follow-up - 2026-10-20

### Scope and evidence

Reviewed the signed-in demo workspace in light theme. Overview cards were checked at 320, 360, 768, 1024, and 1280 px; Reports and Accounts cards were checked at 320, 360, 768, 1024, and 1280 px; Cashbook summary cards were checked at 320 px and were previously checked at 360, 768, and 1280 px. The Day and Month controls kept the same positions and 45 px height at 360 px. Document scroll width matched the viewport at the reviewed widths, and card labels and values remained within their cards.

### Findings and changes

| Finding | Disposition |
| --- | --- |
| Overview metric cards repeated explanatory copy beneath each amount, and several chart panels repeated their purpose in subtitles or footnotes. | Removed the repeated metric details, panel subtitles, monthly trend footnote, and duplicate largest-expense sentence. Kept the metric labels, chart legend, category labels, and financial values. |
| Report summary cards and headings repeated explanatory copy, making the amounts compete with secondary text. | Removed the report card taglines and chart/table subtitles. The report labels, annual amounts, monthly figures, and margin column remain. |
| Account cards repeated active/default status descriptions and left uneven space around names, balances, and actions. | Removed redundant status descriptions and aligned account types, names, balances, and actions with consistent spacing. The action still indicates whether an account can be deactivated or reactivated. |
| Overview metrics collapsed into a tall single column on small phones. | Kept the four metrics in a compact two-column grid through 460 px; tablet uses two columns and desktop uses four. Values use tabular numerals and remain on one line. |
| The cited spelled-out rupee amount was not present as a source string. | Confirmed the demo Cashbook renders its sample transaction amounts numerically and does not expose that phrase in the rendered view. |

No automated tests, lint, or build were run. This pass covered the demo in light theme at the listed representative viewport widths; it did not test every physical device, browser, zoom level, dark theme, or Urdu/RTL layout.

## Branded scrollbar follow-up - 2026-10-20

### Scope and evidence

Applied a shared scrollbar treatment to the app and checked the demo Settings page at 360 px and 1488 px, including its vertical content area and horizontally overflowing section navigation. Checked the Cashbook category strip at 360 px. Computed styles showed a thin scrollbar with the Shop Pro surface track and muted thumb, and the active theme's colors updated when switching to Dark and back to Light. Document width matched the viewport during the phone check.

### Changes

| Finding | Disposition |
| --- | --- |
| Native browser scrollbars varied across app surfaces, and Settings and Cashbook horizontal strips hid theirs. | Added shared thin scrollbar track/thumb/corner styling using the current theme tokens, including hover and active states. Removed scrollbar-hiding classes from the Settings section navigation and Cashbook category strip so their horizontal scroll affordance uses the shared style. Forced-colors mode retains system contrast colors. |

Automated tests, lint, and build were not run. Native mobile browsers can choose to show overlay scrollbars only while the user scrolls; the styles preserve native scrolling and do not force a permanent overlay on those systems.

## Motion engineering follow-up - 2026-10-20

### Scope and evidence

Reviewed motion in the landing page, sign-in screen, MFA challenge, demo Cashbook, Overview, Entries, Reports, Accounts, and Settings. Landing/sign-in were checked at desktop and 390 px phone widths; workspace pages were checked at desktop and 360 px phone widths. The MFA entrance was reviewed in source and now uses the same soft card entrance as the other authentication screens. No document-width overflow appeared on the phone checks. Confirmed the Entries table rows do not animate individually, the Reports chart bars use the new grow animation, and primary amounts render their final accessible value without announcing each animation frame. Checked browser error logs; none were reported. Reduced-motion behavior was reviewed in CSS and the count-up component; OS-level media emulation was not performed.

### Findings and changes

| Finding | Disposition |
| --- | --- |
| Headline amounts appeared immediately while charts had a declared but unused growth animation. | Added an eased 720 ms count-up for landing sample totals, Cashbook totals, Overview summaries, report totals, and account balances. Added a restrained 480 ms grow-in for chart bars and Overview progress bars. Chart groups use a short stagger. |
| Every Cashbook activity row entered at once, and every Entries table row moved on page load. | Limited the Cashbook entrance to the first five activity/draft rows with a subtle stagger. Kept the dense Entries table rows still for scanability. |
| Motion needed to stay usable for people who request reduced motion. | Count-up values settle immediately when reduced motion is enabled; the shared reduced-motion rule shortens CSS animation and transition durations. The screen reader receives one stable final amount while the visual count-up is hidden from it. |
| Sidebar, card, page, settings-section, dialog, and toast transitions already had consistent short easing. | Retained those transitions after review; the sidebar's existing 2 px hover movement remains subtle. |

No automated tests, lint, or build were run for this motion pass. Viewport checks were representative, not every device, browser, zoom level, or intermediate width. Reduced-motion CSS and behavior were reviewed from source but not toggled through an OS/browser emulation setting.

## Typography hierarchy follow-up - 2026-10-20

### Scale and changes

Added a shared type scale in `src/typography.css`, imported after the base and motion styles so active screens use the same hierarchy:

| Role | Size | Use |
| --- | --- | --- |
| Landing display | 36–60 px | Main public-page headline |
| Workspace page title | 24–30 px | Primary screen heading; Cashbook uses 22–26 px |
| Section title | 18 px | Panels and settings sections |
| Card title | 16 px | Account names and compact card headings |
| Body and input text | 14 px | Descriptions, form values, and empty states |
| Form labels and controls | 13 px | Labels, primary controls, and actions |
| Supporting labels | 12 px | Card labels, helper text, and metadata |
| Dense chart/table labels | 11–12 px | Axes and compact table headings |
| Headline financial values | 17–24 px | Totals, with tabular numerals |

The overview's inline small text now uses the shared tokens. Report-card totals inherit the headline size and keep normal casing; large financial values use Manrope with tabular numerals. Urdu headings and copy retain taller line spacing.

### Preview and limits

Reviewed Overview, Entries, Reports, Accounts, Settings, and Cashbook in the local browser preview at 1488 px. Computed page headings ranged from 26 px for Cashbook to 30 px for other workspace pages; panel titles were 18 px, account titles 16 px, form labels 13 px, body inputs 14 px, and key totals 22–24 px. The document had no horizontal overflow on those screens at that viewport.

The Entries preview displayed a missing or expired cloud-session message and no transaction rows; Settings also logged the same session error while loading cloud data. Row typography could only be checked from the component styles. Landing and authentication typography was updated by shared screen selectors but was not live-previewed in this already-authenticated browser session. Mobile/tablet viewports, dark theme, Urdu/RTL, browser zoom, and physical devices were not rechecked in this pass. No automated tests, lint, or build were run; `git diff --check` reported no whitespace errors.

## Account card action follow-up - 2026-10-20

### Changes and verification

Removed the repeated account type labels. Moved account editing and activate/deactivate actions into paired icon buttons at the top-right of each card; the edit button changes to a save check while editing. Deactivation uses a red power icon, and the existing balance and last-active-account guard remains in place. Added accessible names and hover titles to the icon-only actions.

Reviewed the demo Accounts page at 1488 px. All three account cards showed aligned 40 px action targets, no account type text, and red disabled deactivation icons for the sample accounts whose balances prevent deactivation. Document width matched the viewport. Mobile/tablet, dark theme, Urdu/RTL, and physical devices were not checked in this follow-up. No automated tests, lint, or build were run.

## Accounts typography follow-up - 2026-10-20

Applied one Accounts-specific size scale to account names (16 px), balances and total liquidity (responsive 18-22 px), supporting captions (12 px), form labels (13 px), and input text (14 px). Balances use tabular numerals and share the same responsive scale across the cards and total. No account behavior changed. Automated tests, lint, and build were not run.

## Account brand marks follow-up - 2026-10-20

Replaced the BA/CA/DW initials with provider marks where the account name identifies Meezan Bank or JazzCash. The marks are stored locally in `public/assets` so cards render offline. Cash accounts, unrecognized banks, and other wallets use a matching financial icon as a fallback. The [Meezan mark](https://commons.wikimedia.org/wiki/File:Meezan_Bank_Limited_logo_(2026).svg) is credited there to Meezan Bank, and the [JazzCash mark](https://commons.wikimedia.org/wiki/File:JazzCash_logo_(2025).png) is credited to JazzCash. No account data or behavior changed.

Reviewed the demo Accounts page at 1488 px. Both local brand images loaded, every account card had a visible mark, and document width matched the viewport. Mobile/tablet, dark theme, Urdu/RTL, and physical devices were not checked in this follow-up. No automated tests, lint, or build were run.

## Pakistan account provider coverage follow-up - 2026-10-20

Added a local account-name suggestion directory for Pakistani banks, microfinance banks, and common wallets. Provider aliases choose the account card mark; account names stay editable and account type remains user-selected. Meezan and JazzCash continue to use bundled logo images; other listed providers get compact local, brand-colored wordmarks so the cards stay distinct offline. Custom and international names outside this directory keep the type-based icon. The provider set was cross-checked with the [SBP bank directory](https://www.sbp.org.pk/sbp-regulated-institutions/commercial-banks) and [SBP EMI list](https://www.sbp.org.pk/PS/PDF/List-of-EMIs.pdf). The additional wordmarks are locally styled identifiers, not official bank logo artwork. No account schema or balance logic changed. No automated tests, lint, or build were run.
