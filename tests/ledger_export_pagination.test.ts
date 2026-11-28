import { afterEach, describe, expect, it, vi } from "vitest";
import { ledgerService } from "../src/services/ledgerService";
import type { Transaction } from "../src/types/ledger";
afterEach(() => vi.restoreAllMocks());
describe("complete filtered exports", () => {
  it('loads all filtered transaction pages for export', async () => {
    const accounts = vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([]);
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `tx-${index}` }) as Transaction);
    const finalPage = [{ id: 'tx-1000' }, { id: 'tx-1001' }] as Transaction[];
    const getPage = vi
      .spyOn(ledgerService, 'getFilteredTransactions')
      .mockResolvedValueOnce({ transactions: firstPage, count: 1002 })
      .mockResolvedValueOnce({ transactions: finalPage, count: 1002 });

    const transactions = await ledgerService.getAllFilteredTransactions({ type: 'income' });

    expect(transactions).toHaveLength(1002);
    expect(accounts).toHaveBeenCalledOnce();
    expect(getPage).toHaveBeenNthCalledWith(1, { type: 'income', limit: 1000, offset: 0 }, { supportingAccounts: [], totalCount: undefined });
    expect(getPage).toHaveBeenNthCalledWith(2, { type: 'income', limit: 1000, offset: 1000 }, { supportingAccounts: [], totalCount: 1002 });
  });

  it('rejects incomplete exports instead of returning partial results', async () => {
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([]);
    vi.spyOn(ledgerService, 'getFilteredTransactions').mockResolvedValue({
      transactions: [],
      count: 1001,
    });

    await expect(ledgerService.getAllFilteredTransactions()).rejects.toThrow(/export stopped/i);
  });

});
