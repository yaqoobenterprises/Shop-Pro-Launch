import React, { useState } from 'react';
import { Select } from "../common/Select";
import { Globe, Check, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegion } from '../../regional/region';
import { detectDeviceRegion } from '../../regional/detect';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, isSupportedCurrency } from '../../regional/currencies';
import { getSupabaseClient, hasConfiguredCloudSession } from '../../lib/supabase';
import { saveUserPreferences } from '../../services/userPreferencesService';
import { isValidTimeZone } from '../../regional/format';
import { useI18n } from '../../i18n';
import { isFeatureEnabled } from '../../config/features';

interface FirstRunRegionalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirstRunRegionalModal: React.FC<FirstRunRegionalModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, organization, updateOrganization, isCloudAccount } = useAuth();
  const { setRegion } = useRegion();
  const { setLanguage: setI18nLanguage, t } = useI18n();
  const languageUrEnabled = isFeatureEnabled('languageUr');

  const [detected] = useState(() => detectDeviceRegion());
  const [currency, setCurrency] = useState(detected.currency || organization.currency || 'PKR');
  const [timezone, setTimezone] = useState(detected.timeZone || organization.timezone || 'Asia/Karachi');
  const [country, setCountry] = useState(detected.country || organization.country || 'Pakistan');
  const [language, setLanguage] = useState<'en' | 'ur'>(() =>
    languageUrEnabled ? detected.uiLanguage || 'en' : 'en',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!organization?.id || !user?.id) return;
    if (!isSupportedCurrency(currency) || !isValidTimeZone(timezone) || !country.trim()) {
      setError(t('region.invalidSettings'));
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const cfg = getCurrencyConfig(currency);
    const currencySymbol = cfg?.symbol || currency;

    try {
      if (isCloudAccount) {
        if (!(await hasConfiguredCloudSession(user.id))) {
          throw new Error('Your cloud session is missing or has expired. Sign in again to save shop settings.');
        }
        const supabase = getSupabaseClient();
        const { error: orgError } = await supabase
          .from('organizations')
          .update({
          currency,
          currency_symbol: currencySymbol,
          country,
          timezone,
          region_configured: true,
          updated_at: new Date().toISOString(),
          })
          .eq('id', organization.id);

        if (orgError) throw new Error(orgError.message);

        if (currency !== 'PKR' && cfg) {
          const { error: categoryError } = await supabase
            .from('categories')
            .update({ unusual_amount_limit_paisa: cfg.unusualAmountLimitMinor })
            .eq('organization_id', organization.id)
            .eq('unusual_amount_limit_paisa', 5000000);
          if (categoryError) throw new Error(categoryError.message);
        }
      }

      if (languageUrEnabled) {
        await saveUserPreferences(user.id, organization.id, { language });
      }

      updateOrganization({
        currency,
        currency_symbol: currencySymbol,
        country,
        timezone,
        region_configured: true,
      });

      setRegion({
        currency,
        currencySymbol,
        timeZone: timezone,
        country,
        ...(languageUrEnabled ? { uiLanguage: language } : {}),
      });
      if (languageUrEnabled) setI18nLanguage(language);

      onClose();
    } catch (err) {
      console.error('Failed to configure shop region:', err);
      setError(err instanceof Error ? err.message : t('region.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regional-setup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="workspace-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <h2 id="regional-setup-title" className="text-lg font-bold text-on-surface">
              {t('region.setupWelcome')}
            </h2>
            <p className="text-xs text-text-muted">
              {t('region.setupDescription')}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-danger-bg border border-danger-border p-3 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 text-xs">
          <div>
            <label htmlFor="region-currency" className="block font-semibold text-secondary mb-1">
              {t('region.currency')}
            </label>
            <Select
              id="region-currency"
              value={currency}
              onChange={(e) => {
                const next = e.target.value;
                setCurrency(next);
                const conf = getCurrencyConfig(next);
                if (conf && conf.defaultCountries[0] && !detected.country) {
                  setCountry(new Intl.DisplayNames(['en'], { type: 'region' }).of(conf.defaultCountries[0]) || organization.country);
                }
              }}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol}) — {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="region-country" className="block font-semibold text-secondary mb-1">
              {t('region.country')}
            </label>
            <input
              id="region-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs"
              placeholder="e.g. Pakistan, United States"
            />
          </div>

          <div>
            <label htmlFor="region-timezone" className="block font-semibold text-secondary mb-1">
              {t('region.timezone')}
            </label>
            <input
              id="region-timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs font-mono"
              placeholder="e.g. Asia/Karachi"
            />
          </div>

          {languageUrEnabled && <div>
            <label htmlFor="region-language" className="block font-semibold text-secondary mb-1">
              {t('region.preferredLanguage')}
            </label>
            <Select
              id="region-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ur')}
              className="workspace-control w-full min-h-10 px-3 py-2 text-xs"
            >
              <option value="en">{t('settings.languageEnglish')}</option>
              <option value="ur">{t('settings.languageUrdu')}</option>
            </Select>
          </div>}
        </div>

        <div className="pt-2">
          <button
            type="button"
            disabled={isSubmitting || !currency || !timezone}
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50 transition"
          >
            <Check className="h-4 w-4" />
            {isSubmitting ? t('region.configuring') : t('region.confirmSetup')}
          </button>
        </div>
      </div>
    </div>
  );
};
