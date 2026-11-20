# AQVORA V2 administration contract

These PostgreSQL RPCs administer only the isolated `aqvora_*` schema. They do not
enroll a company in `aqvora_enabled_companies`, change legacy cashbook data, or
turn on journal posting for existing customers.

## Authorization and transaction behavior

- Every RPC takes `p_organization_id` and checks a live Auth session, AAL2 MFA,
  and active canonical `organization_members` membership. OWNER may mutate;
  OWNER or MANAGER may read. Anonymous callers cannot execute the RPCs.
- Mutations lock the organization row exclusively after authorization. Journal
  posting holds a shared lock on the same row. A close or archive therefore
  commits either before or after a posting, never midway through it.
- PostgreSQL executes each RPC and its audit row in one transaction. Callers
  should use one RPC per administrative action and treat any SQL error as no
  committed change. `revision` is an optimistic concurrency token; pass the
  last value read and refresh after a stale revision error.
- The `authenticated` role has SELECT through company-scoped RLS and no direct
  INSERT, UPDATE, or DELETE privilege on the V2 tables. The admin audit table
  is append-only, including for privileged table DML.

## RPCs

| Operation | PostgreSQL function | Notes |
| --- | --- | --- |
| Create account | `create_aqvora_account(p_organization_id, p_code, p_name, p_account_class, p_normal_side, p_parent_id, p_is_posting)` | Server generates ID; no client control-role input. |
| Edit account | `edit_aqvora_account(p_organization_id, p_account_id, p_expected_revision, p_code, p_name, p_parent_id)` | Code and hierarchy of posted accounts and ancestors are immutable. |
| Archive account | `archive_aqvora_account(p_organization_id, p_account_id, p_expected_revision, p_reason)` | Soft archive; reason required; active children and control accounts protected. |
| List/get accounts | `list_aqvora_accounts(p_organization_id, p_after_code, p_limit)`, `get_aqvora_account(p_organization_id, p_account_id)` | Code keyset pagination; 1–200 rows. |
| Create period | `create_aqvora_period(p_organization_id, p_starts_on, p_ends_on)` | Overlap rejected, including concurrent creates. |
| Close/reopen period | `close_aqvora_period(p_organization_id, p_period_id, p_expected_revision, p_reason)`, `reopen_aqvora_period(...)` | Reason required; a later closed period must reopen first. |
| List/get periods | `list_aqvora_periods(p_organization_id, p_before_start, p_limit)`, `get_aqvora_period(p_organization_id, p_period_id)` | Newest first; 1–200 rows. |
| Audit history | `list_aqvora_admin_events(p_organization_id, p_before_id, p_limit)` | Immutable snapshots with actor and reason. |

The API uses the existing V2 `account_class`, `normal_side`, `control_role`, and
period `state` vocabulary. PR #40's `ChartAccount` view model can map the
returned snake-case columns to camelCase. Its sample preview is still disabled;
no frontend integration is claimed. A period reopened by this API has
`state = 'open'` and `reopen_count > 0`; there is no separate `reopened` state.

Control accounts are provisioned through trusted, reviewed seed migrations.
The public account API cannot create or modify one. Posting still rejects
unverified AR, AP, inventory, and tax source references. This release does not
add source-document verification or financial subledger posting.

## Verification boundary

PGlite tests cover migration installation and RPC behavior. The CI PostgreSQL
17 service exercises independent sessions, row locks, retry and receipt races,
tenant isolation, and fresh/deployed migration orders. Real Supabase Auth and
PostgREST behavior requires a disposable local stack or isolated cloud staging
project; no existing project is a test target. Follow the Phase 3 recovery
runbook before any future staging migration rehearsal.
