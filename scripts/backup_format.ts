import { createHash } from 'node:crypto';

export const BACKUP_FORMAT = 'SHOP_PRO_SUPABASE_BACKUP_V1';
export const BACKUP_VERSION = '3.0.0';
export const BACKUP_SCHEMA_VERSION = '20261004007000';

export const BACKUP_TABLES = [
  { name: 'organizations', primaryKey: 'id' },
  { name: 'profiles', primaryKey: 'id' },
  { name: 'organization_members', primaryKey: 'id' },
  { name: 'categories', primaryKey: 'id' },
  { name: 'products', primaryKey: 'id' },
  { name: 'services', primaryKey: 'id' },
  { name: 'service_components', primaryKey: 'id' },
  { name: 'stock_movements', primaryKey: 'id' },
  { name: 'customers', primaryKey: 'id' },
  { name: 'payment_accounts', primaryKey: 'id' },
  { name: 'account_transfers', primaryKey: 'id' },
  { name: 'account_transactions', primaryKey: 'id' },
  { name: 'expense_categories', primaryKey: 'id' },
  { name: 'expenses', primaryKey: 'id' },
  { name: 'sales', primaryKey: 'id' },
  { name: 'sale_items', primaryKey: 'id' },
  { name: 'daily_closings', primaryKey: 'id' },
  { name: 'audit_logs', primaryKey: 'id' },
  { name: 'shop_members', primaryKey: 'user_id' },
  { name: 'category_aliases', primaryKey: 'id' },
  { name: 'transactions', primaryKey: 'id' },
  { name: 'audit_log', primaryKey: 'id' },
  { name: 'review_queue', primaryKey: 'id' },
  { name: 'account_ledger_entries', primaryKey: 'id' },
  { name: 'transaction_drafts', primaryKey: 'id' },
] as const;

const BACKUP_RELATIONSHIPS = [
  ['organization_members', 'organization_id', 'organizations'],
  ['profiles', 'organization_id', 'organizations', true],
  ['categories', 'organization_id', 'organizations'],
  ['products', 'organization_id', 'organizations'],
  ['products', 'category_id', 'categories', true],
  ['services', 'organization_id', 'organizations'],
  ['services', 'category_id', 'categories', true],
  ['service_components', 'organization_id', 'organizations'],
  ['service_components', 'service_id', 'services'],
  ['service_components', 'product_id', 'products'],
  ['stock_movements', 'organization_id', 'organizations'],
  ['stock_movements', 'product_id', 'products'],
  ['customers', 'organization_id', 'organizations'],
  ['payment_accounts', 'organization_id', 'organizations'],
  ['account_transfers', 'organization_id', 'organizations'],
  ['account_transfers', 'from_account_id', 'payment_accounts'],
  ['account_transfers', 'to_account_id', 'payment_accounts'],
  ['account_transactions', 'organization_id', 'organizations'],
  ['account_transactions', 'account_id', 'payment_accounts'],
  ['expense_categories', 'organization_id', 'organizations'],
  ['expenses', 'organization_id', 'organizations'],
  ['expenses', 'category_id', 'expense_categories'],
  ['expenses', 'account_id', 'payment_accounts'],
  ['sales', 'organization_id', 'organizations'],
  ['sales', 'customer_id', 'customers', true],
  ['sale_items', 'organization_id', 'organizations'],
  ['sale_items', 'sale_id', 'sales'],
  ['daily_closings', 'organization_id', 'organizations'],
  ['audit_logs', 'organization_id', 'organizations'],
  ['shop_members', 'organization_id', 'organizations'],
  ['category_aliases', 'category_id', 'categories'],
  ['transactions', 'organization_id', 'organizations'],
  ['transactions', 'category_id', 'categories', true],
  ['transactions', 'account_id', 'payment_accounts'],
  ['audit_log', 'organization_id', 'organizations'],
  ['audit_log', 'transaction_id', 'transactions'],
  ['review_queue', 'organization_id', 'organizations'],
  ['review_queue', 'suggested_category_id', 'categories', true],
  ['account_ledger_entries', 'organization_id', 'organizations'],
  ['account_ledger_entries', 'account_id', 'payment_accounts'],
  ['account_ledger_entries', 'transaction_id', 'transactions', true],
  ['account_ledger_entries', 'transfer_id', 'account_transfers', true],
  ['transaction_drafts', 'organization_id', 'organizations'],
  ['transaction_drafts', 'category_id', 'categories', true],
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]['name'];
export type BackupRows = Record<string, unknown>[];
export type BackupTables = Record<BackupTableName, BackupRows>;

export interface FullBackupArchive {
  format: typeof BACKUP_FORMAT;
  metadata: {
    exportedAt: string;
    supabaseUrl: string;
    version: typeof BACKUP_VERSION;
    schemaVersion: typeof BACKUP_SCHEMA_VERSION;
    tableCounts: Record<BackupTableName, number>;
    sha256: string;
  };
  tables: BackupTables;
}

export interface LegacyBackupArchive {
  metadata: { rowCount: number; supabaseUrl?: string; version: '2.0.0' };
  data: BackupRows;
}

export type ValidatedBackup = FullBackupArchive | LegacyBackupArchive;

export function hashBackupTables(tables: BackupTables): string {
  return createHash('sha256').update(JSON.stringify(tables), 'utf8').digest('hex');
}

