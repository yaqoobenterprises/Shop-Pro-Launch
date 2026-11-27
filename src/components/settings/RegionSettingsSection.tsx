import React, { useEffect, useState, useRef } from 'react';
import { Select } from '../common/Select';
import { useAuth } from '../../context/AuthContext';
import { useRegion } from '../../regional/region';
import { getCurrencyConfig } from '../../regional/currencies';
import { getSupabaseClient, hasConfiguredCloudSession, isSupabaseConfigured } from '../../lib/supabase';
import { useI18n } from '../../i18n';
import { Globe } from 'lucide-react';
import { getOfflineQueue } from '../../services/offlineQueue';
import { getOfflineDrafts } from '../../services/offlineDraftStore';
import { getOfflineAccountOperations } from '../../services/offlineAccountStore';

async function hasFinancialHistory(organizationId: string): Promise<boolean> {
  const client = getSupabaseClient();
  const [transactions, ledger, drafts, transfers, balances, queue, localDrafts, accountOps] = await Promise.all([
    client.from('transactions').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
    client.from('account_ledger_entries').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
    client.from('transaction_drafts').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
    client.from('account_transfers').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
    client.from('payment_accounts').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).or('opening_balance.neq.0,balance_paisa.neq.0'),
    getOfflineQueue(), getOfflineDrafts(organizationId), getOfflineAccountOperations(organizationId),
  ] as const);
  const reads = [transactions,ledger,drafts,transfers,balances];
  if (reads.some(result => result.error || result.count === null)) throw new Error('Financial history could not be verified.');
  return reads.some(result => (result.count ?? 0)>0) || queue.some(item=>item.organizationId===organizationId) || localDrafts.length>0 || accountOps.length>0;
}

const CURRENCY_OPTIONS = [
  'PKR', 'USD', 'INR', 'BDT', 'LKR', 'NPR', 'AED', 'SAR', 'QAR', 'TRY',
  'EGP', 'CAD', 'AUD', 'NZD', 'GBP', 'EUR', 'CHF', 'SEK', 'NOK', 'DKK',
] as const;

export const RegionSettingsSection: React.FC = () => {
  const { user, organization, updateOrganization, isCloudAccount } = useAuth();
  const { region, setRegion } = useRegion();
  const { t } = useI18n();

  const isOwner = user?.role === 'OWNER';
  const [currency, setCurrency] = useState(organization.currency || region.currency || 'PKR');
  const currencyOptions = CURRENCY_OPTIONS.includes(currency as (typeof CURRENCY_OPTIONS)[number])
    ? CURRENCY_OPTIONS
    : [currency, ...CURRENCY_OPTIONS];
  const saveLock = useRef(false);
  const [hasEntries, setHasEntries] = useState(false);
  const [isCheckingEntries, setIsCheckingEntries] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkTransactions() {
      setIsCheckingEntries(true);
      if (!organization?.id) {
        setIsCheckingEntries(false);
        return;
      }
      if (!isSupabaseConfigured() || !isCloudAccount || !user?.id) {
        if (isMounted) {
          setHasEntries(true);
          setIsCheckingEntries(false);
        }
        return;
      }
      if (!(await hasConfiguredCloudSession(user.id))) {
        if (isMounted) {
          setHasEntries(true);
          setIsCheckingEntries(false);
        }
        return;
      }

      try {
        const hasHistory = await hasFinancialHistory(organization.id);
        if (isMounted) setHasEntries(hasHistory);
      } catch (error) {
        console.error('Could not verify whether shop entries exist:', error);
        if (isMounted) setHasEntries(true);
      } finally {
        if (isMounted) setIsCheckingEntries(false);
      }
    }

    void checkTransactions();
    return () => {
      isMounted = false;
    };
  }, [organization?.id, user?.id, isCloudAccount]);

  const handleCurrencyChange = async (event: { target: { value: string } }) => {
    const nextCurrency = event.target.value;
    if (!isOwner || !organization?.id || nextCurrency === currency || hasEntries || isCheckingEntries || saveLock.current || !isCloudAccount) return;

    const previousCurrency = currency;
    const currencyConfig = getCurrencyConfig(nextCurrency);
    if (!currencyConfig) return;

    if (!window.confirm(`Change shop currency to ${nextCurrency}? This changes display units, not historical amounts. Continue only for a new shop with no financial records.`)) return;
    saveLock.current = true;
    setCurrency(nextCurrency);
    setIsSaving(true);
    setSaveError(null);

    const currencySymbol = currencyConfig.symbol || nextCurrency;
    const updates = {
      currency: nextCurrency,
      currency_symbol: currencySymbol,
      region_configured: true,
      updated_at: new Date().toISOString(),
    };

    try {
      const hasCloudSession = Boolean(
        isCloudAccount && user?.id && await hasConfiguredCloudSession(user.id),
      );
      if (isCloudAccount && !hasCloudSession) {
        throw new Error('Your cloud session is missing or has expired. Sign in again to save shop settings.');
      }
      if (hasCloudSession) {
        if (await hasFinancialHistory(organization.id)) { setHasEntries(true); throw new Error('Currency is locked because financial records or pending operations exist.'); }
        const { data, error } = await getSupabaseClient()
          .from('organizations')
          .update(updates)
          .eq('id', organization.id).select('id').maybeSingle();
        if (error || !data) throw new Error(error?.message || 'Currency change could not be verified.');
      } else if (nextCurrency !== organization.currency) {
        throw new Error(t('settings.offlineCurrencyLocked'));
      }

      updateOrganization(updates);
      setRegion({ currency: nextCurrency, currencySymbol });
    } catch (error) {
      setCurrency(previousCurrency);
      setSaveError(error instanceof Error ? error.message : t('region.saveFailed'));
    } finally {
      saveLock.current = false; setIsSaving(false);
    }
  };

  return (
    <section id="region" className="workspace-panel settings-section p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="settings-icon"><Globe className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">{t('region.title')}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{t('region.currencyDescription')}</p>
        </div>
      </div>
      <label htmlFor="settings-currency" className="mb-1 block text-sm font-semibold text-on-surface">
        {t('region.currency')}
      </label>
      <Select
        id="settings-currency"
        disabled={!isOwner || hasEntries || isCheckingEntries || isSaving || !isSupabaseConfigured()}
        value={currency}
        onChange={handleCurrencyChange}
        title={
          !isOwner
            ? t('region.ownerOnly')
            : hasEntries
              ? t('region.currencyLocked')
              : !isSupabaseConfigured()
                ? t('region.offlineCurrencyLocked')
                : undefined
        }
        className="workspace-control w-full min-h-10 px-3 py-2 text-xs disabled:opacity-60"
      >
        {currencyOptions.map((code) => {
          const config = getCurrencyConfig(code);
          return config ? (
            <option key={config.code} value={config.code}>
              {config.code} ({config.symbol}) - {config.name}
            </option>
          ) : null;
        })}
      </Select>
      <p className="mt-2 text-xs text-text-muted">{isCheckingEntries ? "Checking existing financial records…" : hasEntries ? "Currency is locked when financial records exist or cannot be verified." : "Changing currency does not convert monetary amounts."}</p>
      {saveError && <p role="alert" className="mt-2 text-xs text-danger">{saveError}</p>}
    </section>
  );
};
