import React, { useState, useEffect } from 'react';
import { Globe, Lock, Clock, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegion } from '../../regional/region';
import { SUPPORTED_CURRENCIES, getCurrencyConfig } from '../../regional/currencies';
import { getSupabaseClient } from '../../lib/supabase';
import { isSupabaseConfigured } from '../../lib/supabase';
import { getRegionLocale, isValidTimeZone } from '../../regional/format';
import { ALL_TIMEZONES, COUNTRY_OPTIONS } from '../../regional/timezoneOptions';
import { useI18n } from '../../i18n';

export const RegionSettingsSection: React.FC = () => {
  const { user, organization, updateOrganization } = useAuth();
  const { region, setRegion } = useRegion();
  const { t, language } = useI18n();

  const isOwner = user?.role === 'OWNER';

  const [currency, setCurrency] = useState(organization.currency || region.currency || 'PKR');
  const [timeZone, setTimeZone] = useState(organization.timezone || region.timeZone || 'Asia/Karachi');
  const [country, setCountry] = useState(organization.country || region.country || 'Pakistan');
  const [hasEntries, setHasEntries] = useState(false);
  const [isCheckingEntries, setIsCheckingEntries] = useState(true);
  const [tzSearch, setTzSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [timeZoneError, setTimeZoneError] = useState<string | null>(null);

  // Check if transactions exist to lock currency
  useEffect(() => {
    let isMounted = true;
    async function checkTransactions() {
      setIsCheckingEntries(true);
      if (!organization?.id) {
        setIsCheckingEntries(false);
        return;
      }
      if (!isSupabaseConfigured()) {
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
  }, [organization?.id]);

  // Live clock preview for selected timezone
  useEffect(() => {
    function updateClock() {
      try {
        const time = new Intl.DateTimeFormat(getRegionLocale(), {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(new Date());
        setCurrentTimeStr(time);
      } catch {
        setCurrentTimeStr('Invalid timezone');
      }
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [timeZone, region.currency, region.country, region.uiLanguage, language]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !organization?.id) return;

    setIsSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const cfg = getCurrencyConfig(currency);
    const currencySymbol = cfg?.symbol || currency;

    try {
      if (!isValidTimeZone(timeZone)) {
        setTimeZoneError('Select a valid IANA timezone.');
        return;
      }
      if (!country.trim()) throw new Error('Enter the shop country.');
      setTimeZoneError(null);
      const updates = {
        currency,
        currency_symbol: currencySymbol,
        timezone: timeZone,
        country: country.trim(),
        updated_at: new Date().toISOString(),
      };
      if (isSupabaseConfigured()) {
        const { error } = await getSupabaseClient()
          .from('organizations')
          .update(updates)
          .eq('id', organization.id);
        if (error) throw new Error(error.message);
      } else if (currency !== organization.currency) {
        throw new Error(t('settings.offlineCurrencyLocked'));
      }

      updateOrganization({
        ...updates,
      });

      setRegion({
        currency,
        currencySymbol,
        timeZone,
        country,
      });

      setSaveMessage(t('region.saved'));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="region" className="workspace-panel settings-section p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="settings-icon">
          <Globe className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">{t('region.title')}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {t('region.description')}
          </p>
        </div>
      </div>

      {!isOwner && (
        <div className="mb-4 rounded-xl border border-border-standard bg-surface-container-low p-3 text-xs text-text-muted">
          {t('region.ownerOnly')}
        </div>
      )}

      {saveMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-success-bg border border-success-border p-3 text-xs text-success">
          <Check className="h-4 w-4 shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {saveError && (
        <div className="mb-4 rounded-xl bg-danger-bg border border-danger-border p-3 text-xs text-danger">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 max-w-lg text-xs">
        <div>
          <label htmlFor="settings-currency" className="block font-semibold text-secondary mb-1">
            {t('region.currency')}
          </label>
          <div className="relative">
            <select
              id="settings-currency"
              disabled={!isOwner || hasEntries || isCheckingEntries || !isSupabaseConfigured()}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs disabled:opacity-60"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) — {c.name}
                </option>
              ))}
            </select>
            {hasEntries && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                <Lock className="h-3 w-3 shrink-0" />
                <span>{t('region.currencyLocked')}</span>
              </div>
            )}
            {!isSupabaseConfigured() && (
              <div className="mt-1.5 text-[11px] text-text-muted">
                {t('region.offlineCurrencyLocked')}
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="settings-country" className="block font-semibold text-secondary mb-1">
            {t('region.country')}
          </label>
          <input
            id="settings-country"
            type="text"
            disabled={!isOwner}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            list="settings-country-options"
            className="workspace-control w-full min-h-10 px-3 py-2 text-xs disabled:opacity-60"
          />
          <datalist id="settings-country-options">
            {COUNTRY_OPTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="settings-timezone" className="block font-semibold text-secondary mb-1">
            {t('region.timezone')}
          </label>
          <div className="space-y-2">
            {isOwner && (
              <input
                type="text"
                placeholder={t('region.searchTimezone')}
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                className="workspace-control w-full min-h-9 px-2.5 py-1 text-xs"
              />
            )}
            <select
              id="settings-timezone"
              disabled={!isOwner}
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs font-mono disabled:opacity-60"
            >
              {!ALL_TIMEZONES.includes(timeZone) && (
                <option value={timeZone}>{timeZone} (Current)</option>
              )}
              {ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase())).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          {timeZoneError && <p role="alert" className="mt-1 text-danger">{timeZoneError}</p>}

          <div className="mt-2 flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-text-muted">
              <Clock className="h-3.5 w-3.5" />
              {t('region.liveTime')}
            </span>
            <span className="font-mono font-semibold text-on-surface">{currentTimeStr}</span>
          </div>

          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {t('region.pastDates')}
            </span>
          </div>
        </div>

        {isOwner && (
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary rounded-xl font-semibold text-xs transition"
            >
              {isSaving ? t('settings.saving') : t('region.save')}
            </button>
          </div>
        )}
      </form>
    </section>
  );
};
