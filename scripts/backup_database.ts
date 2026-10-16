/**
 * Exports all application tables in the Supabase public schema.
 * The service-role key is read only from the process environment.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_TABLES,
  assertUniquePrimaryKeys,
  createBackupArchive,
  validateBackupArchive,
  type BackupRows,
  type BackupTableName,
} from './backup_format';

const PAGE_SIZE = 1000;

export async function runBackup(): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided as environment variables.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const tables = {} as Record<BackupTableName, BackupRows>;
  console.log('--- Starting Shop Pro Supabase Backup ---');

  for (const { name: tableName, primaryKey } of BACKUP_TABLES) {
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (countError) throw new Error(`Failed to count ${tableName}: ${countError.message}`);

    const expectedCount = count ?? 0;
    const rows: BackupRows = [];
    let offset = 0;

    while (offset < expectedCount) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(primaryKey, { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw new Error(`Failed to fetch ${tableName} at offset ${offset}: ${error.message}`);
      if (!data?.length) break;

      rows.push(...data);
      offset += data.length;
    }

    if (rows.length !== expectedCount) {
      throw new Error(`Integrity failure for ${tableName}: retrieved ${rows.length}, expected ${expectedCount}`);
    }

    assertUniquePrimaryKeys(tableName, rows);
    tables[tableName] = rows;
    console.log(`Verified ${tableName}: ${rows.length} rows`);
  }

  const archive = createBackupArchive(tables, supabaseUrl);
  const backupDir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = archive.metadata.exportedAt.replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `shop_pro_backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(archive, null, 2), { encoding: 'utf8', flag: 'wx' });
  const persistedArchive = JSON.parse(fs.readFileSync(backupFile, 'utf8')) as unknown;
  const validatedArchive = validateBackupArchive(persistedArchive);
  if (!('format' in validatedArchive) || validatedArchive.metadata.sha256 !== archive.metadata.sha256) {
    throw new Error('Persisted backup verification failed: the written archive does not match the exported dataset.');
  }
  console.log(`Backup created: ${backupFile}`);
  console.log(`SHA-256: ${archive.metadata.sha256}`);
  console.log('--- Backup Completed Successfully ---');
  return backupFile;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runBackup().catch((error: unknown) => {
    console.error('Backup failed:', error);
    process.exitCode = 1;
  });
}
