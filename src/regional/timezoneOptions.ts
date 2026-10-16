import { SUPPORTED_CURRENCIES } from './currencies';

const COMMON_TIMEZONES = [
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Europe/London', 'Europe/Berlin',
  'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Istanbul',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo', 'America/Mexico_City',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Kiritimati',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'UTC',
];

const timezoneIntl = Intl as typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[];
};

export const ALL_TIMEZONES = timezoneIntl.supportedValuesOf
  ? [...new Set([...timezoneIntl.supportedValuesOf('timeZone'), 'UTC'])]
  : COMMON_TIMEZONES;

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const COUNTRY_OPTIONS = [...new Set(
  SUPPORTED_CURRENCIES.flatMap((currency) => currency.defaultCountries),
)].map((code) => countryDisplayNames.of(code) || code);
