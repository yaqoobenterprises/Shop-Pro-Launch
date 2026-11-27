# Shop Plus — Phase 09 integration evidence and release checklist

## Verified evidence (2026-11-27)
- [CI 45963258469](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45963258469) passed after the isolated integration workflow was added. Previous verified code suite: 418 tests / 65 files, build, type checks, lint, source-size and dependency audit.
- [Browser audit 45961465966](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45961465966) passed 128 automated scans at eight widths and in both themes, with zero detected violations. 89 scans have incomplete automated checks; no full WCAG conformance claim.
- [Integration run 45963248255](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45963248255) successfully started a disposable Supabase stack, applied the six deployed migrations, seeded synthetic Auth users and financial/chat records, then applied the two pending migrations. Eight of nine scenarios passed:
  1. Existing receipt, balance and chat preservation.
  2. Foreign-shop and inactive-member read isolation.
  3. Owner-only organization settings.
  4. Two parallel draft-post requests produce one receipt and one posting.
  5. Opposite-direction concurrent transfers conserve balances with paired posting legs.
  6. Cross-tenant transfer rejection rolls back both legs; cashier transfer denied.
  7. Currency relabeling after posted activity rejected.
  8. Real Auth session and active membership gate with a synthetic AI provider.
- The ninth test failed at TOTP enrollment because local Supabase CLI configuration defaults to disabled. Commit `72ece12b7ae05b11563ec5c7a9f56f4154ac79ba` explicitly enables enrollment and verification in the generated disposable config and validates the result with Python TOML parsing. No production config changed. See [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config). [Corrected integration run 45965478979](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45965478979) pending at the time of this record.
- Local environment uses real PostgreSQL, GoTrue and PostgREST with synthetic fixtures, loopback-only safety checks, no live provider calls, and automatic teardown. It is not a hosted staging replica of production data or a real-provider test.

## Remaining manual and hosted verification
Use a protected preview explicitly connected to an isolated staging Supabase project, never a production-connected preview for write tests. No hosted staging branch existed at the last inspection; do not create billable infrastructure or copy production data without approval.

| Gate | Acceptance evidence |
| --- | --- |
| MFA | Corrected integration run green; separately verify hosted policy and enrollment with a test identity. |
| Real AI provider | With a staging-only provider key and synthetic records, verify authenticated health and streamed answers, exact amounts and period scopes, failed/canceled streams, rate limits, privacy and cross-role denial. Never log keys or send real customer information. |
| Manual accessibility | Screen reader (NVDA/VoiceOver), keyboard only, 200% zoom and narrow reflow; inspect visible focus, announcements, calendar navigation, modal focus return, chart data tables, color contrast, authentication/recovery and touch controls. Record browser/device/viewport and observed results. |
| Financial operations | Verify draft loss/retry, void/restore/edit, transfer histories, offline reconciliation and concurrent currency/entry operations with synthetic records; reconcile exact integer balances before and after. |
| Product gaps | Review remaining Phase 07 scope: previous-period comparisons, recent records, advanced transaction filters/sort, historical accounts, transfer register, report export/print precision and AI action recovery. Reviewed AI write actions stay off. |
| Security | Resolve documented pending migration and privileged-function concerns, review leaked-password protection, MFA, effective authorization, rate limits and data handling. |
| Deployment | Pin exact tested commit, verify staging preview and smoke results, and compare final build/lab evidence. |

## Production approval gate — NO-GO until evidence is complete
1. Review exact pending SQL: `20261017062800_launch_authorization_hardening.sql` and `20261117054753_ledgermate_multi_conversation_history.sql`. Do not assume the isolated pass proves compatibility with all existing data. Verify actual production migration order and schema drift.
2. Confirm backup availability and restore rehearsal on isolated infrastructure, approved recovery point and deployment rollback target. Do not copy customer data into the repository or test artifacts.
3. Obtain explicit owner approval for the exact database changes and maintenance window. Apply only approved migrations using reviewed migration tooling, verify migration history, role access, and financial invariants.
4. Obtain separate approval to merge/deploy the exact verified frontend candidate; check environment references and deployment status, smoke test read-only first and record release evidence.
5. If any financial/security check fails, stop and follow the reviewed recovery plan. Do not blindly reverse financial SQL or replay transactions.

No live migrations, production release, provider-key disclosure, real financial writes or backup restore performed. Manual and hosted gates remain open.

## Final MFA verification
[Corrected integration run 45965478979](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45965478979) completed successfully. All nine scenarios passed, including verified TOTP enrollment, AAL1 denial and AAL2 access using the real local Auth stack. The provider was synthetic. Hosted and manual release gates remain open.
