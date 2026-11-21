import { describe, expect, it } from 'vitest';
import { parseCashbookCsv, pkrToMinorString, reviewCashbookExport } from '../scripts/aqvora_legacy_csv_review.mjs';

const HEADER = '"ID","Business Date","Device Time","Type","Category","Amount (PKR)","Raw Text","Status","Void Reason","Created By"';
const make = (id: string, type = 'income', amount = '200.00', raw = 'Print 200',
  status = 'active', category = 'Printing & Photocopy', date = '2026-11-19') =>
  [id, date, '2026-11-19T09:00:00.000+00:00', type, category, amount, raw,
    status, status === 'voided' ? 'cancelled' : '', 'Synthetic Tester']
    .map(value => '"' + value.replace(/"/g, '""') + '"').join(',');
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const ID3 = '33333333-3333-4333-8333-333333333333';

describe('AQVORA historical Cashbook preflight is offline, exact, and non-posting', () => {
  it('parses Shop Pro BOM, CRLF, comma, quotes and multiline CSV cells', () => {
    const text = '\uFEFF' + HEADER + '\r\n' +
      make(ID1, 'income', '200.00', 'Print "A",\nCopy') + '\r\n';
    const rows = parseCashbookCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]['Raw Text']).toBe('Print "A",\nCopy');
    expect(rows[0]['Amount (PKR)']).toBe('200.00');
  });

  it('does exact PKR minor-unit arithmetic and rejects invalid amounts', () => {
    expect(pkrToMinorString('1,234.56')).toBe('123456');
    expect(pkrToMinorString('0.01')).toBe('1');
    expect(pkrToMinorString('999999999999999999999.99')).toBe('99999999999999999999999');
    expect(() => pkrToMinorString('10.005')).toThrow();
    expect(() => pkrToMinorString('0.00')).toThrow();
    expect(() => pkrToMinorString('-20.00')).toThrow();
    expect(() => pkrToMinorString('1,23')).toThrow();
  });

  it('preserves voids, quarantines fixture tags and never creates financial journals', () => {
    const rows = parseCashbookCsv([HEADER,
      make(ID1),
      make(ID2, 'income', '100.00', 'shop_pro_pagination_test | income | 0001'),
      make(ID3, 'expense', '500.00', 'Paper 500', 'voided', 'Paper Stock Purchase'),
    ].join('\n'));
    const report = reviewCashbookExport(rows, 'example-shop');
    expect(report.summary.total_rows).toBe(3);
    expect(report.summary.active).toBe(2);
    expect(report.summary.voided).toBe(1);
    expect(report.summary.quarantined_test_fixture).toBe(1);
    expect(report.summary.active_nonfixture_minor_by_type.income).toBe('20000');
    expect(report.summary.active_nonfixture_minor_by_type.expense).toBe('0');
    expect(report.manifest[1].review_state).toBe('quarantined_test_fixture');
    expect(report.manifest[2].review_state).toBe('historical_void_preserve');
    expect(report.summary.posting_allowed).toBe(false);
    expect(report.summary.bank_reconciled).toBe(false);
    expect(report.proposed_erp_journals).toEqual([]);
  });

  it('requires policy approval for ambiguous categories, account enrichment for all others', () => {
    const rows = parseCashbookCsv([HEADER,
      make(ID1, 'income', '1000', 'Ticket booking', 'active', 'Ticket'),
      make(ID2, 'expense', '50', 'Home costs', 'active', 'Home'),
      make(ID3, 'income', '25', 'Print service', 'active', 'Colour Print'),
    ].join('\n'));
    const report = reviewCashbookExport(rows, 'example-shop');
    expect(report.manifest.map((entry: {review_state: string}) => entry.review_state))
      .toEqual(['accounting_policy_review', 'accounting_policy_review',
        'missing_authoritative_account_and_cash_evidence']);
    expect(report.manifest.every((entry: {review_state: string}) => entry.review_state !== 'approved'))
      .toBe(true);
  });

  it('detects same-description repeat candidates without deleting either', () => {
    const report = reviewCashbookExport(parseCashbookCsv([HEADER,
      make(ID1), make(ID2), make(ID3, 'income', '200.00', 'Another Print 200'),
    ].join('\n')), 'example-shop');
    expect(report.summary.identical_transaction_signature_groups).toBe(1);
    expect(report.summary.identical_transaction_signature_rows).toBe(2);
    expect(report.manifest).toHaveLength(3);
    expect(report.repeated_signature_source_ids[0]).toHaveLength(2);
  });

  it('uses source namespace and ID for deterministic migration intent, not just original ID', () => {
    const rows = parseCashbookCsv([HEADER, make(ID1)].join('\n'));
    const a = reviewCashbookExport(rows, 'company-a');
    const b = reviewCashbookExport(rows, 'company-b');
    expect(a.manifest[0].migration_intent_key).not.toBe(b.manifest[0].migration_intent_key);
    expect(a.summary.source_manifest_sha256).toBe(reviewCashbookExport(rows, 'company-a').summary.source_manifest_sha256);
    expect(a.summary.source_manifest_sha256).not.toBe(b.summary.source_manifest_sha256);
    expect(a.manifest[0].source_sha256).not.toBe(b.manifest[0].source_sha256);
  });

  it('fails closed on corrupted dates, duplicate IDs, missing headers and unknown kinds', () => {
    const normal = [HEADER, make(ID1)].join('\n');
    expect(() => parseCashbookCsv('ID,Amount\n1,2')).toThrow();
    expect(() => parseCashbookCsv(HEADER + '\n"unclosed')).toThrow();
    expect(() => reviewCashbookExport(parseCashbookCsv([normal, make(ID1)].join('\n')), 'company-a')).toThrow(/duplicate/);
    expect(() => reviewCashbookExport(parseCashbookCsv([HEADER,
      make(ID1, 'income', '200', 'A', 'active', 'Colour Print', '2026-02-30'),
    ].join('\n')), 'company-a')).toThrow(/calendar/);
    expect(() => reviewCashbookExport(parseCashbookCsv([HEADER,
      make(ID1, 'other'),
    ].join('\n')), 'company-a')).toThrow(/type/);
    expect(() => reviewCashbookExport(parseCashbookCsv(normal), '../../secret')).toThrow(/namespace/);
  });
});
