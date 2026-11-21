import { getCurrencyConfig, isSupportedCurrency } from "../regional/currencies";
import { isValidTimeZone } from "../regional/format";

export interface CompanySetupInput {
  name: string;
  businessCategory: string;
  currency: string;
  country: string;
  timezone: string;
}

export interface CompanySetupValues {
  name: string;
  business_category: string;
  currency: string;
  currency_symbol: string;
  country: string;
  timezone: string;
  region_configured: true;
}

/** No financial posting or opening balances are created by this setup. */
export function prepareCompanySetup(input: CompanySetupInput): CompanySetupValues {
  const name = input.name.trim();
  const business_category = input.businessCategory.trim();
  const country = input.country.trim();
  const timezone = input.timezone.trim();
  const currency = input.currency.trim().toUpperCase();

  if (name.length < 2 || name.length > 120) {
    throw new Error("Company name must be 2–120 characters.");
  }
  if (business_category.length > 80) {
    throw new Error("Business type must not exceed 80 characters.");
  }
  if (!country || country.length > 100) {
    throw new Error("Enter a country (up to 100 characters).");
  }
  if (!isSupportedCurrency(currency)) {
    throw new Error("Choose a supported currency.");
  }
  if (!isValidTimeZone(timezone)) {
    throw new Error("Choose a valid IANA timezone, such as Asia/Karachi.");
  }
  const config = getCurrencyConfig(currency);
  if (!config) throw new Error("Currency settings could not be loaded.");
  return {
    name, business_category, country, timezone, currency,
    currency_symbol: config.symbol, region_configured: true,
  };
}
