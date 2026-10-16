import { getCurrencyConfig } from './currencies';
import { getModuleRegion } from './region';

export function getRegionLocale(): string {
  const { uiLanguage, country, currency } = getModuleRegion();
  const activeCurrency = getCurrencyConfig(currency);
  const englishNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const localizedNames = new Intl.DisplayNames([uiLanguage], { type: 'region' });
  const countryCode = country && activeCurrency
    ? activeCurrency.defaultCountries.find(
      (code) => englishNames.of(code) === country || localizedNames.of(code) === country,
    )
    : undefined;
  if (uiLanguage === 'ur') return `ur-${countryCode || 'PK'}-u-nu-latn`;
  return countryCode ? `en-${countryCode}` : 'en';
}
