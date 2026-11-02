/**
 * Safely inspect backup archives offline. Applying legacy transaction-only
 * archives is an explicit operation guarded by a clean target and URL match.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_TABLES,
  validateBackupArchive,
  type FullBackupArchive,
  type LegacyBackupArchive,
} from './backup_format';

export interface BackupRestorePlan {
  mode: 'offline-plan-only';
  sourceSupabaseUrl: string;
  exportedAt: string;
  schemaVersion: string;
  sha256: string;
  targetRequirements: string[];
  steps: Array<{
    order: number;
    table: string;
    primaryKey: string;
    rowCount: number;
  }>;
}

export function createBackupRestorePlan(backup: FullBackupArchive): BackupRestorePlan {
  return {
    mode: 'offline-plan-only',
    sourceSupabaseUrl: backup.metadata.supabaseUrl,
    exportedAt: backup.metadata.exportedAt,
    schemaVersion: backup.metadata.schemaVersion,
    sha256: backup.metadata.sha256,
    targetRequirements: [
      'Create an isolated staging Supabase project; never test a restore against production.',
      'Apply the exact database schema/migration set before inserting application rows.',
      'Prepare and verify corresponding Supabase Auth users first; auth.users is not included in this public-table archive.',
      'Restore public tables in the declared dependency order below, then verify row counts, foreign keys, tenant boundaries, ledger balances and audit chains.',
      'Storage objects, Auth credentials, project settings, secrets and Edge Function configuration are not included in this archive.',
      'This command is a read-only plan. It does not connect to Supabase or apply any database changes.',
    ],
    steps: BACKUP_TABLES.map(({ name, primaryKey }, index) => ({
      order: index + 1,
      table: name,
      primaryKey,
      rowCount: backup.metadata.tableCounts[name],
    })),
  };
}

export function readAndValidateBackup(filePath: string): ReturnType<typeof validateBackupArchive> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`Backup file not found: ${resolvedPath}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read backup JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return validateBackupArchive(parsed);
}

async function applyLegacyTransactionBackup(backup: LegacyBackupArchive): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const confirmedUrl = process.env.RESTORE_CONFIRM_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided to apply a restore.');
  }
  if (confirmedUrl !== supabaseUrl) {
    throw new Error('Restore blocked: set RESTORE_CONFIRM_URL to exactly match the intended SUPABASE_URL.');
  }
  if (!backup.metadata.supabaseUrl || backup.metadata.supabaseUrl === supabaseUrl) {
    throw new Error('Restore blocked: target must be a different Supabase project from the backup source.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { count: initialCount, error: countError } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  if (countError) throw new Error(`Unable to inspect target transactions: ${countError.message}`);
  if ((initialCount ?? 0) !== 0) {
    throw new Error('Restore blocked: legacy transaction restores require an empty target transactions table.');
  }

  const BATCH_SIZE = 200;
  for (let offset = 0; offset < backup.data.length; offset += BATCH_SIZE) {
    const batch = backup.data.slice(offset, offset + BATCH_SIZE);
    const { error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'idempotency_key' });
    if (error) throw new Error(`Failed to restore transactions at offset ${offset}: ${error.message}`);
  }

  const { count: restoredCount, error: verifyError } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });
  if (verifyError) throw new Error(`Unable to verify restored transactions: ${verifyError.message}`);
  if ((restoredCount ?? 0) !== backup.data.length) {
    throw new Error(`Restore verification failed: found ${restoredCount ?? 0}, expected ${backup.data.length} transactions.`);
  }

  console.log(`Restored and verified ${restoredCount ?? 0} transactions.`);
}

export async function runRestore(args = process.argv.slice(2)): Promise<void> {
  const [mode, filePath, ...extraArgs] = args;
  if (extraArgs.length || !filePath || !['--validate-only', '--plan', '--apply'].includes(mode)) {
    throw new Error(
      'Usage: npx tsx scripts/restore_database.ts --validate-only <backup.json>\n'
      + '   or: npx tsx scripts/restore_database.ts --plan <backup.json>\n'
      + '   or: npx tsx scripts/restore_database.ts --apply <legacy-v2-backup.json>',
    );
  }

  const backup = readAndValidateBackup(filePath);
  if (mode === '--plan') {
    const plan = 'format' in backup
      ? createBackupRestorePlan(backup)
      : {
          mode: 'offline-plan-only',
          archiveVersion: '2.0.0',
          sourceSupabaseUrl: backup.metadata.supabaseUrl || null,
          transactionRows: backup.data.length,
          targetRequirements: [
            'Use a separate empty staging Supabase project.',
            'The legacy archive contains transactions only, not the complete Shop Pro schema.',
            'No database connection or write is performed by this plan.',
          ],
        };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (mode === '--validate-only') {
    if ('format' in backup) {
      console.log(`Valid Shop Pro backup: ${Object.values(backup.metadata.tableCounts).reduce((a, b) => a + b, 0)} rows across ${Object.keys(backup.tables).length} tables; SHA-256 ${backup.metadata.sha256}`);
    } else {
      console.log(`Valid legacy transaction backup: ${backup.data.length} rows (no checksum in v2 format).`);
    }
    console.log('Validation was offline; no Supabase connection was opened.');
    return;
  }

  if ('format' in backup) {
    throw new Error(
      'Applying full Shop Pro archives through the Supabase REST API is not supported: '
      + 'database triggers and auth.users dependencies require a coordinated database-level recovery. '
      + 'Use --validate-only for isolated archive validation.',
    );
  }

  await applyLegacyTransactionBackup(backup);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runRestore().catch((error: unknown) => {
    console.error('Restore failed:', error);
    process.exitCode = 1;
  });
}
