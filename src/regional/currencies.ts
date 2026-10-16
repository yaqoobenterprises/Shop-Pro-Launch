export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  decimals: 2;
  defaultCountries: string[];
  unusualAmountLimitMinor: number;
}

/**
 * Curated list of currencies with exactly 2 decimal places.
 * Currencies with 0 or 3 decimals (JPY, KWD, BHD, OMR) are not supported in this version.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyConfig[] = [
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', decimals: 2, defaultCountries: ['PK'], unusualAmountLimitMinor: 5000000 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, defaultCountries: ['IN'], unusualAmountLimitMinor: 5000000 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', decimals: 2, defaultCountries: ['BD'], unusualAmountLimitMinor: 5000000 },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', decimals: 2, defaultCountries: ['LK'], unusualAmountLimitMinor: 15000000 },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee', decimals: 2, defaultCountries: ['NP'], unusualAmountLimitMinor: 5000000 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2, defaultCountries: ['AE'], unusualAmountLimitMinor: 200000 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimals: 2, defaultCountries: ['SA'], unusualAmountLimitMinor: 200000 },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', decimals: 2, defaultCountries: ['QA'], unusualAmountLimitMinor: 200000 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', decimals: 2, defaultCountries: ['TR'], unusualAmountLimitMinor: 1500000 },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', decimals: 2, defaultCountries: ['EG'], unusualAmountLimitMinor: 2500000 },
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, defaultCountries: ['US'], unusualAmountLimitMinor: 50000 },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2, defaultCountries: ['CA'], unusualAmountLimitMinor: 70000 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, defaultCountries: ['AU'], unusualAmountLimitMinor: 75000 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2, defaultCountries: ['NZ'], unusualAmountLimitMinor: 80000 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, defaultCountries: ['GB'], unusualAmountLimitMinor: 40000 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, defaultCountries: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'PT', 'AT', 'FI', 'GR'], unusualAmountLimitMinor: 50000 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2, defaultCountries: ['CH'], unusualAmountLimitMinor: 50000 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2, defaultCountries: ['SE'], unusualAmountLimitMinor: 500000 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2, defaultCountries: ['NO'], unusualAmountLimitMinor: 500000 },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2, defaultCountries: ['DK'], unusualAmountLimitMinor: 350000 },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2, defaultCountries: ['MY'], unusualAmountLimitMinor: 250000 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2, defaultCountries: ['SG'], unusualAmountLimitMinor: 70000 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2, defaultCountries: ['PH'], unusualAmountLimitMinor: 2500000 },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 2, defaultCountries: ['NG'], unusualAmountLimitMinor: 75000000 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2, defaultCountries: ['KE'], unusualAmountLimitMinor: 6500000 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2, defaultCountries: ['ZA'], unusualAmountLimitMinor: 1000000 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2, defaultCountries: ['BR'], unusualAmountLimitMinor: 250000 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2, defaultCountries: ['MX'], unusualAmountLimitMinor: 1000000 },
] as const;

export const CURRENCY_MAP = new Map<string, CurrencyConfig>(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

export function getCurrencyConfig(code: string): CurrencyConfig | undefined {
  return CURRENCY_MAP.get(code.toUpperCase());
}

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_MAP.has(code.toUpperCase());
}
