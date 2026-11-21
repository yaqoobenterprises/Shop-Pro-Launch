/**
 * AQVORA legacy Cashbook CSV preflight.
 * Read-only and fail-closed: NO SQL, HTTP, Supabase client or ERP journal writer.
 * User exports are private local inputs, never committed to Git.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER = ['ID', 'Business Date', 'Device Time', 'Type', 'Category',
  'Amount (PKR)', 'Raw Text', 'Status', 'Void Reason', 'Created By'];
const TYPES = new Set(['income', 'expense', 'capital_in', 'withdrawal', 'adjustment', 'investment']);
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SPECIAL_POLICY = /^(etc|home|ticket|legal stamp paper|rent agreement|sale agreement)$/i;
const TEST_PREFIX = /^shop_pro_pagination_test\b/i;

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function parseCashbookCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('CSV input is empty');
  const input = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const emitField = () => { row.push(field); field = ''; closed = false; };
  const emitRow = () => {
    emitField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else { quoted = false; closed = true; }
      } else { field += c; }
    } else if (c === '"') {
      if (field || closed) throw new Error('Malformed CSV quoting');
      quoted = true;
    } else if (c === ',') { emitField(); }
    else if (c === '\n' || c === '\r') {
      emitRow();
      if (c === '\r' && input[i + 1] === '\n') i += 1;
    } else {
      if (closed && c !== ' ' && c !== '\t') throw new Error('Malformed CSV after closing quote');
      field += c;
    }
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  if (row.length > 0 || field !== '') emitRow();
  const header = rows.shift();
  if (!header || header.length !== HEADER.length || HEADER.some((name, i) => header[i] !== name)) {
    throw new Error('CSV columns do not match the expected Shop Pro export');
  }
  return rows.map((fields, index) => {
    if (fields.length !== HEADER.length) throw new Error('CSV width mismatch at row ' + (index + 2));
    return Object.fromEntries(HEADER.map((key, i) => [key, fields[i]]));
  });
}

export function pkrToMinorString(input) {
  const value = String(input).trim();
  const match = value.match(/^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Invalid exact PKR amount: ' + value);
  const major = BigInt(match[1].replace(/,/g, ''));
  const minor = major * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (minor <= 0n) throw new Error('Amount must be strictly positive');
  return minor.toString();
}

function isoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid business date');
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar day');
  }
  return value;
}

function reviewReason(record) {
  if (TEST_PREFIX.test(record.rawText.trim())) return 'quarantined_test_fixture';
  if (record.status === 'voided') return 'historical_void_preserve';
  if (!record.category.trim()) return 'missing_category';
  if (SPECIAL_POLICY.test(record.category.trim())) return 'accounting_policy_review';
  return 'missing_authoritative_account_and_cash_evidence';
}

export function reviewCashbookExport(rows, sourceKey) {
  if (!/^[a-z][a-z0-9_-]{2,80}$/.test(sourceKey || '')) {
    throw new Error('An explicit safe source namespace is required');
  }
  if (!Array.isArray(rows)) throw new Error('Expected parsed CSV rows');
  const seenIds = new Set(), signatures = new Map();
  const totals = { income: 0n, expense: 0n, capital_in: 0n,
    withdrawal: 0n, adjustment: 0n, investment: 0n };
  const counts = { active: 0, voided: 0, quarantined_test_fixture: 0 };
  const reasons = {}, monthly = {};
  const manifest = rows.map((source, index) => {
    const id = String(source.ID || '').toLowerCase();
    if (!UUID.test(id) || seenIds.has(id)) throw new Error('Missing/duplicate/invalid ID at row ' + (index + 2));
    seenIds.add(id);
    const date = isoDay(String(source['Business Date'] || ''));
    const type = String(source.Type || '');
    const status = String(source.Status || '');
    if (!TYPES.has(type) || !['active', 'voided'].includes(status)) {
      throw new Error('Unsupported type/status at row ' + (index + 2));
    }
    const minor = pkrToMinorString(source['Amount (PKR)']);
    const category = String(source.Category || '');
    const rawText = String(source['Raw Text'] || '');
    const deviceTime = String(source['Device Time'] || '');
    if (!rawText.trim() || !/Z$|[+-]\d{2}:\d{2}$/.test(deviceTime) ||
        Number.isNaN(Date.parse(deviceTime))) {
      throw new Error('Missing description or invalid device timestamp at row ' + (index + 2));
    }
    const row = {
      source_key: sourceKey, source_kind: 'cashbook_transaction', source_id: id,
      migration_intent_key: 'legacy:' + sourceKey + ':' + id,
      business_date: date, device_time: deviceTime, type, status,
      amount_minor: minor, category, raw_text: rawText,
      void_reason: String(source['Void Reason'] || ''),
      created_by_label: String(source['Created By'] || ''),
    };
    const reason = reviewReason({ category, rawText, status });
    row.review_state = reason;
    row.source_sha256 = sha256(JSON.stringify(row));
    reasons[reason] = (reasons[reason] || 0) + 1;
    counts[status] += 1;
    if (reason === 'quarantined_test_fixture') counts.quarantined_test_fixture += 1;
    if (status === 'active' && reason !== 'quarantined_test_fixture') totals[type] += BigInt(minor);
    if (!monthly[date.slice(0, 7)]) monthly[date.slice(0, 7)] = { active: 0, voided: 0 };
    monthly[date.slice(0, 7)][status] += 1;
    const signature = [date, type, minor, rawText.trim().toLowerCase().replace(/\s+/g, ' ')].join('|');
    const ids = signatures.get(signature) || [];
    ids.push(id);
    signatures.set(signature, ids);
    return row;
  });
  const duplicates = [...signatures.values()].filter(ids => ids.length > 1);
  const fingerprint = sha256(manifest.map(item => [
    item.source_key, item.source_id, item.business_date, item.type,
    item.amount_minor, item.status, item.source_sha256,
  ].join('|')).sort().join('\n'));
  return {
    summary: {
      format_version: 1, source_key: sourceKey, currency: 'PKR', minor_unit_exponent: 2,
      total_rows: manifest.length, ...counts,
      review_reasons: reasons, months: monthly,
      active_nonfixture_minor_by_type: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, v.toString()])),
      identical_transaction_signature_groups: duplicates.length,
      identical_transaction_signature_rows: duplicates.reduce((sum, ids) => sum + ids.length, 0),
      source_manifest_sha256: fingerprint,
      status: 'REVIEW_ONLY_NOT_V2_POSTED',
      posting_allowed: false, bank_reconciled: false,
      missing_authoritative_sources: [
        'organization_id', 'payment_account_id', 'original idempotency key',
        'opening balances', 'transfers', 'account ledger events', 'audit edits',
        'device IndexedDB offline queues', 'approved CoA', 'currency policy',
        'legal company mapping', 'fiscal periods', 'source receipt evidence',
        'isolated staging backup/restore and approval',
      ],
    },
    // PRIVATE manifest: contains user-provided identifiers and original text.
    manifest,
    repeated_signature_source_ids: duplicates,
    proposed_erp_journals: [], // Never infer or post source entries from this CSV alone.
  };
}

async function runCli(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--csv', '--source', '--out', '--expected-count'].includes(args[i]) || !args[i + 1]) {
      throw new Error('Usage: node scripts/aqvora_legacy_csv_review.mjs --csv PATH --source SOURCE_KEY [--expected-count N] [--out PRIVATE_PATH]');
    }
    options[args[i]] = args[i + 1];
  }
  if (!options['--csv'] || !options['--source']) throw new Error('CSV and source are required');
  const rows = parseCashbookCsv(await readFile(resolve(options['--csv']), 'utf8'));
  if (options['--expected-count'] && String(rows.length) !== options['--expected-count']) {
    throw new Error('CSV row-count mismatch; abort review');
  }
  const report = reviewCashbookExport(rows, options['--source']);
  if (options['--out']) {
    await writeFile(resolve(options['--out']), JSON.stringify(report, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  }
  // STDOUT contains aggregate-only summary, never user names or raw transactions.
  console.log(JSON.stringify(report.summary, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error('AQVORA read-only preflight failed: ' + error.message);
    process.exitCode = 1;
  });
}
