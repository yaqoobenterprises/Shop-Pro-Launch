# AQVORA V2 administration contract

These PostgreSQL RPCs administer only the isolated `aqvora_*` schema. They do not
enroll a company in `aqvora_enabled_companies`, change legacy cashbook data, or
turn on journal posting for existing customers.

## Authorization and transaction behavior

- Every RPC takes `p_organization_id` and checks a live Auth session, AAL2 MFA,
  and active canonical `organization_members` membership. OWNER may mutate;
  OWNER or MANAGER may read. Anonymous callers cannot execute the RPCs.
- Account, period and audit reads use the read authorization path. It holds
  shared session and membership locks while checking revocation and role; it
  does not take the exclusive company lock used by mutations.
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

## Frontend adapter boundary

The PR #40 preview is a local read model. A future adapter must page through
`list_aqvora_accounts` until it has a complete company chart before calling
`assertValidChart`; one page is not a complete chart. Map `organization_id`,
`account_class`, `normal_side`, `parent_id`, `is_posting`, `is_active`, and
`control_role` to the matching `ChartAccount` camel-case fields. Convert a null
`control_role` to an absent optional value. Retain each row's `revision` for
edit/archive calls. Every account mutation is an RPC, never a table write.

For `JournalPreviewPolicy`, use the selected company's server currency and
period dates. Map SQL `state = 'open'` to preview `periodState = 'open'` even
when `reopen_count > 0`; the current preview treats `reopened` as locked.
The preview is advisory and cannot grant posting authority.

The posting adapter maps `JournalDraftInput.organizationId` to RPC
`organization_id`, `intentId` to `intent_key`, `businessDate` to
`business_date`, and each line's `accountId`, `debitMinor`, and `creditMinor`
to `account_id`, `debit_minor`, and `credit_minor`. Amounts remain canonical
decimal minor-unit strings. The server derives currency from the company.
`lineId` is a local draft identifier; it is not a persisted journal line ID.
Do not send `partyId`, `openItemId`, or `stockMovementId` until verified source
posting exists. After a lost response, call `lookup_aqvora_receipt` with the
same `(organization_id, intent_key)` before retrying the identical payload.
The receipt supplies `journal_id`, `total_minor` as a string, `posted_at`, and
`posted_by`. PR #40's current controls remain disabled; no UI integration is
claimed by this contract.

## Verification boundary

PGlite tests cover migration installation and RPC behavior. The CI PostgreSQL
17 service exercises independent sessions, row locks, retry and receipt races,
tenant isolation, fresh/deployed migration orders, and full-schema dump/restore.
A separate disposable local Supabase stack on a GitHub Actions runner exercises
real Auth-issued AAL1/AAL2 JWTs and PostgREST permissions with synthetic users.
Neither job verifies hosted configuration or customer data. Follow the Phase 3
recovery runbook before any isolated cloud staging migration rehearsal.
