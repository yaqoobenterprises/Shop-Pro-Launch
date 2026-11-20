/**
 * Honest display for integer minor units.
 *
 * The current V2 RPC does NOT expose an authoritative, company-approved
 * currency exponent. Intl/ICU currency digits can differ from the company's
 * contractual scale (PKR is a known mismatch across runtimes). Never guess
 * major-unit conversion from locale or JS Number. Show exact units instead.
 */
export function formatExactCurrencyMinor(
  value: string, currency: string,
): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value) ||
      !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invalid exact money display source.");
  }
  return `${currency} ${BigInt(value).toLocaleString("en-US")} minor units`;
}