export function assertUniquePrimaryKeys(tableName: BackupTableName, rows: BackupRows): void {
  const { primaryKey } = BACKUP_TABLES.find((table) => table.name === tableName)!;
  const seen = new Set<unknown>();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Invalid row ${index} in ${tableName}: expected an object`);
    }

    const key = row[primaryKey];
    if (key === null || key === undefined || seen.has(key)) {
      throw new Error(`Invalid or duplicate ${primaryKey} in ${tableName} at row ${index}`);
    }
    seen.add(key);
  }
}

export function assertBackupRelationships(tables: BackupTables): void {
  const indexes = new Map<BackupTableName, Map<unknown, Record<string, unknown>>>();
  for (const { name } of BACKUP_TABLES) {
    indexes.set(name, new Map(tables[name].map((row) => [row.id ?? row.user_id, row])));
  }

  for (const [sourceName, foreignKey, targetName, nullable = false] of BACKUP_RELATIONSHIPS) {
    for (const [index, source] of tables[sourceName].entries()) {
      const foreignId = source[foreignKey];
      if (nullable && (foreignId === null || foreignId === undefined)) continue;

      const target = indexes.get(targetName)?.get(foreignId);
      if (!target) {
        throw new Error(
          `Backup relationship mismatch: ${sourceName}.${foreignKey} at row ${index} references a missing ${targetName} record`,
        );
      }
      if (
        typeof source.organization_id === 'string'
        && typeof target.organization_id === 'string'
        && source.organization_id !== target.organization_id
      ) {
        throw new Error(
          `Backup tenant mismatch: ${sourceName}.${foreignKey} at row ${index} references another organization's ${targetName} record`,
        );
      }
    }
  }
}

export function createBackupArchive(
  tables: BackupTables,
  supabaseUrl: string,
  exportedAt = new Date().toISOString(),
): FullBackupArchive {
  const tableCounts = {} as Record<BackupTableName, number>;
  for (const { name } of BACKUP_TABLES) {
    const rows = tables[name];
    if (!Array.isArray(rows)) throw new Error(`Backup is missing table ${name}`);
    assertUniquePrimaryKeys(name, rows);
    tableCounts[name] = rows.length;
  }
  assertBackupRelationships(tables);

  return {
    format: BACKUP_FORMAT,
    metadata: {
      exportedAt,
      supabaseUrl,
      version: BACKUP_VERSION,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      tableCounts,
      sha256: hashBackupTables(tables),
    },
    tables,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateBackupArchive(value: unknown): ValidatedBackup {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    throw new Error('Invalid backup: expected an archive with metadata');
  }

  if (value.format === BACKUP_FORMAT) {
    const { metadata } = value;
    if (
      metadata.version !== BACKUP_VERSION
      || metadata.schemaVersion !== BACKUP_SCHEMA_VERSION
      || !isRecord(value.tables)
    ) {
      throw new Error('Unsupported or malformed Shop Pro backup');
    }

    const expectedNames = BACKUP_TABLES.map(({ name }) => name).sort();
    const actualNames = Object.keys(value.tables).sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error('Backup table set is incomplete or contains unsupported tables');
    }

    if (!isRecord(metadata.tableCounts) || typeof metadata.sha256 !== 'string') {
      throw new Error('Backup is missing its row counts or SHA-256 checksum');
    }
    if (
      JSON.stringify(Object.keys(metadata.tableCounts).sort())
      !== JSON.stringify(expectedNames)
    ) {
      throw new Error('Backup table counts are incomplete or contain unsupported tables');
    }

    const tables = value.tables as BackupTables;
    for (const { name } of BACKUP_TABLES) {
      const rows = tables[name];
      if (!Array.isArray(rows) || metadata.tableCounts[name] !== rows.length) {
        throw new Error(`Backup row count mismatch for ${name}`);
      }
      assertUniquePrimaryKeys(name, rows);
    }
    if (!/^[a-f0-9]{64}$/i.test(metadata.sha256) || hashBackupTables(tables) !== metadata.sha256.toLowerCase()) {
      throw new Error('Backup checksum verification failed');
    }
    assertBackupRelationships(tables);

    if (typeof metadata.supabaseUrl !== 'string' || typeof metadata.exportedAt !== 'string') {
      throw new Error('Backup is missing its source URL or export timestamp');
    }

    return value as unknown as FullBackupArchive;
  }

  // Continue to recognize existing v2 transaction-only archives for offline inspection
  // and the separately guarded legacy restore path.
  if (
    value.metadata.version === '2.0.0'
    && Array.isArray(value.data)
    && value.metadata.rowCount === value.data.length
  ) {
    const idempotencyKeys = new Set<unknown>();
    for (const [index, row] of value.data.entries()) {
      if (!isRecord(row) || typeof row.idempotency_key !== 'string' || !row.idempotency_key) {
        throw new Error(`Invalid legacy transaction row at index ${index}`);
      }
      if (idempotencyKeys.has(row.idempotency_key)) {
        throw new Error(`Duplicate idempotency_key in legacy backup at row ${index}`);
      }
      idempotencyKeys.add(row.idempotency_key);
    }
    return value as unknown as LegacyBackupArchive;
  }

  throw new Error('Unsupported backup format or invalid legacy row count');
}
