import { describe, expect, it } from 'vitest';
import { reconcileLegacySourceSnapshot } from '../scripts/aqvora_legacy_source_reconcile.mjs';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CASH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BANK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CAT_EXP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const txId = (n: number) => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const entryId = (n: number) => '22222222-2222-4222-8222-' + String(n).padStart(12, '0');
const trId = txId(99);
const auditId = (n: number) => '33333333-3333-4333-8333-' + String(n).padStart(12, '0');

type RecordRow = Record<string, unknown>;
type Snapshot = {
  schema_version: number; organization_id: string; currency: string;
  payment_accounts: RecordRow[]; transactions: RecordRow[];
  account_transfers: RecordRow[]; account_ledger_entries: RecordRow[];
  audit_log: RecordRow[]; categories: RecordRow[]; transaction_drafts: RecordRow[];
};
function sample(): Snapshot {
  const tx = (n: number, type: string, amount: string, status: string, raw: string) => ({
    id: txId(n), organization_id: ORG, account_id: CASH,
    category_id: type === 'expense' ? CAT_EXP : CAT, type, amount_paisa: amount, status,
    account_posted: true,
    business_date: '2026-11-19', raw_text: raw, idempotency_key: 'key-' + n,
    voided_at: status === 'voided' ? '2026-11-20T00:00:00Z' : null,
    void_reason: status === 'voided' ? 'correction' : null,
  });
  const entry = (n: number, account_id: string, amount: string, type: string,
    transaction_id: string | null = null, transfer_id: string | null = null) => ({
    id: entryId(n), organization_id: ORG, account_id, transaction_id,
    transfer_id, amount_paisa: amount, entry_type: type,
    balance_after_paisa: '0', business_date: '2026-11-19',
  });
  return {
    schema_version: 1, organization_id: ORG, currency: 'PKR',
    payment_accounts: [
      { id: CASH, organization_id: ORG, name: 'Cash Wallet', type: 'CASH',
        opening_balance: '10.00', current_balance: '11.50', balance_paisa: '1150' },
      { id: BANK, organization_id: ORG, name: 'Bank Wallet', type: 'BANK',
        opening_balance: '0.00', current_balance: '2.00', balance_paisa: '200' },
    ],
    transactions: [
      tx(1, 'income', '300', 'active', 'Print 3.00'),
      tx(2, 'expense', '70', 'active', 'Paper 0.70'),
      tx(3, 'income', '50', 'voided', 'Lamination voided'),
      tx(4, 'income', '120', 'active', 'Corrected sale 1.20'),
    ],
    account_transfers: [
      { id: trId, organization_id: ORG, from_account_id: CASH,
        to_account_id: BANK, amount: '2.00', status: 'ACTIVE', account_posted: true },
    ],
    account_ledger_entries: [
      entry(1, CASH, '1000', 'OPENING_BALANCE'),
      entry(2, CASH, '300', 'INCOME', txId(1)),
      entry(3, CASH, '-70', 'EXPENSE', txId(2)),
      entry(4, CASH, '50', 'INCOME', txId(3)),
      entry(5, CASH, '-50', 'REVERSAL', txId(3)),
      entry(6, CASH, '100', 'INCOME', txId(4)),
      entry(7, CASH, '-100', 'REVERSAL', txId(4)),
      entry(8, CASH, '120', 'INCOME', txId(4)),
      entry(9, CASH, '-200', 'TRANSFER_OUT', null, trId),
      entry(10, BANK, '200', 'TRANSFER_IN', null, trId),
    ],
    audit_log: [
      { id: auditId(1), organization_id: ORG, transaction_id: txId(3), action: 'void' },
      { id: auditId(2), organization_id: ORG, transaction_id: txId(4), action: 'edit' },
    ],
    categories: [
      { id: CAT, organization_id: ORG, name: 'Printing', kind: 'income' },
      { id: CAT_EXP, organization_id: ORG, name: 'Supplies', kind: 'expense' },
    ],
    transaction_drafts: [{ id: auditId(3), organization_id: ORG, amount_paisa: '75',
      type: 'expense', idempotency_key: 'draft-private' }],
  };
}

