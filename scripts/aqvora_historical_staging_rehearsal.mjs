/**
 * AQVORA historical import transport rehearsal.
 *
 * Converts FULLY synthetic, independently ledger-reconciled historical
 * Cashbook fixtures into calls compatible with the existing V2 journal RPC.
 * NO network access, no SQL, no production data and no automatic posting.
 *
 * Real import needs a separately reviewed server-owned evidence/approval writer
 * with immutable revisions, two-person signoff and signed source-to-target maps.
 */
import { planLegacyJournalDryRun } from './aqvora_legacy_journal_dry_run.mjs';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const POS_MINOR = /^[1-9][0-9]{0,18}$/;
const MAX_MINOR = 9223372036854775807n;
const SYNTHETIC_SOURCE_REF = 'synthetic-ci-fixture';
const INTENT_KEY = /^legacy:[0-9a-f]{64}$/;

function exactMinor(value, what) {
  if (typeof value !== 'string' || !POS_MINOR.test(value)) {
    throw new Error(what + ' must be a canonical positive int64 minor-unit string');
  }
  const n = BigInt(value);
  if (n > MAX_MINOR) throw new Error(what + ' exceeds bigint range');
  return n;
}

export function prepareDisposableHistoricalJournalRehearsal(snapshot, policy, options) {
  if (options?.environment !== 'disposable-in-memory-postgres'
      || options?.synthetic_fixture_only !== true
      || policy?.source_project_ref !== SYNTHETIC_SOURCE_REF
      || snapshot?.source_project_ref !== SYNTHETIC_SOURCE_REF
      || snapshot?.organization_id === policy?.target_company_id
      || !UUID.test(snapshot?.organization_id || '')
      || !UUID.test(policy?.target_company_id || '')) {
    throw new Error('Only distinct-tenant synthetic fixtures in disposable PostgreSQL are supported');
  }
  const review = planLegacyJournalDryRun(snapshot, policy);
  if (review.summary.status !== 'UNPOSTED_ACCOUNTING_REVIEW_ONLY'
      || review.summary.posting_allowed !== false
      || review.summary.erp_books_updated !== false
      || review.summary.exception_records !== 0
      || review.summary.pending_cloud_drafts !== 0
      || review.summary.historical_void_transactions !== 0
      || review.summary.quarantined_fixture_transactions !== 0
      || review.summary.accounts_with_unconverted_activity !== 0
      || review.summary.opening_account_rows_unposted !== snapshot.payment_accounts.length
      || review.opening_balances_not_posted.some(x => x.amount_minor !== '0')
      || !Array.isArray(review.candidates) || !review.candidates.length) {
    throw new Error('Synthetic rehearsal requires complete clean source parity; no exceptions or openings');
  }
  const ids = new Set();
  const requests = review.candidates.map((candidate) => {
    if (candidate.status !== 'UNPOSTED_REVIEW_CANDIDATE'
        || candidate.source_organization_id !== snapshot.organization_id
        || candidate.target_company_id !== policy.target_company_id
        || candidate.source_project_ref !== SYNTHETIC_SOURCE_REF
        || !UUID.test(candidate.source_id || '')
        || !UUID.test(candidate.period_id || '')
        || !INTENT_KEY.test(candidate.intent_key || '')
        || candidate.intent_key.length > 160
        || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.business_date || '')
        || !Array.isArray(candidate.lines) || candidate.lines.length !== 2) {
      throw new Error('Invalid or unsafe unposted review candidate');
    }
    if (ids.has(candidate.intent_key)) throw new Error('Duplicate synthetic journal intent');
    ids.add(candidate.intent_key);
    let debit = 0n, credit = 0n;
    const lines = candidate.lines.map(line => {
      const amount = exactMinor(line.amount_minor, 'journal candidate line');
      if (!UUID.test(line.coa_account_id || '')) throw new Error('Invalid target CoA account ID');
      if (line.side === 'debit') {
        debit += amount;
        return { account_id: line.coa_account_id, debit_minor: amount.toString(), credit_minor: '0' };
      }
      if (line.side === 'credit') {
        credit += amount;
        return { account_id: line.coa_account_id, debit_minor: '0', credit_minor: amount.toString() };
      }
      throw new Error('Invalid candidate side');
    });
    if (debit !== credit || debit <= 0n || debit > MAX_MINOR) {
      throw new Error('Unbalanced or oversized synthetic journal');
    }
    return {
      organization_id: policy.target_company_id,
      intent_key: candidate.intent_key,
      business_date: candidate.business_date,
      lines,
      // Local proof only. The V2 generic post RPC does NOT yet persist full
      // historical immutable source evidence or checker approval.
      private_source: {
        source_organization_id: candidate.source_organization_id,
        source_kind: candidate.source_kind,
        source_id: candidate.source_id,
        source_revision_sha256: candidate.source_revision_sha256,
      },
    };
  });
  const expectedDebits = requests.reduce((total, r) =>
    total + r.lines.reduce((sum, l) => sum + BigInt(l.debit_minor), 0n), 0n);
  const expectedCredits = requests.reduce((total, r) =>
    total + r.lines.reduce((sum, l) => sum + BigInt(l.credit_minor), 0n), 0n);
  if (expectedDebits !== expectedCredits
      || expectedDebits.toString() !== review.summary.preview_debits_minor
      || expectedCredits.toString() !== review.summary.preview_credits_minor) {
    throw new Error('Journal request totals mismatch preflight source evidence');
  }
  return {
    status: 'DISPOSABLE_SYNTHETIC_REHEARSAL_ONLY',
    source_scope: review.source_scope,
    source_fingerprint_sha256: review.summary.source_snapshot_sha256,
    expected_journals: requests.length,
    expected_total_debit_minor: expectedDebits.toString(),
    expected_total_credit_minor: expectedCredits.toString(),
    requests,
    real_import_allowed: false,
    production_database_access: false,
    source_data_replaced: false,
  };
}
