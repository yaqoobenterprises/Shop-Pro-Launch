import { getSecurityPrincipal } from '../lib/security';
import { getSupabaseClient, hasConfiguredCloudSession } from '../lib/supabase';
import type { MonthlySummary } from '../types/ledger';
import { getOfflineQueue } from './offlineQueue';
import { isDemoOrganization, requireAuthoritativeCloudRead, type LedgerReadOptions } from './ledgerReadPolicy';
export async function getMonthlyLedgerSummary(year: number, month: number, options: LedgerReadOptions = {}): Promise<MonthlySummary | null> {
    const principal = getSecurityPrincipal();
    const isDemo = isDemoOrganization(principal?.organizationId);
    if (options.requireCloudSource) await requireAuthoritativeCloudRead(principal, 'monthly ledger summaries');
    if (!isDemo && principal && await hasConfiguredCloudSession(principal.id)) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('view_monthly_summary')
          .select('*')
          .eq('year', year)
          .eq('month', month)
          .maybeSingle();
        if (!error && data) {
          return {
            month_start: data.month_start,
            year: data.year,
            month: data.month,
            income_paisa: Number(data.income_paisa || 0),
            expense_paisa: Number(data.expense_paisa || 0),
            net_profit_paisa: Number(data.net_profit_paisa || 0),
            capital_in_paisa: Number(data.capital_in_paisa || 0),
            withdrawal_paisa: Number(data.withdrawal_paisa || 0),
            adjustment_in_paisa: Number(data.adjustment_in_paisa || 0),
            adjustment_out_paisa: Number(data.adjustment_out_paisa || 0),
          };
        }
        if (error && options.requireCloudSource) throw error;
      } catch (error) {
        if (options.requireCloudSource) {
          throw new Error('Shop Pro could not retrieve the monthly summary from the cloud.', { cause: error });
        }
        // Fall back
      }
    }

    if (options.requireCloudSource) return null;

    const queue = (await getOfflineQueue()).filter((tx) =>
      !principal ||
      (tx.organizationId === principal.organizationId && tx.createdBy === principal.id),
    );
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthlyTxs = queue.filter((tx) => tx.businessDate.startsWith(prefix));
    if (!monthlyTxs.length) return null;

    let income = 0;
    let expense = 0;
    let capitalIn = 0;
    let withdrawal = 0;
    let adjIn = 0;
    let adjOut = 0;
    for (const tx of monthlyTxs) {
      if (tx.type === 'income') income += tx.amountPaisa;
      else if (tx.type === 'expense') expense += tx.amountPaisa;
      else if (tx.type === 'capital_in') capitalIn += tx.amountPaisa;
      else if (tx.type === 'withdrawal') withdrawal += tx.amountPaisa;
      else if (tx.type === 'adjustment' && tx.adjustmentDir === 'in') adjIn += tx.amountPaisa;
      else if (tx.type === 'adjustment' && tx.adjustmentDir === 'out') adjOut += tx.amountPaisa;
    }
    return {
      month_start: `${prefix}-01`,
      year,
      month,
      income_paisa: income,
      expense_paisa: expense,
      net_profit_paisa: income - expense,
      capital_in_paisa: capitalIn,
      withdrawal_paisa: withdrawal,
      adjustment_in_paisa: adjIn,
      adjustment_out_paisa: adjOut,
    };
  }

export async function getYearlyLedgerSummary(year: number, options: LedgerReadOptions = {}): Promise<MonthlySummary[]> {
    const principal = getSecurityPrincipal();
    const isDemo = isDemoOrganization(principal?.organizationId);
    if (options.requireCloudSource) await requireAuthoritativeCloudRead(principal, 'yearly ledger summaries');
    if (!isDemo && principal && await hasConfiguredCloudSession(principal.id)) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('view_monthly_summary')
          .select('*')
          .eq('year', year)
          .order('month', { ascending: true });
        if (!error && data && (data.length > 0 || options.requireCloudSource)) {
          return data.map((row: any) => ({
            month_start: row.month_start,
            year: row.year,
            month: row.month,
            income_paisa: Number(row.income_paisa || 0),
            expense_paisa: Number(row.expense_paisa || 0),
            net_profit_paisa: Number(row.net_profit_paisa || 0),
            capital_in_paisa: Number(row.capital_in_paisa || 0),
            withdrawal_paisa: Number(row.withdrawal_paisa || 0),
            adjustment_in_paisa: Number(row.adjustment_in_paisa || 0),
            adjustment_out_paisa: Number(row.adjustment_out_paisa || 0),
          }));
        }
        if (error && options.requireCloudSource) throw error;
      } catch (error) {
        if (options.requireCloudSource) {
          throw new Error('Shop Pro could not retrieve the yearly summary from the cloud.', { cause: error });
        }
        // Fall back
      }
    }
    if (options.requireCloudSource) return [];
    if (isDemo && principal) {
      const queue = (await getOfflineQueue()).filter((transaction) =>
        transaction.organizationId === principal.organizationId &&
        transaction.createdBy === principal.id &&
        transaction.businessDate.startsWith(`${year}-`),
      );
      const months = new Map<number, MonthlySummary>();
      for (const transaction of queue) {
        const month = Number(transaction.businessDate.slice(5, 7));
        let summary = months.get(month);
        if (!summary) {
          summary = {
            month_start: `${year}-${String(month).padStart(2, '0')}-01`,
            year,
            month,
            income_paisa: 0,
            expense_paisa: 0,
            net_profit_paisa: 0,
            capital_in_paisa: 0,
            withdrawal_paisa: 0,
            adjustment_in_paisa: 0,
            adjustment_out_paisa: 0,
          };
          months.set(month, summary);
        }
        if (transaction.type === 'income') {
          summary.income_paisa += transaction.amountPaisa;
          summary.net_profit_paisa += transaction.amountPaisa;
        } else if (transaction.type === 'expense') {
          summary.expense_paisa += transaction.amountPaisa;
          summary.net_profit_paisa -= transaction.amountPaisa;
        } else if (transaction.type === 'capital_in') {
          summary.capital_in_paisa += transaction.amountPaisa;
        } else if (transaction.type === 'withdrawal') {
          summary.withdrawal_paisa += transaction.amountPaisa;
        } else if (transaction.type === 'adjustment' && transaction.adjustmentDir === 'in') {
          summary.adjustment_in_paisa += transaction.amountPaisa;
        } else if (transaction.type === 'adjustment' && transaction.adjustmentDir === 'out') {
          summary.adjustment_out_paisa += transaction.amountPaisa;
        }
      }
      return [...months.values()].sort((left, right) => left.month - right.month);
    }
    return [];
  }
