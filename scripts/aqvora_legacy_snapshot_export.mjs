/**
 * AQVORA one-UUID source snapshot exporter.
 * It NEVER writes to Postgres; output contains private records, keep outside Git.
 */
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath, writeFile } from 'node:fs/promises';

export const LEGACY_SOURCE_TABLES = Object.freeze([
  'transactions', 'payment_accounts', 'account_ledger_entries',
  'account_transfers', 'audit_log', 'transaction_drafts', 'categories',
]);
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const PROJECT_REF = /^[a-z0-9_-]{8,90}$/;
const ALLOWED = new Set(LEGACY_SOURCE_TABLES);
const INTEGER_MONEY = Object.freeze({
  transactions: ['amount_paisa'], payment_accounts: ['balance_paisa'],
  account_ledger_entries: ['amount_paisa', 'balance_after_paisa'],
  account_transfers: [], audit_log: [],
  transaction_drafts: ['amount_paisa'], categories: ['unusual_amount_limit_paisa'],
});
const DECIMAL_MONEY = Object.freeze({
  payment_accounts: ['current_balance', 'opening_balance'], account_transfers: ['amount'],
});
const DATES = Object.freeze({
  transactions: ['business_date', 'device_entry_time', 'created_at', 'updated_at', 'voided_at'],
  payment_accounts: ['created_at'], account_ledger_entries: ['business_date', 'created_at'],
  account_transfers: ['date', 'created_at', 'voided_at'],
  audit_log: ['created_at'],
  transaction_drafts: ['business_date', 'device_entry_time', 'created_at'],
  categories: ['created_at'],
});
function validateIdentity({ organizationId, sourceProjectRef }) {
  if (!UUID.test(organizationId || '') || !PROJECT_REF.test(sourceProjectRef || '')) {
    throw new Error('A valid organization UUID and source project reference are required');
  }
}
function validateExpected(expectedCounts) {
  if (!expectedCounts || !['transactions', 'payment_accounts', 'account_ledger_entries']
      .every(name => Number.isSafeInteger(expectedCounts[name]) && expectedCounts[name] >= 0)) {
    throw new Error('Expected source transaction/account/ledger counts are mandatory');
  }
  for (const [name, count] of Object.entries(expectedCounts)) {
    if (!ALLOWED.has(name) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid expected source collection count');
    }
  }
}
function validateRows(table, rows, orgId) {
  if (!Array.isArray(rows)) throw new Error('No source records returned for ' + table);
  const ids = new Set();
  for (const row of rows) {
    if (!row || !UUID.test(row.id || '') || row.organization_id !== orgId || ids.has(row.id)) {
      throw new Error('Invalid, duplicated or cross-tenant ' + table + ' record');
    }
    ids.add(row.id);
    for (const col of INTEGER_MONEY[table]) {
      if (row[col] !== null && row[col] !== undefined &&
          (typeof row[col] !== 'string' || !/^-?(0|[1-9]\d*)$/.test(row[col]))) {
        throw new Error('Money precision lost in ' + table + '.' + col);
      }
    }
    for (const col of DECIMAL_MONEY[table] || []) {
      if (typeof row[col] !== 'string' || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(row[col])) {
        throw new Error('Decimal precision lost in ' + table + '.' + col);
      }
    }
    for (const col of DATES[table] || []) {
      if (row[col] !== undefined && row[col] !== null && typeof row[col] !== 'string') {
        throw new Error('Date/time precision lost in ' + table + '.' + col);
      }
    }
  }
}