describe('AQVORA source account-ledger reconciliation (pure local, NO posting)', () => {
  it('reconciles signed cashbook events, reversal/edit and both transfer legs exactly', () => {
    const report = reconcileLegacySourceSnapshot(sample(), 'legacy-shop-one');
    expect(report.summary.transaction_rows).toBe(4);
    expect(report.summary.account_ledger_rows).toBe(10);
    expect(report.summary.transfers_with_valid_legs).toBe(1);
    expect(report.summary.edited_transactions).toBe(1);
    expect(report.summary.voided_transactions).toBe(1);
    expect(report.summary.cloud_drafts_excluded).toBe(1);
    expect(report.summary.recorded_account_total_minor).toBe('1350');
    expect(report.summary.opening_balances_minor).toBe('1000');
    expect(report.summary.after_opening_cashbook_movement_minor).toBe('350');
    expect(report.summary.expected_transaction_movement_minor).toBe('350');
    expect(report.summary.ledger_source_reconciled).toBe(true);
    expect(report.summary.erp_posting_allowed).toBe(false);
    expect(report.proposed_erp_journals).toEqual([]);
    expect(JSON.stringify(report.summary)).not.toContain('Cash Wallet');
  });

  it('detects an account balance modified without a corresponding ledger entry', () => {
    const input = sample();
    input.payment_accounts[0].balance_paisa = '1151';
    const result = reconcileLegacySourceSnapshot(input, 'legacy-shop-one');
    expect(result.summary.ledger_source_reconciled).toBe(false);
    expect(result.summary.issue_counts.account_balance_disagrees_with_ledger).toBe(1);
    expect(result.summary.erp_posting_allowed).toBe(false);
  });

  it('detects missing edit reversal and transfer legs separately', () => {
    const input = sample();
    input.account_ledger_entries = input.account_ledger_entries.filter(x =>
      x.id !== entryId(7) && x.id !== entryId(10));
    const report = reconcileLegacySourceSnapshot(input, 'legacy-shop-one');
    expect(report.summary.issue_counts.transaction_cash_delta_mismatch).toBe(1);
    expect(report.summary.issue_counts.unbalanced_transfer_legs).toBe(1);
    expect(report.summary.ledger_source_reconciled).toBe(false);
  });

  it('rejects any cross-tenant collection record or duplicated ID', () => {
    const a = sample();
    a.transactions[0].organization_id = OTHER;
    expect(() => reconcileLegacySourceSnapshot(a, 'legacy-shop-one')).toThrow(/Cross-tenant/);
    const b = sample();
    b.account_ledger_entries.push({ ...b.account_ledger_entries[0] });
    expect(() => reconcileLegacySourceSnapshot(b, 'legacy-shop-one')).toThrow(/Duplicate/);
  });

  it('requires all seven source collections and precise minor-unit string amounts', () => {
    const a = sample();
    delete (a as unknown as Record<string, unknown>).audit_log;
    expect(() => reconcileLegacySourceSnapshot(a, 'legacy-shop-one')).toThrow(/mandatory full collection/);
    const b = sample();
    b.transactions[0].amount_paisa = 300;
    expect(() => reconcileLegacySourceSnapshot(b, 'legacy-shop-one')).toThrow(/exact integer/);
    const c = sample();
    c.account_transfers[0].amount = '2.005';
    expect(() => reconcileLegacySourceSnapshot(c, 'legacy-shop-one')).toThrow(/decimal/);
  });

  it('preserves tagged fixture entries in source proof and never claims ERP posting', () => {
    const a = sample();
    a.transactions[0].raw_text = 'shop_pro_pagination_test | income | 0001';
    const report = reconcileLegacySourceSnapshot(a, 'legacy-shop-one');
    expect(report.summary.fixture_tagged_rows).toBe(1);
    expect(report.summary.transaction_rows).toBe(4);
    expect(report.summary.ledger_source_reconciled).toBe(true);
    expect(report.summary.status).toBe('SOURCE_RECONCILED_NOT_ERP_MIGRATED');
  });

  it('separately flags void audit gaps, duplicate keys and duplicate account names', () => {
    const a = sample();
    a.audit_log = a.audit_log.filter(x => x.action !== 'void');
    a.transactions[1].idempotency_key = 'key-1';
    a.payment_accounts[1].name = 'Cash Wallet';
    a.payment_accounts[1].type = 'CASH';
    const report = reconcileLegacySourceSnapshot(a, 'legacy-shop-one');
    expect(report.summary.issue_counts.void_without_complete_audit).toBe(1);
    expect(report.summary.issue_counts.duplicate_transaction_idempotency_key).toBe(1);
    expect(report.summary.repeated_account_name_groups).toBe(1);
    expect(report.summary.ledger_source_reconciled).toBe(false);
  });

  it('requires separate source namespaces and preserves a deterministic snapshot fingerprint', () => {
    const a = reconcileLegacySourceSnapshot(sample(), 'legacy-shop-one');
    const b = reconcileLegacySourceSnapshot(sample(), 'legacy-shop-two');
    expect(a.summary.source_snapshot_sha256).toBe(b.summary.source_snapshot_sha256);
    expect(a.summary.source_key).not.toBe(b.summary.source_key);
    expect(a.summary.source_snapshot_sha256).toBe(
      reconcileLegacySourceSnapshot(sample(), 'legacy-shop-one').summary.source_snapshot_sha256);
    expect(() => reconcileLegacySourceSnapshot(sample(), '../unsafe')).toThrow(/namespace/);
  });

  it('flags stale account posting status and category accounting mismatches', () => {
    const a = sample();
    a.transactions[0].account_posted = false;
    a.transactions[1].category_id = CAT;
    a.account_transfers[0].account_posted = false;
    const report = reconcileLegacySourceSnapshot(a, 'legacy-shop-one');
    expect(report.summary.issue_counts.transaction_missing_legacy_posting_status).toBe(1);
    expect(report.summary.issue_counts.transaction_category_kind_mismatch).toBe(1);
    expect(report.summary.issue_counts.transfer_missing_legacy_posting_status).toBe(1);
    expect(report.summary.erp_posting_allowed).toBe(false);
  });

  it('has a canonical fingerprint independent of source JSON property and collection order', () => {
    const a = sample();
    const b = sample();
    b.transactions.reverse();
    b.payment_accounts[0] = Object.fromEntries(Object.entries(b.payment_accounts[0]).reverse());
    expect(reconcileLegacySourceSnapshot(a, 'legacy-shop-one').summary.source_snapshot_sha256)
      .toBe(reconcileLegacySourceSnapshot(b, 'legacy-shop-one').summary.source_snapshot_sha256);
  });

  it('detects independent opening-balance evidence disagreement', () => {
    const a = sample();
    a.payment_accounts[0].opening_balance = '11.00';
    const report = reconcileLegacySourceSnapshot(a, 'legacy-shop-one');
    expect(report.summary.issue_counts.account_opening_disagrees_with_ledger).toBe(1);
    expect(report.summary.erp_posting_allowed).toBe(false);
  });
});
