import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseLib from '../src/lib/supabase';
import { ledgerService } from '../src/services/ledgerService';
import { setSecurityPrincipal } from '../src/lib/security';
import { dequeueOfflineTransaction, enqueueOfflineTransaction, type QueuedTransaction } from '../src/services/offlineQueue';
const organizationId = 'org-yaqoob-001', creatorId = 'test-owner';
const queueKeys: string[] = [];
const makeQueuedTransaction = (overrides: Partial<QueuedTransaction>): QueuedTransaction => ({
 id: 'queued-tx-1', idempotencyKey: 'queued-key-1', organizationId, createdBy: creatorId,
 accountId: 'account-1', type: 'income', amountPaisa: 3000, categoryId: 'category-print',
 categoryName: 'Printing', businessDate: '2026-10-04', deviceEntryTime: '2026-10-04T05:00:00Z',
 note: null, rawText: 'PRINT 30', createdByName: 'Test Owner', adjustmentDir: null,
 status: 'queued', attempts: 0, createdAt: Date.now(), ...overrides,
});
async function enqueueForTest(item: QueuedTransaction) { queueKeys.push(item.idempotencyKey); await enqueueOfflineTransaction(item); }
beforeEach(() => vi.spyOn(supabaseLib, 'hasConfiguredCloudSession').mockImplementation(async userId => Boolean(userId && supabaseLib.isSupabaseConfigured() && navigator.onLine)));
afterEach(async () => { for(const key of queueKeys.splice(0)) await dequeueOfflineTransaction(key); setSecurityPrincipal(null); vi.restoreAllMocks(); Object.defineProperty(navigator,'onLine',{value:true,configurable:true}); });
describe('transaction account scope', () => {
  it('applies account scope before local pagination and to the complete export', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    setSecurityPrincipal({ id: creatorId, organizationId, role: 'OWNER', fullName: 'Test Owner' });
    await enqueueForTest(makeQueuedTransaction({ id: 'account-filter-a', idempotencyKey: 'account-filter-key-a', accountId: 'account-1' }));
    await enqueueForTest(makeQueuedTransaction({ id: 'account-filter-b', idempotencyKey: 'account-filter-key-b', accountId: 'account-2' }));
    const filter = { accountId: 'account-2', startDate: '2026-10-04', endDate: '2026-10-04', status: 'active' as const };
    const result = await ledgerService.getFilteredTransactions({ ...filter, limit: 1, offset: 0 });
    expect(result.count).toBe(1);
    expect(result.transactions.map(tx => tx.account_id)).toEqual(['account-2']);
    const all = await ledgerService.getAllFilteredTransactions(filter);
    expect(all.map(tx => tx.id)).toEqual(result.transactions.map(tx => tx.id));
  });

  it('applies account scope in the primary and fallback cloud transaction queries', async () => {
    setSecurityPrincipal({ id: creatorId, organizationId, role: 'OWNER', fullName: 'Test Owner' });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.spyOn(supabaseLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([]);
    const query = () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn() });
    const first = query(); const second = query();
    first.range.mockResolvedValue({ data: null, error: new Error('relationship unavailable'), count: null });
    second.range.mockResolvedValue({ data: [], error: null, count: 0 });
    vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue({
      from: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    } as never);
    await ledgerService.getFilteredTransactions({ accountId: 'account-1', limit: 25 }, { requireCloudSource: true });
    expect(first.eq).toHaveBeenCalledWith('account_id', 'account-1');
    expect(second.eq).toHaveBeenCalledWith('account_id', 'account-1');
  });

});