export async function collectLegacySnapshot(client, { organizationId, sourceProjectRef, expectedCounts }) {
  validateIdentity({ organizationId, sourceProjectRef });
  validateExpected(expectedCounts);
  if (!client || typeof client.query !== 'function') throw new Error('Postgres query connection required');
  let started = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    started = true;
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const probe = await client.query(
      "SELECT current_setting('transaction_read_only') AS read_only, " +
      "current_setting('row_security') AS row_security, " +
      "r.rolsuper AS is_superuser, r.rolbypassrls AS can_bypass_rls, " +
      "transaction_timestamp()::text AS captured_at " +
      "FROM pg_roles r WHERE r.rolname = current_user"
    );
    const p = probe.rows?.[0];
    if (!p || p.read_only !== 'on' || p.row_security !== 'on'
        || p.is_superuser !== false || p.can_bypass_rls !== false
        || typeof p.captured_at !== 'string') {
      throw new Error('A non-privileged, RLS-enabled read-only source session is required');
    }
    const snapshot = {
      schema_version: 1, organization_id: organizationId,
      source_project_ref: sourceProjectRef, currency: 'PKR',
      capture_timestamp: p.captured_at,
    };
    for (const table of LEGACY_SOURCE_TABLES) {
      const result = await client.query(
        'SELECT * FROM public.' + table + ' WHERE organization_id = $1::uuid ORDER BY id',
        [organizationId],
      );
      validateRows(table, result.rows, organizationId);
      snapshot[table] = result.rows;
      if (expectedCounts[table] !== undefined && expectedCounts[table] !== result.rows.length) {
        throw new Error('Source drift/count mismatch in ' + table + '; snapshot refused');
      }
    }
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    if (started) {
      try { await client.query('ROLLBACK'); } catch { /* preserve cause */ }
    }
    throw error;
  }
}

export function configureExactPgTypes(pg) {
  // Suppress JS Number rounding in JSONB audit history and preserve date/time strings.
  const overrides = new pg.types.TypeOverrides();
  for (const oid of [20, 1082, 1114, 1184, 1700, 114, 3802]) {
    overrides.setTypeParser(oid, value => value);
  }
  return overrides;
}

export async function writePrivateSnapshot(path, snapshot) {
  if (!isAbsolute(path)) throw new Error('Private output path must be absolute');
  const target = resolve(path);
  const repoRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const parent = await realpath(dirname(target));
  if (parent === repoRoot || parent.startsWith(repoRoot + sep)) {
    throw new Error('Refusing private source data inside Git repository');
  }
  const content = JSON.stringify(snapshot, null, 2) + '\n';
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  return { bytes: Buffer.byteLength(content) };
}

function parseArguments(args) {
  const values = {};
  const flags = { '--expected-tx': 'transactions', '--expected-accounts': 'payment_accounts',
    '--expected-ledger': 'account_ledger_entries', '--expected-transfers': 'account_transfers',
    '--expected-drafts': 'transaction_drafts', '--expected-audit': 'audit_log',
    '--expected-categories': 'categories' };
  const known = new Set(['--organization', '--source-project', '--out', ...Object.keys(flags)]);
  if (args.length % 2) throw new Error('Every CLI option requires one value');
  for (let i = 0; i < args.length; i += 2) {
    if (!known.has(args[i]) || args[i] in values || !args[i + 1]) {
      throw new Error('Unknown, repeated or empty CLI option');
    }
    values[args[i]] = args[i + 1];
  }
  const counts = {};
  for (const [flag, name] of Object.entries(flags)) {
    if (values[flag] !== undefined) {
      if (!/^(0|[1-9]\d*)$/.test(values[flag])) throw new Error('Invalid expected count');
      counts[name] = Number(values[flag]);
    }
  }
  const opts = {
    organizationId: values['--organization'], sourceProjectRef: values['--source-project'],
    outputPath: values['--out'], expectedCounts: counts,
  };
  validateIdentity(opts);
  validateExpected(opts.expectedCounts);
  if (!opts.outputPath) throw new Error('Private output path required');
  return opts;
}

async function cli(args) {
  const opts = parseArguments(args);
  if (process.env.AQVORA_READ_ONLY_EXPORT_APPROVED !== 'YES'
      || !process.env.AQVORA_SOURCE_READONLY_DATABASE_URL) {
    throw new Error('Explicit operator approval and restricted source DB URL required');
  }
  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: process.env.AQVORA_SOURCE_READONLY_DATABASE_URL,
    types: configureExactPgTypes(pg.default),
    connectionTimeoutMillis: 10000,
    application_name: 'aqvora_private_readonly_snapshot',
  });
  await client.connect();
  try {
    const snapshot = await collectLegacySnapshot(client, opts);
    const result = await writePrivateSnapshot(opts.outputPath, snapshot);
    console.log(JSON.stringify({
      status: 'PRIVATE_SOURCE_SNAPSHOT_EXPORTED_NOT_MIGRATED',
      count_by_collection: Object.fromEntries(LEGACY_SOURCE_TABLES.map(name =>
        [name, snapshot[name].length])),
      bytes: result.bytes, erp_posting_allowed: false,
    }, null, 2));
  } finally { await client.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    console.error('AQVORA private source export failed: ' + error.message);
    process.exitCode = 1;
  });
}
