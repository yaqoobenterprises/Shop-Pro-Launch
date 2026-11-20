import { parseMinorUnits } from "../../accounting/minorUnits";

/** UI-only PKR input formatting; calculations never pass through Number. */
export function rupeeTextToMinor(value: string): string | null {
  const clean = value.trim().replace(/,/g, "");
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const result = `${whole}${fraction.padEnd(2, "0")}`;
  try {
    return parseMinorUnits(BigInt(result).toString()).toString();
  } catch {
    return null;
  }
}

export function formatMinorForPreview(minor: string): string {
  const amount = parseMinorUnits(minor);
  const absolute = amount < 0n ? -amount : amount;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${amount < 0n ? "-" : ""}Rs ${whole}.${cents}`;
}
