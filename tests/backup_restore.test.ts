import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { runRestore } from '../scripts/restore_database';
import {
  BACKUP_TABLES,
  createBackupArchive,
  validateBackupArchive,
  type BackupTableName,
  type BackupTables,
} from '../scripts/backup_format';

function emptyTables(): BackupTables {
  return Object.fromEntries(BACKUP_TABLES.map(({ name }) => [name, []])) as Record<BackupTableName, []> as BackupTables;
}

describe('database backup archive integrity', () => {
  it('includes every declared Supabase persistence table, row counts, and a SHA-256 checksum', () => {
    const tables = emptyTables();
    tables.organizations = [{ id: 'shop-1' }];
    tables.payment_accounts = [{ id: 'account-1', organization_id: 'shop-1' }];
    tables.transactions = [{
      id: 'transaction-1',
      organization_id: 'shop-1',
      account_id: 'account-1',
      amount_paisa: 1250,
    }];
    tables.shop_members = [{ user_id: 'member-1', organization_id: 'shop-1' }];

    const archive = createBackupArchive(tables, 'https://source.example.supabase.co', '2026-10-11T00:00:00.000Z');
    const validated = validateBackupArchive(JSON.parse(JSON.stringify(archive)));

    expect('format' in validated).toBe(true);
    if ('format' in validated) {
      expect(Object.keys(validated.tables).sort()).toEqual(BACKUP_TABLES.map(({ name }) => name).sort());
      expect(validated.metadata.tableCounts.transactions).toBe(1);
      expect(validated.metadata.tableCounts.shop_members).toBe(1);
      expect(validated.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('rejects an archive with a missing table', () => {
    const archive = createBackupArchive(emptyTables(), 'https://source.example.supabase.co');
    const { transactions: _omitted, ...incompleteTables } = archive.tables;

    expect(() => validateBackupArchive({ ...archive, tables: incompleteTables }))
      .toThrow('Backup table set is incomplete');
  });

  it('rejects changed rows even when the row count is unchanged', () => {
    const archive = createBackupArchive(emptyTables(), 'https://source.example.supabase.co');
    const tampered = structuredClone(archive);
    tampered.tables.transactions.push({ id: 'tampered' });
    tampered.metadata.tableCounts.transactions = 1;

    expect(() => validateBackupArchive(tampered)).toThrow('checksum verification failed');
  });

  it('rejects duplicate primary keys and inconsistent per-table counts', () => {
    const duplicateRows = emptyTables();
    duplicateRows.transactions = [{ id: 'duplicate' }, { id: 'duplicate' }];
    expect(() => createBackupArchive(duplicateRows, 'https://source.example.supabase.co'))
      .toThrow('Invalid or duplicate id in transactions');

    const archive = createBackupArchive(emptyTables(), 'https://source.example.supabase.co');
    archive.metadata.tableCounts.transactions = 1;
    expect(() => validateBackupArchive(archive)).toThrow('row count mismatch for transactions');
  });

  it('rejects missing public foreign-key parents in a backup', () => {
    const tables = emptyTables();
    tables.organizations = [{ id: 'shop-1' }];
    tables.transactions = [{
    id: 'transaction-1',
    organization_id: 'shop-1',
    account_id: 'missing-account',
    }];

    expect(() => createBackupArchive(tables, 'https://source.example.supabase.co'))
    .toThrow('transactions.account_id at row 0 references a missing payment_accounts record');
  });

  it('rejects transaction references that cross the shop boundary', () => {
    const tables = emptyTables();
    tables.organizations = [{ id: 'shop-1' }, { id: 'shop-2' }];
    tables.payment_accounts = [{ id: 'account-1', organization_id: 'shop-1' }];
    tables.categories = [{ id: 'category-2', organization_id: 'shop-2' }];
    tables.transactions = [{
    id: 'transaction-1',
    organization_id: 'shop-1',
    account_id: 'account-1',
    category_id: 'category-2',
    }];

    expect(() => createBackupArchive(tables, 'https://source.example.supabase.co'))
    .toThrow('Backup tenant mismatch: transactions.category_id at row 0 references another organization');
  });

  it('rejects archives marked for an incompatible database schema version', () => {
    const archive = createBackupArchive(emptyTables(), 'https://source.example.supabase.co');
    const incompatible = {
    ...archive,
    metadata: { ...archive.metadata, schemaVersion: 'older-schema' },
    };

    expect(() => validateBackupArchive(incompatible))
    .toThrow('Unsupported or malformed Shop Pro backup');
  });

  it('continues to recognize transaction-only v2 backups and checks their declared row count', () => {
    const legacy = {
      metadata: { rowCount: 1, version: '2.0.0', supabaseUrl: 'https://source.example.supabase.co' },
      data: [{ idempotency_key: 'legacy-1' }],
    };
    expect(validateBackupArchive(legacy)).toEqual(legacy);
    expect(() => validateBackupArchive({ ...legacy, metadata: { ...legacy.metadata, rowCount: 2 } }))
      .toThrow('invalid legacy row count');
    expect(() => validateBackupArchive({ ...legacy, data: [{ idempotency_key: 'same' }, { idempotency_key: 'same' }], metadata: { ...legacy.metadata, rowCount: 2 } }))
      .toThrow('Duplicate idempotency_key');
  });

  it('validates a full archive in isolation without Supabase credentials', async () => {
    const fixturePath = path.join(process.cwd(), 'tests', `.generated-backup-validation-${randomUUID()}.json`);
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const archive = createBackupArchive(emptyTables(), 'https://source.example.supabase.co');
    fs.writeFileSync(fixturePath, JSON.stringify(archive), 'utf8');

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await expect(runRestore(['--validate-only', fixturePath])).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith('Validation was offline; no Supabase connection was opened.');
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      log.mockRestore();
      fs.unlinkSync(fixturePath);
    }
  });

  it('refuses to apply a full archive through an unsafe REST-based restore path', async () => {
    const fixturePath = path.join(process.cwd(), 'tests', `.generated-full-backup-${randomUUID()}.json`);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    fs.writeFileSync(
      fixturePath,
      JSON.stringify(createBackupArchive(emptyTables(), 'https://source.example.supabase.co')),
      'utf8',
    );

    try {
      await expect(runRestore(['--apply', fixturePath]))
        .rejects.toThrow('Applying full Shop Pro archives through the Supabase REST API is not supported');
      expect(mockFrom).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      fs.unlinkSync(fixturePath);
    }
  });

  it('blocks duplicate legacy restoration when the target already contains transactions', async () => {
    const fixturePath = path.join(process.cwd(), 'tests', `.generated-legacy-backup-${randomUUID()}.json`);
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousConfirmation = process.env.RESTORE_CONFIRM_URL;
    fs.writeFileSync(fixturePath, JSON.stringify({
      metadata: {
        rowCount: 0,
        version: '2.0.0',
        supabaseUrl: 'https://source.example.supabase.co',
      },
      data: [],
    }), 'utf8');
    mockFrom.mockImplementation(() => ({
      select: () => Promise.resolve({ count: 1, error: null }),
    }));
    process.env.SUPABASE_URL = 'https://isolated-target.example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.RESTORE_CONFIRM_URL = process.env.SUPABASE_URL;

    try {
      await expect(runRestore(['--apply', fixturePath]))
        .rejects.toThrow('require an empty target transactions table');
      expect(mockFrom).toHaveBeenCalledWith('transactions');
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
      if (previousConfirmation === undefined) delete process.env.RESTORE_CONFIRM_URL;
      else process.env.RESTORE_CONFIRM_URL = previousConfirmation;
      mockFrom.mockReset();
      fs.unlinkSync(fixturePath);
    }
  });
});
