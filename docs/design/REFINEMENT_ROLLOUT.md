# Shop Pro refinement release

The user approved final production rollout on 28 November 2026. The approved design is frozen for this release. Existing routes, calculations, confirmation flows, permissions and offline replay remain in scope.

## Database rollout completed

The following migrations were applied individually after deployed schema inspection, SQL regression testing and a before/after comparison of the deployed policy baseline. Repository filenames match the actual Supabase migration versions.

| Version | Migration |
|---|---|
| 20261128073445 | reassert_active_shop_draft_boundaries |
| 20261128073506 | cashbook_analytics_read_api |
| 20261128073648 | isolate_privileged_rpc_implementations |
| 20261128073704 | preserve_policy_access_and_tune_reads |
| 20261128074259 | preserve_server_rpc_compatibility |

Membership checks now use active organization membership. Draft posting verifies identity, membership and enrolled MFA before looking up a draft or returning an idempotent result. Public RPC names are unchanged, use invoker rights, and delegate privileged work to guarded private-schema implementations. Anonymous invocation is denied.

Policy consolidation preserves the original OR semantics of authenticated permissions and retains all 26 restrictive MFA policies. Covering indexes resolve the reported missing-FK-index findings; the equivalent standalone daily-closing index was removed while keeping the constraint-backed unique index. Unused-index INFO findings were retained deliberately; newly created indexes have no usage history yet.

Live authenticated database checks passed for daily, weekly, monthly and year-to-date totals, expense filters, cross-shop rejection and the enrolled-MFA draft guard. Transaction and account-balance checksums, 1,467 transaction rows and 1,507 account ledger rows matched before and after migration.

Supabase post-rollout advisors report no database security-function warnings and no performance warnings or missing-index findings. The remaining security warning is leaked-password protection, which is unavailable on the current Free organization plan. No plan upgrade was made.

## Frontend and operations

`VITE_PERIOD_ANALYTICS_RPC=true` is configured for new preview and production deployments after the live parity checks. Overview/report summaries use the verified server aggregate API; complete register/export reads remain available on demand. Set the flag to false and rebuild to return to the existing transaction-read implementation.

The new PWA assets use distinct versioned paths. Service-worker updates keep the existing user-controlled activation lifecycle and do not cache private financial responses. Existing installed icons can refresh on the platform's normal update schedule.

Local SQL tests cover role/tenant/MFA outcomes against the captured deployed policy definitions. Frontend tests cover thread lifecycle/races, search escaping, complete exports, confirmation before financial writes, and existing financial/offline workflows. Deployed preview review covered light/dark layouts, all workspace pages and the new Excel worker download.

Actual signed-in assistant inference and physical-device installation behavior require the user's authenticated session/device. Production verification must report these limits rather than presenting demo rendering or SQL role checks as a full interactive signed-in test.
