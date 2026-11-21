/**
 * Cashbook source accounting preflight. PRIVATE snapshot in, aggregate-only report out.
 * Never connects to production, mutates records, or creates ERP journals.
 * Source snapshot version 1 must be exported via independently authorized read-only access.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const COLLECTIONS = ['transactions', 'payment_accounts', 'account_ledger_entries',
  'account_transfers', 'audit_log', 'transaction_drafts', 'categories'];
const SIGNS = { income: 1n, expense: -1n, capital_in: 1n, withdrawal: -1n, investment: 1n };
const sha256 = text => createHash('sha256').update(text).digest('hex');

function integerMinor(value, label) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error(label + ' must be an exact integer minor-unit string');
  }
  return BigInt(value);
}

function majorToMinor(value, label) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(label + ' must be an exact PKR major-unit decimal string');
  }
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  return negative ? -amount : amount;
}

function scopedMap(rows, orgId, name) {
  const map = new Map();
  for (const row of rows) {
    if (!row || !UUID.test(row.id || '') || !UUID.test(row.organization_id || '')) {
      throw new Error(name + ' has missing or invalid source identity');
    }
    if (row.organization_id !== orgId) throw new Error('Cross-tenant ' + name + ' record refused');
    if (map.has(row.id)) throw new Error('Duplicate ' + name + ' source ID');
    map.set(row.id, row);
  }
  return map;
}

function txnEffect(row) {
  if (!['active', 'voided'].includes(row.status)) throw new Error('Unknown transaction status');
  if (row.status === 'voided') return 0n;
  const amount = integerMinor(row.amount_paisa, 'transaction amount');
  if (amount <= 0n) throw new Error('Invalid positive transaction amount');
  if (row.type === 'adjustment') {
    if (!['in', 'out'].includes(row.adjustment_dir)) throw new Error('Unknown adjustment direction');
    return row.adjustment_dir === 'in' ? amount : -amount;
  }
  if (!(row.type in SIGNS)) throw new Error('Unknown Cashbook transaction type');
  return amount * SIGNS[row.type];
}

function recordIssue(issues, code, sourceId) {
  issues.push({ code, source_id: sourceId }); // PRIVATE detail; stdout never prints identifiers.
}

export function reconcileLegacySourceSnapshot(snapshot, sourceKey) {
  if (!/^[a-z][a-z0-9_-]{2,80}$/.test(sourceKey || '')) throw new Error('Safe source namespace required');
  if (!snapshot || snapshot.schema_version !== 1 || !UUID.test(snapshot.organization_id || '')
      || snapshot.currency !== 'PKR') throw new Error('Unsupported scoped PKR snapshot');
  for (const name of COLLECTIONS) {
    if (!Array.isArray(snapshot[name])) throw new Error('Missing mandatory full collection: ' + name);
  }
  const org = snapshot.organization_id;
  const accountMap = scopedMap(snapshot.payment_accounts, org, 'payment_account');
  const txnMap = scopedMap(snapshot.transactions, org, 'transaction');
  const transferMap = scopedMap(snapshot.account_transfers, org, 'account_transfer');
  const entryMap = scopedMap(snapshot.account_ledger_entries, org, 'account_ledger_entry');
  const auditMap = scopedMap(snapshot.audit_log, org, 'audit_log');
  const draftMap = scopedMap(snapshot.transaction_drafts, org, 'transaction_draft');
  const categoryMap = scopedMap(snapshot.categories, org, 'category');
  const issues = [], warnings = [];
  const byAccount = new Map(), byTransaction = new Map(), byTransfer = new Map();
  const balanceTotals = { displayed: 0n, ledger: 0n, openings: 0n, economic: 0n };
  const ledgerEntries = [...entryMap.values()];
  const postings = [];

  for (const entry of ledgerEntries) {
    const delta = integerMinor(entry.amount_paisa, 'ledger amount');
    if (delta === 0n) throw new Error('Zero-value account ledger entry');
    if (!accountMap.has(entry.account_id)) {
      recordIssue(issues, 'orphan_ledger_account', entry.id);
      continue;
    }
    const hasTxn = entry.transaction_id !== null && entry.transaction_id !== undefined;
    const hasTransfer = entry.transfer_id !== null && entry.transfer_id !== undefined;
    if (Number(hasTxn) + Number(hasTransfer) > 1) {
      recordIssue(issues, 'ledger_multiple_source_links', entry.id);
    } else if (hasTxn) {
      if (!txnMap.has(entry.transaction_id)) recordIssue(issues, 'orphan_ledger_transaction', entry.id);
      const links = byTransaction.get(entry.transaction_id) || [];
      links.push({ ...entry, delta });
      byTransaction.set(entry.transaction_id, links);
    } else if (hasTransfer) {
      if (!transferMap.has(entry.transfer_id)) recordIssue(issues, 'orphan_ledger_transfer', entry.id);
      const links = byTransfer.get(entry.transfer_id) || [];
      links.push({ ...entry, delta });
      byTransfer.set(entry.transfer_id, links);
    } else if (entry.entry_type !== 'OPENING_BALANCE') {
      recordIssue(issues, 'unattributed_nonopening_ledger_entry', entry.id);
    }
    const accountEntries = byAccount.get(entry.account_id) || [];
    accountEntries.push({ ...entry, delta });
    byAccount.set(entry.account_id, accountEntries);
  }

  const auditByTransaction = new Map();
  for (const event of auditMap.values()) {
    if (!txnMap.has(event.transaction_id)) recordIssue(issues, 'orphan_audit_transaction', event.id);
    if (!['edit', 'void', 'restore', 'create'].includes(event.action)) {
      recordIssue(issues, 'unknown_audit_action', event.id);
    }
    const prior = auditByTransaction.get(event.transaction_id) || [];
    prior.push(event);
    auditByTransaction.set(event.transaction_id, prior);
  }

  let fixtureRows = 0, voidedRows = 0, editedTransactions = 0;
  const txnTotals = { activeNet: 0n, entriesNet: 0n };
  for (const tx of txnMap.values()) {
    const amount = integerMinor(tx.amount_paisa, 'transaction amount');
    if (amount <= 0n) throw new Error('Invalid positive transaction amount');
    const expected = txnEffect(tx);
    const entries = byTransaction.get(tx.id) || [];
    const actual = entries.reduce((sum, entry) => sum + entry.delta, 0n);
    if (entries.length === 0) recordIssue(issues, 'transaction_no_ledger_entries', tx.id);
    if (actual !== expected) recordIssue(issues, 'transaction_cash_delta_mismatch', tx.id);
    if (entries.some(entry => entry.account_id !== tx.account_id)) {
      recordIssue(issues, 'transaction_payment_account_changed', tx.id);
    }
    if (!accountMap.has(tx.account_id)) recordIssue(issues, 'orphan_transaction_payment_account', tx.id);
    if (tx.category_id && !categoryMap.has(tx.category_id)) {
      recordIssue(issues, 'orphan_transaction_category', tx.id);
    }
    if (!tx.idempotency_key || typeof tx.idempotency_key !== 'string') {
      recordIssue(issues, 'transaction_missing_idempotency_key', tx.id);
    }
    const history = auditByTransaction.get(tx.id) || [];
    if (tx.status === 'voided') {
      voidedRows++;
      if (!history.some(x => x.action === 'void') || !tx.voided_at || !tx.void_reason) {
        recordIssue(issues, 'void_without_complete_audit', tx.id);
      }
    }
    if (history.some(x => x.action === 'edit')) editedTransactions++;
    if (/^shop_pro_pagination_test\b/i.test(String(tx.raw_text || '').trim())) fixtureRows++;
    txnTotals.activeNet += expected;
    txnTotals.entriesNet += actual;
  }

  let verifiedTransfers = 0;
  for (const tr of transferMap.values()) {
    if (tr.status !== 'ACTIVE') {
      recordIssue(issues, 'transfer_requires_void_reversal_policy', tr.id);
      continue;
    }
    const amount = majorToMinor(tr.amount, 'transfer amount');
    const entries = byTransfer.get(tr.id) || [];
    if (amount <= 0n || tr.from_account_id === tr.to_account_id) {
      recordIssue(issues, 'invalid_transfer_amount_or_accounts', tr.id);
    }
    if (!accountMap.has(tr.from_account_id) || !accountMap.has(tr.to_account_id)) {
      recordIssue(issues, 'orphan_transfer_account', tr.id);
    }
    const valid = entries.length === 2
      && entries.some(x => x.account_id === tr.from_account_id
        && x.entry_type === 'TRANSFER_OUT' && x.delta === -amount)
      && entries.some(x => x.account_id === tr.to_account_id
        && x.entry_type === 'TRANSFER_IN' && x.delta === amount);
    if (!valid) recordIssue(issues, 'unbalanced_transfer_legs', tr.id);
    else verifiedTransfers++;
  }

  const names = new Map();
  for (const a of accountMap.values()) {
    const entries = byAccount.get(a.id) || [];
    const total = entries.reduce((sum, e) => sum + e.delta, 0n);
    const recorded = integerMinor(a.balance_paisa, 'account recorded balance');
    const display = majorToMinor(a.current_balance, 'account display balance');
    const opening = majorToMinor(a.opening_balance, 'opening account balance');
    const ledgerOpening = entries.filter(e => e.entry_type === 'OPENING_BALANCE')
      .reduce((sum, e) => sum + e.delta, 0n);
    if (total !== recorded || display !== recorded) {
      recordIssue(issues, 'account_balance_disagrees_with_ledger', a.id);
    }
    if (opening !== ledgerOpening) recordIssue(issues, 'account_opening_disagrees_with_ledger', a.id);
    const duplicateKey = String(a.type || '') + ':' + String(a.name || '').trim().toLowerCase();
    names.set(duplicateKey, (names.get(duplicateKey) || 0) + 1);
    balanceTotals.displayed += recorded;
    balanceTotals.ledger += total;
    balanceTotals.openings += opening;
  }
  for (const [key, count] of names) {
    if (count > 1) warnings.push({ code: 'duplicate_payment_account_name', key, count });
  }
  balanceTotals.economic = balanceTotals.ledger - balanceTotals.openings;
  if (balanceTotals.economic !== txnTotals.activeNet) {
    recordIssue(issues, 'account_net_disagrees_with_cashbook_after_opening', 'summary');
  }

  const transactionKeys = new Set();
  for (const tx of txnMap.values()) {
    if (tx.idempotency_key && transactionKeys.has(tx.idempotency_key)) {
      recordIssue(issues, 'duplicate_transaction_idempotency_key', tx.id);
    }
    transactionKeys.add(tx.idempotency_key);
  }
  // These match legacy cashbook postings only. Bank reconciliation / ERP posting are separate.
  const contentFingerprint = sha256(COLLECTIONS.flatMap(name =>
    snapshot[name].map(row => name + '|' + row.id + '|' + JSON.stringify(row))
  ).sort().join('\n'));
  return {
    summary: {
      contract_version: 1, source_key: sourceKey, currency: 'PKR',
      transaction_rows: txnMap.size, fixture_tagged_rows: fixtureRows,
      voided_transactions: voidedRows, edited_transactions: editedTransactions,
      audit_events: auditMap.size, cloud_drafts_excluded: draftMap.size,
      payment_accounts: accountMap.size, account_ledger_rows: entryMap.size,
      transfers_with_valid_legs: verifiedTransfers, transfer_rows: transferMap.size,
      repeated_account_name_groups: warnings.length,
      recorded_account_total_minor: balanceTotals.displayed.toString(),
      account_ledger_total_minor: balanceTotals.ledger.toString(),
      opening_balances_minor: balanceTotals.openings.toString(),
      after_opening_cashbook_movement_minor: balanceTotals.economic.toString(),
      expected_transaction_movement_minor: txnTotals.activeNet.toString(),
      linked_transaction_ledger_movement_minor: txnTotals.entriesNet.toString(),
      issue_counts: issues.reduce((counts, item) => {
        counts[item.code] = (counts[item.code] || 0) + 1; return counts;
      }, {}),
      source_snapshot_sha256: contentFingerprint,
      ledger_source_reconciled: issues.length === 0,
      erp_posting_allowed: false,
      external_bank_cash_evidence_verified: false,
      status: issues.length ? 'SOURCE_RECONCILIATION_FAILED' : 'SOURCE_RECONCILED_NOT_ERP_MIGRATED',
    },
    // Sensitive source IDs are included ONLY in the optional private output file.
    issues, warnings, proposed_erp_journals: [],
  };
}

async function cli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--snapshot', '--source', '--out', '--expect-transactions'].includes(argv[i]) || !argv[i + 1]) {
      throw new Error('Usage: node scripts/aqvora_legacy_source_reconcile.mjs --snapshot PRIVATE.json --source name [--expect-transactions N] [--out PRIVATE.json]');
    }
    opts[argv[i]] = argv[i + 1];
  }
  if (!opts['--snapshot'] || !opts['--source']) throw new Error('Snapshot and source required');
  const snapshot = JSON.parse(await readFile(resolve(opts['--snapshot']), 'utf8'));
  const result = reconcileLegacySourceSnapshot(snapshot, opts['--source']);
  if (opts['--expect-transactions'] && Number(opts['--expect-transactions']) !== result.summary.transaction_rows) {
    throw new Error('Live data drift: unexpected transaction count; abort');
  }
  if (opts['--out']) {
    await writeFile(resolve(opts['--out']), JSON.stringify(result, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' });
  }
  console.log(JSON.stringify(result.summary, null, 2));
  if (!result.summary.ledger_source_reconciled) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    console.error('Source reconciliation failed: ' + error.message);
    process.exitCode = 1;
  });
}
