import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const accountUpsert = vi.fn(async () => ({ error: null }));
  const remoteOrder = vi.fn(async () => ({ data: [], error: null }));
  const remoteQuery = {
    order: remoteOrder,
    gt: vi.fn(),
    eq: vi.fn(),
  };
  remoteQuery.gt.mockReturnValue(remoteQuery);
  remoteQuery.eq.mockReturnValue(remoteQuery);
  const supabase = {
    from: vi.fn(() => ({
      upsert: accountUpsert,
      select: vi.fn(() => remoteQuery),
    })),
  };
  const db = {
    select: vi.fn(async (sql: string) => {
      if (sql.includes("FROM sync_queue WHERE status = 'pending' AND")) {
        return [{
          id: 'queued-balance-1',
          organization_id: '00000000-0000-4000-8000-000000000001',
          table_name: 'payment_accounts',
          record_id: 'account-1',
          operation: 'UPDATE',
          payload: JSON.stringify({
            id: 'account-1',
            organization_id: '00000000-0000-4000-8000-000000000001',
            name: 'Cash',
            current_balance: 150.25,
            opening_balance: 100,
          }),
          attempts: 7,
        }];
      }
      if (sql.includes('COUNT(*)')) return [{ count: 1 }];
      return [];
    }),
    execute: vi.fn(async (_sql: string, _params?: unknown[]) => undefined),
  };
  return { db, supabase, accountUpsert };
});

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabaseClient: vi.fn(() => mocks.supabase),
  hasActiveSupabaseSession: vi.fn(async () => true),
}));

vi.mock('../src/lib/security', () => ({
  getSecurityPrincipal: vi.fn(() => ({
    id: '00000000-0000-4000-8000-000000000002',
    organizationId: '00000000-0000-4000-8000-000000000001',
    role: 'OWNER',
  })),
}));

vi.mock('../src/services/sqliteEngine', () => ({
  getSqliteDatabase: vi.fn(async () => mocks.db),
}));

import { requiresAccountBalanceReconciliation } from '../src/services/legacyAccountSyncGuard';
import { syncEngine } from '../src/services/syncEngine';

describe('legacy account sync balance quarantine', () => {
  it('identifies both zero and nonzero balance snapshots, without blocking metadata-only changes', () => {
    expect(requiresAccountBalanceReconciliation('payment_accounts', 'UPDATE', { current_balance: 0 })).toBe(true);
    expect(requiresAccountBalanceReconciliation('payment_accounts', 'INSERT', { opening_balance: 0 })).toBe(true);
    expect(requiresAccountBalanceReconciliation('payment_accounts', 'UPDATE', { name: 'Bank' })).toBe(false);
    expect(requiresAccountBalanceReconciliation('payment_accounts', 'DELETE', { current_balance: 99 })).toBe(false);
    expect(requiresAccountBalanceReconciliation('products', 'UPDATE', { current_balance: 99 })).toBe(false);
  });

  it('retains pending balance sync after seven retries without cloud UPSERT or retry exhaustion', async () => {
    const outcome = await syncEngine.syncNow();

    expect(outcome.pushed).toBe(0);
    expect(outcome.error).toMatch(/balance requires reconciliation/i);
    expect(mocks.accountUpsert).not.toHaveBeenCalled();
    expect(mocks.db.execute.mock.calls.some(([sql]) =>
      String(sql).includes('DELETE FROM sync_queue') ||
      String(sql).includes('UPDATE sync_queue SET attempts'),
    )).toBe(false);
  });
});
