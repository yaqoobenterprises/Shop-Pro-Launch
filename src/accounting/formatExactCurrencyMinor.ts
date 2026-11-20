/** Display-only formatter: never converts source amounts to floating-point. */
export function formatExactCurrencyMinor(
  value: string, currency: string,
): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value) ||
      !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invalid exact money display source.");
  }
  let digits: number;
  try {
    digits = new Intl.NumberFormat("en-US", {
      style: "currency", currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error("Unsupported display currency.");
  }
  if (!Number.isInteger(digits) || digits < 0 || digits > 3) {
    throw new Error("Unsupported currency decimal scale.");
  }
  const divisor = 10n ** BigInt(digits);
  const amount = BigInt(value);
  const whole = (amount / divisor).toLocaleString("en-US");
  const remainder = amount % divisor;
  const fraction = digits === 0
    ? ""
    : "." + remainder.toString().padStart(digits, "0");
  return `${currency} ${whole}${fraction}`;
}
