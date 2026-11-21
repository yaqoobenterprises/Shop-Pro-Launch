import { describe, expect, it } from 'vitest';
import { planLegacyJournalDryRun } from '../scripts/aqvora_legacy_journal_dry_run.mjs';
import { reconcileLegacySourceSnapshot } from '../scripts/aqvora_legacy_source_reconcile.mjs';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CASH = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BANK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRINT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HOME = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PAPER = '99999999-9999-4999-8999-999999999999';
const CASH_COA = '11111111-1111-4111-8111-111111111111';
const BANK_COA = '22222222-2222-4222-8222-222222222222';
const REVENUE_COA = '33333333-3333-4333-8333-333333333333';
const EXPENSE_COA = '44444444-4444-4444-8444-444444444444';
const DRAWING_COA = '55555555-5555-4555-8555-555555555555';
const LIABILITY_COA = '66666666-6666-4666-8666-666666666666';
const PERIOD = '77777777-7777-4777-8777-777777777777';
const trId = '88888888-8888-4888-8888-888888888888';
const txId = (n: number) => '12345678-1234-4234-8234-' + String(n).padStart(12, '0');
const entryId = (n: number) => '23456789-2345-4345-8345-' + String(n).padStart(12, '0');
const auditId = (n: number) => '34567890-3456-4456-8456-' + String(n).padStart(12, '0');
type Row = Record<string, unknown>;
type Snapshot = Record<string, unknown> & {
  transactions: Row[]; payment_accounts: Row[]; account_ledger_entries: Row[];
  account_transfers: Row[]; audit_log: Row[]; categories: Row[]; transaction_drafts: Row[];
};
function snapshot(): Snapshot {
  const tx = (n: number, type: string, amount: string, category: string,
    raw: string, status = 'active') => ({
    id: txId(n), organization_id: ORG, account_id: CASH, category_id: category,
    amount_paisa: amount, type, status, business_date: '2026-11-19', raw_text: raw,
    idempotency_key: 'synthetic-' + n, account_posted: true,
    voided_at: status === 'voided' ? '2026-11-20 10:00:00+00' : null,
    void_reason: status === 'voided' ? 'correction' : null,
  });
  const entry = (n: number, account_id: string, amount: string, entry_type: string,
    transaction_id: string | null = null, transfer_id: string | null = null) => ({
    id: entryId(n), organization_id: ORG, account_id, amount_paisa: amount, entry_type,
    transaction_id, transfer_id, balance_after_paisa: '0', business_date: '2026-11-19',
  });
  return {
    schema_version: 1, organization_id: ORG, source_project_ref: 'test-source-project',
    currency: 'PKR',
    transactions: [
      tx(1, 'income', '300', PRINT, 'PRINT 3'),
      tx(2, 'expense', '70', HOME, 'HOME 0.70'),
      tx(3, 'income', '50', PRINT, 'Cancelled sale', 'voided'),
      tx(4, 'income', '120', PRINT, 'Edited sale'),
      tx(5, 'income', '20', PRINT, 'Copy 20'),
      tx(6, 'income', '20', PRINT, 'Copy 20'),
      tx(7, 'income', '100', PRINT, 'shop_pro_pagination_test 0001'),
      tx(8, 'expense', '100', PAPER, 'shop_pro_pagination_test 0002'),
    ],
    payment_accounts: [
      { id: CASH, organization_id: ORG, name: 'Cash', type: 'CASH',
        opening_balance: '0.00', current_balance: '1.90', balance_paisa: '190' },
      { id: BANK, organization_id: ORG, name: 'UBL', type: 'BANK',
        opening_balance: '0.00', current_balance: '2.00', balance_paisa: '200' },
    ],
    account_ledger_entries: [
      entry(1, CASH, '300', 'INCOME', txId(1)),
      entry(2, CASH, '-70', 'EXPENSE', txId(2)),
      entry(3, CASH, '50', 'INCOME', txId(3)),
      entry(4, CASH, '-50', 'REVERSAL', txId(3)),
      entry(5, CASH, '100', 'INCOME', txId(4)),
      entry(6, CASH, '-100', 'REVERSAL', txId(4)),
      entry(7, CASH, '120', 'INCOME', txId(4)),
      entry(8, CASH, '20', 'INCOME', txId(5)),
      entry(9, CASH, '20', 'INCOME', txId(6)),
      entry(10, CASH, '100', 'INCOME', txId(7)),
      entry(11, CASH, '-100', 'EXPENSE', txId(8)),
      entry(12, CASH, '-200', 'TRANSFER_OUT', null, trId),
      entry(13, BANK, '200', 'TRANSFER_IN', null, trId),
    ],
    account_transfers: [{ id: trId, organization_id: ORG,
      from_account_id: CASH, to_account_id: BANK, amount: '2.00',
      date: '2026-11-19', status: 'ACTIVE', account_posted: true }],
    audit_log: [
      { id: auditId(1), organization_id: ORG, transaction_id: txId(3), action: 'void' },
      { id: auditId(2), organization_id: ORG, transaction_id: txId(4), action: 'edit' },
    ],
    categories: [
      { id: PRINT, organization_id: ORG, kind: 'income' },
      { id: HOME, organization_id: ORG, kind: 'expense' },
      { id: PAPER, organization_id: ORG, kind: 'expense' },
    ],
    transaction_drafts: [{ id: auditId(3), organization_id: ORG,
      type: 'expense', amount_paisa: '500', idempotency_key: 'draft-only' }],
  };
}
function policyFor(s: Snapshot) {
  const rec = reconcileLegacySourceSnapshot(s, 'test-source');
  if (!rec.summary.ledger_source_reconciled) throw new Error('Synthetic source fixture invalid');
  return {
    review_mode: 'dry_run_only', source_key: 'test-source',
    source_project_ref: 'test-source-project', source_organization_id: ORG,
    target_company_id: TARGET, currency: 'PKR', minor_unit_exponent: 2,
    expected_source_sha256: rec.summary.source_snapshot_sha256,
    payment_accounts: {
      [CASH]: { coa_account_id: CASH_COA, account_class: 'ASSET' },
      [BANK]: { coa_account_id: BANK_COA, account_class: 'ASSET' },
    },
    categories: {
      [PRINT]: { coa_account_id: REVENUE_COA, account_class: 'REVENUE', treatment: 'earned_revenue' },
      [HOME]: { coa_account_id: DRAWING_COA, account_class: 'EQUITY', treatment: 'owner_drawing' },
      [PAPER]: { coa_account_id: EXPENSE_COA, account_class: 'EXPENSE', treatment: 'operating_expense' },
    },
    periods: [{ period_id: PERIOD, start: '2026-01-01', end: '2026-12-31' }],
    duplicate_reviewed_source_ids: [] as string[],
  };
}

