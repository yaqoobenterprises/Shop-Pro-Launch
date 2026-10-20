import React, { useEffect, useState } from 'react';
import { Select } from '../common/Select';
import { useAuth } from '../../context/AuthContext';
import { useRegion } from '../../regional/region';
import { getCurrencyConfig } from '../../regional/currencies';
import { getSupabaseClient, hasConfiguredCloudSession, isSupabaseConfigured } from '../../lib/supabase';
import { useI18n } from '../../i18n';
import { Globe } from 'lucide-react';

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
        const [{ count: transactionCount, error: transactionError }, { count: ledgerCount, error: ledgerError }] = await Promise.all([
          getSupabaseClient()
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization.id),
          getSupabaseClient()
            .from('account_ledger_entries')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization.id),
        ]);
        if (transactionError) throw transactionError;
        if (ledgerError) throw ledgerError;
        if (isMounted) setHasEntries((transactionCount ?? 0) > 0 || (ledgerCount ?? 0) > 0);
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
    if (!isOwner || !organization?.id || nextCurrency === currency) return;

    const previousCurrency = currency;
    const currencyConfig = getCurrencyConfig(nextCurrency);
    if (!currencyConfig) return;

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
        const { error } = await getSupabaseClient()
          .from('organizations')
          .update(updates)
          .eq('id', organization.id);
        if (error) throw new Error(error.message);
      } else if (nextCurrency !== organization.currency) {
        throw new Error(t('settings.offlineCurrencyLocked'));
      }

      updateOrganization(updates);
      setRegion({ currency: nextCurrency, currencySymbol });
    } catch (error) {
      setCurrency(previousCurrency);
      setSaveError(error instanceof Error ? error.message : t('region.saveFailed'));
    } finally {
      setIsSaving(false);
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
      {saveError && <p role="alert" className="mt-2 text-xs text-danger">{saveError}</p>}
    </section>
  );
};
