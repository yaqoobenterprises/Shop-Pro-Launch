import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatPaisa, parseInputToPaisa } from '../src/lib/money';
import {
  getKarachiBusinessDate,
  formatKarachiTime,
  formatDisplayDate,
  getYesterdayKarachiDate,
  validateDateDrift,
  SHOP_TIMEZONE,
} from '../src/lib/dates';
import {
  enqueueOfflineTransaction,
  getOfflineQueue,
  dequeueOfflineTransaction,
  QueuedTransaction,
} from '../src/services/offlineQueue';
import { ledgerService } from '../src/services/ledgerService';
import { setSecurityPrincipal } from '../src/lib/security';
import * as supabaseLib from '../src/lib/supabase';

describe('Phase 1 Golden Tests: Baseline Freezing', () => {
  describe('formatPaisa Golden Behavior', () => {
    it('formats zero correctly', () => {
      expect(formatPaisa(0)).toBe('Rs 0');
      expect(formatPaisa(0, { showPaisaIfFraction: true })).toBe('Rs 0');
    });

    it('formats standard whole rupee amounts without fraction', () => {
      expect(formatPaisa(100)).toBe('Rs 1');
      expect(formatPaisa(50000)).toBe('Rs 500');
      expect(formatPaisa(20000000)).toBe('Rs 200,000');
      expect(formatPaisa(1000000000)).toBe('Rs 10,000,000');
    });

    it('rounds fractional amounts when showPaisaIfFraction is omitted or false', () => {
      // 12.50 rounds to 13
      expect(formatPaisa(1250)).toBe('Rs 13');
      // 12.40 rounds to 12
      expect(formatPaisa(1240)).toBe('Rs 12');
      // 12.60 rounds to 13
      expect(formatPaisa(1260)).toBe('Rs 13');
      // Sub-rupee rounding
      expect(formatPaisa(49)).toBe('Rs 0');
      expect(formatPaisa(50)).toBe('Rs 1');
      expect(formatPaisa(99)).toBe('Rs 1');
    });

    it('preserves exact fractional 2-decimal display when showPaisaIfFraction is true', () => {
      expect(formatPaisa(1250, { showPaisaIfFraction: true })).toBe('Rs 12.50');
      expect(formatPaisa(1205, { showPaisaIfFraction: true })).toBe('Rs 12.05');
      expect(formatPaisa(50, { showPaisaIfFraction: true })).toBe('Rs 0.50');
      expect(formatPaisa(5, { showPaisaIfFraction: true })).toBe('Rs 0.05');
      expect(formatPaisa(1, { showPaisaIfFraction: true })).toBe('Rs 0.01');
      expect(formatPaisa(9999999, { showPaisaIfFraction: true })).toBe('Rs 99,999.99');
      // Whole amounts stay without decimals even with flag true
      expect(formatPaisa(10000, { showPaisaIfFraction: true })).toBe('Rs 100');
    });
  });

  describe('parseInputToPaisa Golden Behavior', () => {
    it('parses valid numeric strings across formats', () => {
      expect(parseInputToPaisa('300')).toEqual({ paisa: 30000, isValid: true });
      expect(parseInputToPaisa('12.50')).toEqual({ paisa: 1250, isValid: true });
      expect(parseInputToPaisa('0.05')).toEqual({ paisa: 5, isValid: true });
      expect(parseInputToPaisa('200,000')).toEqual({ paisa: 20000000, isValid: true });
      expect(parseInputToPaisa('Rs. 500/-')).toEqual({ paisa: 50000, isValid: true });
      expect(parseInputToPaisa('PKR 1,250')).toEqual({ paisa: 125000, isValid: true });
      expect(parseInputToPaisa('500/-')).toEqual({ paisa: 50000, isValid: true });
      expect(parseInputToPaisa('500=/-')).toEqual({ paisa: 50000, isValid: true });
    });

    it('rejects zero, negative and non-numeric inputs', () => {
      expect(parseInputToPaisa('0').isValid).toBe(false);
      expect(parseInputToPaisa('-100').isValid).toBe(false);
      expect(parseInputToPaisa('abc').isValid).toBe(false);
      expect(parseInputToPaisa('').isValid).toBe(false);
    });
  });

  describe('Dates Engine Golden Behavior in Asia/Karachi', () => {
    it('guarantees SHOP_TIMEZONE is Asia/Karachi', () => {
      expect(SHOP_TIMEZONE).toBe('Asia/Karachi');
    });

    it('correctly handles instants around midnight in Asia/Karachi (UTC+5)', () => {
      // 18:59:59.999 UTC is 23:59:59.999 PKT -> same date
      const beforeMidnight = new Date('2026-10-13T18:59:59.999Z');
      expect(getKarachiBusinessDate(beforeMidnight)).toBe('2026-10-13');

      // 19:00:00.000 UTC is exactly 00:00:00 PKT -> next date
      const exactMidnight = new Date('2026-10-13T19:00:00.000Z');
      expect(getKarachiBusinessDate(exactMidnight)).toBe('2026-10-14');

      // 19:00:01.000 UTC is 00:00:01 PKT -> next date
      const afterMidnight = new Date('2026-10-13T19:00:01.000Z');
      expect(getKarachiBusinessDate(afterMidnight)).toBe('2026-10-14');

      // Year boundary rollover
      const yearEndBefore = new Date('2026-12-31T18:59:59.000Z');
      expect(getKarachiBusinessDate(yearEndBefore)).toBe('2026-12-31');

      const yearEndAfter = new Date('2026-12-31T19:00:00.000Z');
      expect(getKarachiBusinessDate(yearEndAfter)).toBe('2027-01-01');
    });

    it('formats display dates in en-GB DD MMM YYYY convention', () => {
      expect(formatDisplayDate('2026-10-13')).toBe('13 Oct 2026');
      expect(formatDisplayDate('2026-01-01')).toBe('01 Jan 2026');
      expect(formatDisplayDate('')).toBe('-');
    });

    it('formats time in Asia/Karachi 12-hour clock', () => {
      // 09:30 UTC is 14:30 PKT -> 2:30 PM
      expect(formatKarachiTime(new Date('2026-10-13T09:30:00.000Z'))).toBe('2:30 PM');
      // 19:00 UTC is 00:00 PKT -> 12:00 AM
      expect(formatKarachiTime(new Date('2026-10-13T19:00:00.000Z'))).toBe('12:00 AM');
      // 07:05 UTC is 12:05 PKT -> 12:05 PM
      expect(formatKarachiTime(new Date('2026-10-13T07:05:00.000Z'))).toBe('12:05 PM');
    });

    it('derives yesterday business date across month and year boundaries', () => {
      // Mid-month
      const oct14 = new Date('2026-10-14T02:00:00.000Z'); // 7am PKT
      expect(getYesterdayKarachiDate(oct14)).toBe('2026-10-13');

      // Year boundary rollover
      const jan1 = new Date('2027-01-01T05:00:00.000Z'); // 10am PKT
      expect(getYesterdayKarachiDate(jan1)).toBe('2026-12-31');
    });

    it('validates date drift correctly', () => {
      const ref = new Date('2026-10-13T10:00:00.000Z');
      expect(validateDateDrift('2026-10-13', ref).isValid).toBe(true);
      expect(validateDateDrift('2026-10-12', ref).isValid).toBe(true);
      expect(validateDateDrift('2026-10-14', ref).isValid).toBe(true);
      expect(validateDateDrift('2026-10-16', ref).isValid).toBe(false);
    });
  });

  describe('Offline Queue R6 Invariant: Old-Format Item Flushes Successfully', () => {
    const orgId = '00000000-0000-0000-0000-000000000001';
    const userId = '11111111-1111-4111-8111-111111111111';
    const testIdempotencyKey = 'fixture-old-queue-item-999';

    beforeEach(async () => {
      setSecurityPrincipal({
        id: userId,
        organizationId: orgId,
        role: 'OWNER',
        fullName: 'Test Owner',
      });
      await dequeueOfflineTransaction(testIdempotencyKey);
    });

    afterEach(async () => {
      await dequeueOfflineTransaction(testIdempotencyKey);
      vi.restoreAllMocks();
    });

    it('flushes an old-format offline queue item into Supabase without data loss', async () => {
      // Fixture representing an item queued under previous schema / structure
      const oldFormatFixture: QueuedTransaction = {
        id: '99999999-9999-4999-8999-999999999999',
        idempotencyKey: testIdempotencyKey,
        organizationId: orgId,
        createdBy: userId,
        accountId: 'acc-cash-drawer-1',
        type: 'income',
        amountPaisa: 35000, // Rs 350
        categoryId: null,
        categoryName: 'Printing',
        businessDate: '2026-10-12',
        deviceEntryTime: '2026-10-12T14:30:00.000Z',
        note: 'Legacy format test entry',
        rawText: 'PRINT 350',
        createdByName: 'Test Owner',
        status: 'queued',
        attempts: 0,
        createdAt: 1728734400000,
      };

      await enqueueOfflineTransaction(oldFormatFixture);
      const queueBefore = await getOfflineQueue();
      expect(queueBefore.some((item) => item.idempotencyKey === testIdempotencyKey)).toBe(true);

      // Mock Supabase client to record transaction upsert
      let upsertedRow: Record<string, unknown> | null = null;
      const mockQueryBuilder: Record<string, unknown> = {
        upsert: vi.fn((data: Record<string, unknown>) => {
          upsertedRow = data;
          return Promise.resolve({ data, error: null });
        }),
        select: vi.fn(() => mockQueryBuilder),
        eq: vi.fn(() => mockQueryBuilder),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'transactions') return mockQueryBuilder;
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          };
        }),
        rpc: vi.fn(),
      };

      vi.spyOn(supabaseLib, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseLib, 'getSupabaseClient').mockReturnValue(mockClient as never);
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const flushResult = await ledgerService.flushOfflineQueue();

      expect(flushResult.errors).toEqual([]);
      expect(flushResult.syncedCount).toBeGreaterThanOrEqual(1);
      expect(upsertedRow).not.toBeNull();
      expect(upsertedRow!['idempotency_key']).toBe(testIdempotencyKey);
      expect(upsertedRow!['amount_paisa']).toBe(35000);
      expect(upsertedRow!['business_date']).toBe('2026-10-12');

      const queueAfter = await getOfflineQueue();
      expect(queueAfter.some((item) => item.idempotencyKey === testIdempotencyKey)).toBe(false);
    });
  });
});
