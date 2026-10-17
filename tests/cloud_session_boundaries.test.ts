import { afterEach, describe, expect, it, vi } from 'vitest';
import * as supabase from '../src/lib/supabase';
import { ledgerService } from '../src/services/ledgerService';

describe('cloud session boundaries', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not make data API calls from a local session without a matching Supabase session', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    vi.spyOn(supabase, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabase, 'hasConfiguredCloudSession').mockResolvedValue(false);
    const from = vi.fn();
    vi.spyOn(supabase, 'getSupabaseClient').mockReturnValue({ from } as never);

    await expect(ledgerService.getCategories()).rejects.toThrow(/cloud session/i);
    await expect(ledgerService.getFilteredTransactions()).rejects.toThrow(/cloud session/i);
    await expect(ledgerService.getAccountLedger('account-1')).resolves.toEqual([]);
    await expect(ledgerService.getDailySummary('2026-10-17')).resolves.toMatchObject({
      business_date: '2026-10-17',
      income_paisa: 0,
      expense_paisa: 0,
    });
    expect(from).not.toHaveBeenCalled();
  });
});