describe('AQVORA unposted historical double-entry simulation', () => {
  it('generates balanced cash income, owner drawing and cash-bank transfer proposals', () => {
    const s = snapshot(), policy = policyFor(s);
    const result = planLegacyJournalDryRun(s, policy);
    expect(result.summary.candidate_journals).toBe(3);
    expect(result.summary.preview_debits_minor).toBe('570');
    expect(result.summary.preview_credits_minor).toBe('570');
    expect(result.candidates.every((x: {lines: unknown[]}) => x.lines.length === 2)).toBe(true);
    expect(result.candidates[0].lines).toEqual([
      {side: 'debit', coa_account_id: CASH_COA, amount_minor: '300'},
      {side: 'credit', coa_account_id: REVENUE_COA, amount_minor: '300'},
    ]);
    expect(result.candidates[1].lines[0].coa_account_id).toBe(DRAWING_COA);
    expect(result.candidates[2].lines).toEqual([
      {side: 'debit', coa_account_id: BANK_COA, amount_minor: '200'},
      {side: 'credit', coa_account_id: CASH_COA, amount_minor: '200'},
    ]);
    expect(result.summary.erp_books_updated).toBe(false);
    expect(result.summary.posting_allowed).toBe(false);
    expect(result.summary.source_company_merged).toBe(false);
    expect(result.summary.externally_verified_cash_bank).toBe(false);
  });

  it('retains voids, corrections, fixture quarantine and repeat review exceptions', () => {
    const s = snapshot(), report = planLegacyJournalDryRun(s, policyFor(s));
    expect(report.summary.exception_records).toBe(6);
    expect(report.summary.historical_void_transactions).toBe(1);
    expect(report.summary.quarantined_fixture_transactions).toBe(2);
    expect(report.summary.pending_cloud_drafts).toBe(1);
    expect(report.summary.accounts_with_unconverted_activity).toBe(1);
    expect(report.source_account_coverage[0].expected_activity_minor).toBe('190');
    expect(report.source_account_coverage[0].proposed_activity_minor).toBe('30');
    expect(report.source_account_coverage[0].unconverted_activity_minor).toBe('160');
    expect(report.candidates.some((c: {source_id: string}) => c.source_id === txId(4))).toBe(false);
    expect(report.candidates.some((c: {source_id: string}) => c.source_id === txId(7))).toBe(false);
  });

  it('allows reviewed identical signatures separately without auto-deduplication', () => {
    const s = snapshot(), p = policyFor(s);
    p.duplicate_reviewed_source_ids = [txId(5), txId(6)];
    const report = planLegacyJournalDryRun(s, p);
    expect(report.summary.candidate_journals).toBe(5);
    expect(report.summary.repeated_entries_individually_reviewed).toBe(2);
    const repeats = report.candidates.filter((c: {source_id: string}) =>
      c.source_id === txId(5) || c.source_id === txId(6));
    expect(new Set(repeats.map((c: {intent_key: string}) => c.intent_key)).size).toBe(2);
  });

  it('treats agency collections as LIABILITY rather than invented gross revenue', () => {
    const s = snapshot(), p = policyFor(s);
    p.categories[PRINT] = { coa_account_id: LIABILITY_COA, account_class: 'LIABILITY',
      treatment: 'agency_collection' };
    const result = planLegacyJournalDryRun(s, p);
    expect(result.candidates[0].lines[1].coa_account_id).toBe(LIABILITY_COA);
    expect(result.candidates[0].lines[1].coa_account_id).not.toBe(REVENUE_COA);
  });

  it('blocks unknown/misclassified categories and unsafe missing fiscal periods', () => {
    const s = snapshot(), p = policyFor(s);
    p.categories[PRINT] = { coa_account_id: REVENUE_COA, account_class: 'EXPENSE',
      treatment: 'earned_revenue' };
    p.periods = [];
    const result = planLegacyJournalDryRun(s, p);
    expect(result.summary.candidate_journals).toBe(0);
    expect(result.summary.exception_records).toBe(9);
    expect(result.summary.posting_allowed).toBe(false);
  });

  it('refuses source hash drift, unverified source books, or mismatched target policy', () => {
    const s = snapshot(), p = policyFor(s);
    p.expected_source_sha256 = 'old-fingerprint';
    expect(() => planLegacyJournalDryRun(s, p)).toThrow(/drift/);
    const s2 = snapshot(), p2 = policyFor(s2);
    s2.account_ledger_entries[0].amount_paisa = '301';
    expect(() => planLegacyJournalDryRun(s2, p2)).toThrow(/reconciliation failed/);
    const s3 = snapshot(), p3 = policyFor(s3);
    p3.source_organization_id = TARGET;
    expect(() => planLegacyJournalDryRun(s3, p3)).toThrow(/identity/);
  });

  it('prevents silent collapsing of two source bank/cash accounts into one ERP account', () => {
    const s = snapshot(), p = policyFor(s);
    p.payment_accounts[BANK].coa_account_id = CASH_COA;
    expect(() => planLegacyJournalDryRun(s, p)).toThrow(/collapse/);
  });

  it('produces deterministic idempotent proposed IDs with exact minor-unit strings', () => {
    const s = snapshot(), p = policyFor(s);
    const first = planLegacyJournalDryRun(s, p);
    const second = planLegacyJournalDryRun(s, p);
    expect(first.candidates).toEqual(second.candidates);
    expect(new Set(first.candidates.map((c: {intent_key: string}) => c.intent_key)).size)
      .toBe(first.candidates.length);
    expect(first.candidates[0].source_revision_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.opening_balances_not_posted).toHaveLength(2);
    expect(first.summary.opening_account_rows_unposted).toBe(2);
  });
});
