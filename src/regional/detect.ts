import { isSupportedCurrency, SUPPORTED_CURRENCIES } from './currencies';

export interface DetectedRegion {
  timeZone: string;
  country?: string;
  currency?: string;
  uiLanguage: 'en' | 'ur';
}

const TIMEZONE_TO_REGION: Record<string, { country: string; currency: string }> = {
  'Asia/Karachi': { country: 'Pakistan', currency: 'PKR' },
  'Asia/Kolkata': { country: 'India', currency: 'INR' },
  'Asia/Calcutta': { country: 'India', currency: 'INR' },
  'Asia/Dhaka': { country: 'Bangladesh', currency: 'BDT' },
  'Asia/Colombo': { country: 'Sri Lanka', currency: 'LKR' },
  'Asia/Kathmandu': { country: 'Nepal', currency: 'NPR' },
  'Asia/Dubai': { country: 'United Arab Emirates', currency: 'AED' },
  'Asia/Riyadh': { country: 'Saudi Arabia', currency: 'SAR' },
  'Asia/Qatar': { country: 'Qatar', currency: 'QAR' },
  'Europe/Istanbul': { country: 'Turkey', currency: 'TRY' },
  'Asia/Istanbul': { country: 'Turkey', currency: 'TRY' },
  'Africa/Cairo': { country: 'Egypt', currency: 'EGP' },
  'Europe/London': { country: 'United Kingdom', currency: 'GBP' },
  'America/New_York': { country: 'United States', currency: 'USD' },
  'America/Chicago': { country: 'United States', currency: 'USD' },
  'America/Denver': { country: 'United States', currency: 'USD' },
  'America/Los_Angeles': { country: 'United States', currency: 'USD' },
  'America/Phoenix': { country: 'United States', currency: 'USD' },
  'America/Anchorage': { country: 'United States', currency: 'USD' },
  'Pacific/Honolulu': { country: 'United States', currency: 'USD' },
  'America/Toronto': { country: 'Canada', currency: 'CAD' },
  'America/Vancouver': { country: 'Canada', currency: 'CAD' },
  'America/Montreal': { country: 'Canada', currency: 'CAD' },
  'America/Edmonton': { country: 'Canada', currency: 'CAD' },
  'America/Winnipeg': { country: 'Canada', currency: 'CAD' },
  'Australia/Sydney': { country: 'Australia', currency: 'AUD' },
  'Australia/Melbourne': { country: 'Australia', currency: 'AUD' },
  'Australia/Brisbane': { country: 'Australia', currency: 'AUD' },
  'Australia/Perth': { country: 'Australia', currency: 'AUD' },
  'Australia/Adelaide': { country: 'Australia', currency: 'AUD' },
  'Pacific/Auckland': { country: 'New Zealand', currency: 'NZD' },
  'Europe/Berlin': { country: 'Germany', currency: 'EUR' },
  'Europe/Paris': { country: 'France', currency: 'EUR' },
  'Europe/Madrid': { country: 'Spain', currency: 'EUR' },
  'Europe/Rome': { country: 'Italy', currency: 'EUR' },
  'Europe/Amsterdam': { country: 'Netherlands', currency: 'EUR' },
  'Europe/Brussels': { country: 'Belgium', currency: 'EUR' },
  'Europe/Vienna': { country: 'Austria', currency: 'EUR' },
  'Europe/Dublin': { country: 'Ireland', currency: 'EUR' },
  'Europe/Lisbon': { country: 'Portugal', currency: 'EUR' },
  'Europe/Athens': { country: 'Greece', currency: 'EUR' },
  'Europe/Helsinki': { country: 'Finland', currency: 'EUR' },
  'Europe/Zurich': { country: 'Switzerland', currency: 'CHF' },
  'Europe/Stockholm': { country: 'Sweden', currency: 'SEK' },
  'Europe/Oslo': { country: 'Norway', currency: 'NOK' },
  'Europe/Copenhagen': { country: 'Denmark', currency: 'DKK' },
  'Asia/Kuala_Lumpur': { country: 'Malaysia', currency: 'MYR' },
  'Asia/Singapore': { country: 'Singapore', currency: 'SGD' },
  'Asia/Manila': { country: 'Philippines', currency: 'PHP' },
  'Africa/Lagos': { country: 'Nigeria', currency: 'NGN' },
  'Africa/Nairobi': { country: 'Kenya', currency: 'KES' },
  'Africa/Johannesburg': { country: 'South Africa', currency: 'ZAR' },
  'America/Sao_Paulo': { country: 'Brazil', currency: 'BRL' },
  'America/Mexico_City': { country: 'Mexico', currency: 'MXN' },
};

/**
 * Detect device regional settings without any network calls or geolocation prompts.
 * Uses Intl and navigator.languages. If timezone mapping is uncertain, returns no currency.
 */
export function detectDeviceRegion(): DetectedRegion {
  let timeZone = 'Asia/Karachi';
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && typeof resolved === 'string') {
      timeZone = resolved;
    }
  } catch {
    // Fall back to default
  }

  // Detect language
  let uiLanguage: 'en' | 'ur' = 'en';
  try {
    const languages = typeof navigator !== 'undefined'
      ? (navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])
      : [];
    const firstMatch = languages.find((lang) => typeof lang === 'string' && lang.toLowerCase().startsWith('ur'));
    if (firstMatch) {
      uiLanguage = 'ur';
    }
  } catch {
    // Default to en
  }

  const mapping = TIMEZONE_TO_REGION[timeZone];
  if (mapping && isSupportedCurrency(mapping.currency)) {
    return {
      timeZone,
      country: mapping.country,
      currency: mapping.currency,
      uiLanguage,
    };
  }

  let localeCountry: string | undefined;
  let localeCountryCandidate: string | undefined;
  let localeCurrency: string | undefined;
  try {
    const languages = typeof navigator !== 'undefined'
      ? (navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])
      : [];
    for (const language of languages) {
      if (typeof language !== 'string') continue;
      const region = new Intl.Locale(language).region;
      if (!region) continue;
      localeCountryCandidate ||= new Intl.DisplayNames([language], { type: 'region' }).of(region) || undefined;
      const currencyConfig = SUPPORTED_CURRENCIES.find((item) =>
        item.defaultCountries.includes(region) && isSupportedCurrency(item.code),
      );
      if (currencyConfig) {
        localeCountry = new Intl.DisplayNames([language], { type: 'region' }).of(region) || undefined;
        localeCurrency = currencyConfig.code;
        break;
      }
    }
  } catch {
    // Unsupported locale metadata falls back to timezone-only detection.
  }
  localeCountry ||= localeCountryCandidate;

  return {
    timeZone,
    country: localeCountry,
    currency: localeCurrency,
    uiLanguage,
  };
}
