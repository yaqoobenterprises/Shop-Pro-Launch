/**
 * One-source-organization review-only double-entry journal simulator.
 * This module NEVER posts V2 journals, updates books, or issues SQL/network requests.
 * Financial statements MUST NOT treat these unapproved candidates as posted.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileLegacySourceSnapshot } from './aqvora_legacy_source_reconcile.mjs';
import { writePrivateSnapshot } from './aqvora_legacy_snapshot_export.mjs';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const TREATMENTS = Object.freeze({
  earned_revenue: ['income', 'REVENUE'],
  agency_collection: ['income', 'LIABILITY'],
  customer_advance: ['income', 'LIABILITY'],
  operating_expense: ['expense', 'EXPENSE'],
  inventory_purchase: ['expense', 'ASSET'],
  owner_drawing: ['expense', 'EQUITY'],
  owner_contribution: ['capital_in', 'EQUITY'],
  owner_withdrawal: ['withdrawal', 'EQUITY'],
});
const sha256 = s => createHash('sha256').update(s).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function minor(v, name) {
  if (typeof v !== 'string' || !/^-?(0|[1-9]\d*)$/.test(v)) {
    throw new Error(name + ' must be an exact minor-unit string');
  }
  return BigInt(v);
}
function numericMinor(v, name) {
  if (typeof v !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(v)) {
    throw new Error(name + ' requires exact positive PKR numeric text');
  }
  const [whole, fract = ''] = v.split('.');
  const n = BigInt(whole) * 100n + BigInt(fract.padEnd(2, '0') || '0');
  if (n <= 0n) throw new Error(name + ' must be positive');
  return n;
}
function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
function isTaggedFixture(tx) {
  return /^shop_pro_pagination_test\b/i.test(String(tx.raw_text || '').trim());
}
function signature(tx) {
  return [tx.business_date, tx.type, tx.amount_paisa,
    String(tx.raw_text || '').trim().toLowerCase().replace(/\s+/g, ' ')].join('|');
}
function accountMapping(policy, id) {
  const map = policy.payment_accounts[id];
  return map && UUID.test(map.coa_account_id || '') && map.account_class === 'ASSET'
    ? map.coa_account_id : null;
}
function mappingFor(tx, policy) {
  const chosen = policy.transaction_overrides?.[tx.id] ||
    (tx.category_id ? policy.categories?.[tx.category_id] : null);
  if (!chosen || !UUID.test(chosen.coa_account_id || '')) return null;
  const expected = TREATMENTS[chosen.treatment];
  if (!expected || expected[0] !== tx.type || expected[1] !== chosen.account_class) return null;
  return chosen;
}
function dayPeriod(date, policy) {
  if (!validDate(date)) return null;
  const matching = (policy.periods || []).filter(p =>
    UUID.test(p.period_id || '') && validDate(p.start) && validDate(p.end)
    && p.start <= date && date <= p.end);
  return matching.length === 1 ? matching[0].period_id : null;
}
function journal(kind, srcId, date, periodId, cashAccountId, contraAccountId,
  cashSign, amount, source, sourceRevision) {
  const isCashDebit = cashSign > 0n;
  const debitAccount = isCashDebit ? cashAccountId : contraAccountId;
  const creditAccount = isCashDebit ? contraAccountId : cashAccountId;
  if (debitAccount === creditAccount || amount <= 0n) {
    throw new Error('Invalid same-account or zero-amount candidate');
  }
  const revision = sourceRevision.slice(0, 32);
  return {
    status: 'UNPOSTED_REVIEW_CANDIDATE', source_kind: kind, source_id: srcId,
    source_organization_id: source.organization_id,
    source_project_ref: source.source_project_ref,
    source_revision_sha256: sourceRevision,
    intent_key: 'legacy:' + source.source_project_ref + ':' + source.organization_id +
      ':' + kind + ':' + srcId + ':' + revision,
    business_date: date, target_company_id: source.target_company_id,
    period_id: periodId, currency: 'PKR',
    lines: [
      { side: 'debit', coa_account_id: debitAccount, amount_minor: amount.toString() },
      { side: 'credit', coa_account_id: creditAccount, amount_minor: amount.toString() },
    ],
  };
}

export function planLegacyJournalDryRun(snapshot, policy) {
  if (!snapshot || !policy || snapshot.schema_version !== 1
      || snapshot.currency !== 'PKR' || policy.currency !== 'PKR'
      || policy.review_mode !== 'dry_run_only' || policy.minor_unit_exponent !== 2
      || !UUID.test(snapshot.organization_id || '') || !UUID.test(policy.target_company_id || '')
      || policy.source_organization_id !== snapshot.organization_id
      || !snapshot.source_project_ref
      || policy.source_project_ref !== snapshot.source_project_ref) {
    throw new Error('Source/policy identity, currency, or dry-run-only boundary mismatch');
  }
  const review = reconcileLegacySourceSnapshot(snapshot, policy.source_key);
  if (!review.summary.ledger_source_reconciled) {
    throw new Error('Legacy source accounting reconciliation failed; no proposals allowed');
  }
  if (policy.expected_source_sha256 !== review.summary.source_snapshot_sha256) {
    throw new Error('Source snapshot drift or missing approved fingerprint; no proposals');
  }
  if (!policy.payment_accounts || typeof policy.payment_accounts !== 'object'
      || !policy.categories || typeof policy.categories !== 'object') {
    throw new Error('Explicit source account and category mappings are required');
  }
  const targetAccounts = new Set();
  for (const [id, map] of Object.entries(policy.payment_accounts)) {
    if (!UUID.test(id) || !map || !UUID.test(map.coa_account_id || '')
        || map.account_class !== 'ASSET') throw new Error('Invalid payment-account CoA mapping');
    if (targetAccounts.has(map.coa_account_id)) {
      throw new Error('Distinct source payment accounts cannot silently collapse to one CoA account');
    }
    targetAccounts.add(map.coa_account_id);
  }
  const candidates = [], exceptions = [];
  const accountExpected = new Map(), accountProposed = new Map();
  const increment = (bag, id, amount) => bag.set(id, (bag.get(id) || 0n) + amount);
  const block = (kind, id, reason) => exceptions.push({ source_kind: kind, source_id: id, reason });
  const transactions = snapshot.transactions.filter(t => t.status === 'active' && !isTaggedFixture(t));
  const signatures = new Map();
  for (const t of transactions) {
    const k = signature(t), ids = signatures.get(k) || [];
    ids.push(t.id); signatures.set(k, ids);
  }
  const repeated = new Set([...signatures.values()].filter(ids => ids.length > 1).flat());
  const edited = new Set(snapshot.audit_log.filter(e =>
    ['edit', 'restore', 'void'].includes(e.action)).map(e => e.transaction_id));
  const source = {
    organization_id: snapshot.organization_id,
    source_project_ref: snapshot.source_project_ref,
    target_company_id: policy.target_company_id,
  };
  let fixtures = 0, voids = 0, reviewedRepeatCandidates = 0;
  for (const tx of snapshot.transactions) {
    const n = minor(tx.amount_paisa, 'source amount');
    if (tx.status === 'voided') { voids++; block('transaction', tx.id, 'historical_void_audit_only'); continue; }
    if (isTaggedFixture(tx)) { fixtures++; block('transaction', tx.id, 'explicit_test_fixture_quarantined'); }
    // Legacy type sign. All unsupported types remain blocked for accounting classification.
    const cashEffect = tx.type === 'income' || tx.type === 'capital_in'
      || tx.type === 'investment' ? n
      : tx.type === 'expense' || tx.type === 'withdrawal' ? -n
      : tx.type === 'adjustment' && tx.adjustment_dir === 'in' ? n
      : tx.type === 'adjustment' && tx.adjustment_dir === 'out' ? -n : null;
    if (cashEffect === null) throw new Error('Unsupported source transaction sign');
    increment(accountExpected, tx.account_id, cashEffect);
    if (isTaggedFixture(tx)) continue;
    if (edited.has(tx.id)) { block('transaction', tx.id, 'edited_or_restored_history_needs_reversal_policy'); continue; }
    if (repeated.has(tx.id) && !policy.duplicate_reviewed_source_ids?.includes(tx.id)) {
      block('transaction', tx.id, 'repeated_source_signature_requires_individual_review'); continue;
    }
    if (repeated.has(tx.id)) reviewedRepeatCandidates++;
    const cashCoa = accountMapping(policy, tx.account_id);
    if (!cashCoa) { block('transaction', tx.id, 'missing_payment_account_coa_mapping'); continue; }
    const contra = mappingFor(tx, policy);
    if (!contra) { block('transaction', tx.id, 'missing_or_invalid_accounting_treatment'); continue; }
    const period = dayPeriod(tx.business_date, policy);
    if (!period) { block('transaction', tx.id, 'fiscal_period_missing_or_overlapping'); continue; }
    if (cashCoa === contra.coa_account_id) {
      block('transaction', tx.id, 'cash_and_contra_accounts_identical'); continue;
    }
    const revision = sha256(canonical(tx));
    candidates.push(journal('transaction', tx.id, tx.business_date, period,
      cashCoa, contra.coa_account_id, cashEffect, n, source, revision));
    increment(accountProposed, tx.account_id, cashEffect);
  }
  for (const tr of snapshot.account_transfers) {
    const n = numericMinor(tr.amount, 'transfer amount');
    if (tr.status !== 'ACTIVE') {
      block('transfer', tr.id, 'nonactive_transfer_requires_history_policy'); continue;
    }
    increment(accountExpected, tr.from_account_id, -n);
    increment(accountExpected, tr.to_account_id, n);
    const from = accountMapping(policy, tr.from_account_id);
    const to = accountMapping(policy, tr.to_account_id);
    if (!from || !to) {
      block('transfer', tr.id, 'missing_payment_account_coa_mapping'); continue;
    }
    const period = dayPeriod(tr.date, policy);
    if (!period) { block('transfer', tr.id, 'fiscal_period_missing_or_overlapping'); continue; }
    if (from === to) { block('transfer', tr.id, 'source_accounts_collapsed'); continue; }
    const revision = sha256(canonical(tr));
    // Credit old cash/bank; debit new cash/bank, never P&L.
    candidates.push(journal('transfer', tr.id, tr.date, period, from, to, -1n,
      n, source, revision));
    increment(accountProposed, tr.from_account_id, -n);
    increment(accountProposed, tr.to_account_id, n);
  }
  const openingPending = snapshot.payment_accounts.map(a => ({
    source_account_id: a.id, amount_minor: numericMinorOpening(a.opening_balance).toString(),
  }));
  const sourceAccountCoverage = snapshot.payment_accounts.map(a => ({
    source_account_id: a.id,
    expected_activity_minor: (accountExpected.get(a.id) || 0n).toString(),
    proposed_activity_minor: (accountProposed.get(a.id) || 0n).toString(),
    unconverted_activity_minor: ((accountExpected.get(a.id) || 0n)
      - (accountProposed.get(a.id) || 0n)).toString(),
  }));
  const keys = new Set();
  let debit = 0n, credit = 0n;
  for (const cand of candidates) {
    if (keys.has(cand.intent_key)) throw new Error('Duplicate proposed source intent key');
    keys.add(cand.intent_key);
    if (cand.lines.length !== 2) throw new Error('Unbalanced candidate line count');
    for (const line of cand.lines) {
      const n = minor(line.amount_minor, 'candidate line amount');
      if (n <= 0n) throw new Error('Nonpositive candidate line');
      if (line.side === 'debit') debit += n;
      else if (line.side === 'credit') credit += n;
      else throw new Error('Unknown candidate side');
    }
  }
  if (debit !== credit) throw new Error('Unbalanced candidate review batch');
  return {
    summary: {
      status: 'UNPOSTED_ACCOUNTING_REVIEW_ONLY',
      source_snapshot_sha256: review.summary.source_snapshot_sha256,
      candidate_journals: candidates.length, exception_records: exceptions.length,
      quarantined_fixture_transactions: fixtures, historical_void_transactions: voids,
      repeated_entries_individually_reviewed: reviewedRepeatCandidates,
      pending_cloud_drafts: snapshot.transaction_drafts.length,
      opening_account_rows_unposted: openingPending.length,
      preview_debits_minor: debit.toString(), preview_credits_minor: credit.toString(),
      accounts_with_unconverted_activity: sourceAccountCoverage.filter(x =>
        x.unconverted_activity_minor !== '0').length,
      posting_allowed: false, erp_books_updated: false,
      source_company_merged: false, externally_verified_cash_bank: false,
    },
    candidates, exceptions, opening_balances_not_posted: openingPending,
    source_account_coverage: sourceAccountCoverage,
  };
}
function numericMinorOpening(v) {
  if (typeof v !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(v)) {
    throw new Error('Invalid exact source opening balance');
  }
  const neg = v.startsWith('-'), [major, rest = ''] = (neg ? v.slice(1) : v).split('.');
  const n = BigInt(major) * 100n + BigInt(rest.padEnd(2, '0') || '0');
  return neg ? -n : n;
}

async function cli(args) {
  const opts = {};
  if (args.length % 2) throw new Error('Expected paired CLI arguments');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--snapshot', '--policy', '--out'].includes(args[i]) || opts[args[i]] || !args[i + 1]) {
      throw new Error('Usage: --snapshot PRIVATE.json --policy REVIEW.json --out PRIVATE.json');
    }
    opts[args[i]] = args[i + 1];
  }
  if (!opts['--snapshot'] || !opts['--policy'] || !opts['--out']) {
    throw new Error('Private snapshot, review policy and output path required');
  }
  const [snapshot, policy] = await Promise.all([
    readFile(resolve(opts['--snapshot']), 'utf8').then(JSON.parse),
    readFile(resolve(opts['--policy']), 'utf8').then(JSON.parse),
  ]);
  const result = planLegacyJournalDryRun(snapshot, policy);
  await writePrivateSnapshot(opts['--out'], result);
  // Never log journal-level source IDs, personal text or accounts.
  console.log(JSON.stringify(result.summary, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    console.error('AQVORA journal dry-run refused: ' + error.message);
    process.exitCode = 1;
  });
}
