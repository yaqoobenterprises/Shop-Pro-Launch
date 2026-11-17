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
});
