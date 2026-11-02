import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LedgerDashboardView } from '../src/components/dashboard/LedgerDashboardView';
import { ledgerService } from '../src/services/ledgerService';
import type { Transaction } from '../src/types/ledger';
import { getKarachiBusinessDate } from '../src/lib/dates';

afterEach(() => vi.restoreAllMocks());

const makeTransaction = (id: string, type: Transaction['type'], amountPaisa: number, date: string): Transaction => ({
  id, type, amount_paisa: amountPaisa, category_id: type === 'income' ? 'category-print' : 'category-paper',
  category_name: type === 'income' ? 'Printing' : 'Paper', account_id: 'account-cash', account_name: 'Till Cash',
  business_date: date, device_entry_time: `${date}T12:00:00.000Z`, note: null,
  raw_text: type === 'income' ? 'Printing received 300' : 'Paper purchase 100', status: 'active',
  idempotency_key: id, created_by: 'owner', created_by_name: 'Owner',
  created_at: `${date}T12:00:00.000Z`, updated_at: `${date}T12:00:00.000Z`,
});
describe('real-data dashboard charts', () => {
  it('calculates overview category and profit totals from the same filtered transaction set', async () => {
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([{
      id: 'account-cash',
      organization_id: 'shop-1',
      name: 'Till Cash',
      type: 'CASH',
      balance_paisa: 125_000,
      current_balance: 1250,
      opening_balance: 0,
      is_active: true,
      is_default: true,
      created_at: '',
    }]);
    vi.spyOn(ledgerService, 'getAllFilteredTransactions').mockResolvedValue([
      { ...makeTransaction('expense-one', 'expense', 10_000, getKarachiBusinessDate()), category_name: 'Store Supplies' },
      { ...makeTransaction('income-one', 'income', 20_000, getKarachiBusinessDate()), category_name: 'Service Income' },
    ]);

    render(<LedgerDashboardView />);

    const expenses = await screen.findByRole('list', { name: 'Expense totals by category' });
    expect(expenses.textContent).toContain('Store Supplies');
    expect(expenses.textContent).not.toContain('Service Income');
    expect(screen.getByRole('list', { name: 'Current balances by account' }).textContent)
      .toContain('Till Cash');
    expect(expenses.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByText('Rs 200')).toBeTruthy();
    expect(screen.getAllByText('Rs 100').length).toBeGreaterThanOrEqual(2);
  });

  it('shows explicit empty states when the filtered ledger has no activity', async () => {
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([]);
    vi.spyOn(ledgerService, 'getAllFilteredTransactions').mockResolvedValue([]);

    render(<LedgerDashboardView />);

    await waitFor(() => expect(screen.getByText(/No active expenses for this date/)).toBeTruthy());
    expect(screen.queryByRole('list', { name: 'Expense totals by category' })).toBeNull();
    expect(screen.getByText(/No active shop accounts are available/)).toBeTruthy();
    expect(screen.getByText(/No active transactions in this period/)).toBeTruthy();
  });

  it('plots daily cash flow for the selected month and exposes the date range modes', async () => {
    const today = getKarachiBusinessDate();
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([]);
    const allTransactions = vi.spyOn(ledgerService, 'getAllFilteredTransactions').mockResolvedValue([
      makeTransaction('income-month', 'income', 30_000, today),
      makeTransaction('expense-month', 'expense', 10_000, today),
    ]);

    render(<LedgerDashboardView />);
    expect(screen.getByRole('button', { name: 'Week' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));

    await waitFor(() => expect(screen.getByTitle('Income: Rs 300')).toBeTruthy());
    expect(screen.getByTitle('Expenses: Rs 100')).toBeTruthy();
    expect(allTransactions).toHaveBeenCalledWith({
      startDate: `${today.slice(0, 7)}-01`,
      endDate: today,
      status: 'active',
    });
  });
  it('recalculates overview data when account or transaction type filters change', async () => {
    const today = getKarachiBusinessDate();
    const getData = vi.spyOn(ledgerService, 'getAllFilteredTransactions').mockResolvedValue([
      makeTransaction('filtered-income', 'income', 15_000, today),
    ]);
    vi.spyOn(ledgerService, 'getPaymentAccounts').mockResolvedValue([
      {
        id: 'account-cash',
        organization_id: 'shop-1',
        name: 'Till Cash',
        type: 'CASH',
        balance_paisa: 15000,
        current_balance: 150,
        opening_balance: 0,
        is_active: true,
        is_default: true,
        created_at: '',
      },
    ]);

    render(<LedgerDashboardView />);
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-cash' } });
    await waitFor(() => expect(getData).toHaveBeenLastCalledWith({
      startDate: today,
      endDate: today,
      status: 'active',
      accountId: 'account-cash',
    }));

    fireEvent.change(screen.getByLabelText('Transaction type'), { target: { value: 'income' } });
    await waitFor(() => expect(getData).toHaveBeenLastCalledWith({
      startDate: today,
      endDate: today,
      status: 'active',
      accountId: 'account-cash',
      type: 'income',
    }));
  });

});
