import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseLib from '../src/lib/supabase';
import { setSecurityPrincipal } from '../src/lib/security';
import { ledgerService } from '../src/services/ledgerService';
import { dequeueOfflineTransaction, enqueueOfflineTransaction, type QueuedTransaction } from '../src/services/offlineQueue';

const organizationId = 'org-yaqoob-001';
const creatorId = 'test-owner';
const transaction: QueuedTransaction = {
  id: 'queued-tx-1',
  idempotencyKey: 'queued-key-1',
  organizationId,
  createdBy: creatorId,
  accountId: 'account-1',
  type: 'income',
  amountPaisa: 3000,
  categoryId: 'category-print',
  categoryName: 'Printing',
  businessDate: '2026-10-04',
  deviceEntryTime: '2026-10-04T05:00:00Z',
  note: null,
  rawText: 'PRINT 30',
  createdByName: 'Test Owner',
  adjustmentDir: null,
  status: 'queued',
  attempts: 0,
  createdAt: Date.now(),
};

beforeEach(() => vi.spyOn(supabaseLib, 'hasConfiguredCloudSession').mockImplementation(async (userId) => Boolean(
  userId && supabaseLib.isSupabaseConfigured() && (typeof navigator === 'undefined' || navigator.onLine),
)));

afterEach(async () => {
  await dequeueOfflineTransaction(transaction.idempotencyKey);
  setSecurityPrincipal(null);
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('authoritative financial reads', () => {
  it('refuses to use queued transactions as complete cloud history', async () => {
    setSecurityPrincipal({ id: creatorId, organizationId, role: 'OWNER', fullName: 'Test Owner' });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await enqueueOfflineTransaction(transaction);

    await expect(ledgerService.getAllFilteredTransactions(
      { status: 'active' },
      { requireCloudSource: true },
    )).rejects.toThrow(/reconnect/i);
  });

  it('reads exact void counts through the signed-in Supabase client and leaves tenant filtering to RLS', async () => {
    setSecurityPrincipal({ id: creatorId, organizationId, role: 'OWNER', fullName: 'Test Owner' });
    vi.spyOn(supabaseLib, 'isSupabaseConfigured').mockReturnValue(true);
    const eventRows = [{
      id: 'void-event-1', transaction_id: 'tx-1', action: 'void', old_data: null, new_data: null,
      changed_by: creatorId, changed_by_name: 'Test Owner', created_at: '2026-10-04T06:00:00Z',
    }];
    const query = {
      select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(), range: vi.fn(),
    };
    for (const method of ['select', 'eq', 'gte', 'lt', 'order'] as const) {
      query[method].mockReturnValue(query);
    }
    query.range.mockResolvedValue({ data: eventRows, error: null, count: 2 });
    const from = vi.fn(() => query);
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({ from } as never);

    const result = await ledgerService.getVoidAuditEvents({
      startAt: '2026-10-01T00:00:00+05:00',
      beforeAt: '2026-11-01T00:00:00+05:00',
      limit: 1,
      offset: 1,
    }, { requireCloudSource: true });

    expect(result).toEqual({ events: eventRows, count: 2 });
    expect(from).toHaveBeenCalledWith('audit_log');
    expect(query.select).toHaveBeenCalledWith(
      'id, transaction_id, action, old_data, new_data, changed_by, changed_by_name, created_at',
      { count: 'exact' },
    );
    expect(query.eq).toHaveBeenCalledWith('action', 'void');
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-10-01T00:00:00+05:00');
    expect(query.lt).toHaveBeenCalledWith('created_at', '2026-11-01T00:00:00+05:00');
    expect(query.range).toHaveBeenCalledWith(1, 1);
    expect(query.eq).not.toHaveBeenCalledWith('organization_id', expect.anything());
    expect(supabaseLib.hasConfiguredCloudSession).toHaveBeenCalledTimes(1);
  });
});
