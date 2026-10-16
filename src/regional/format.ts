import { getModuleRegion } from './region';
import { getRegionLocale } from './locale';

export { getRegionLocale } from './locale';
export { parseLocalizedMoneyInput, parseMoneyInput } from './moneyInput';

const BIDI_REGEX = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export function isValidTimeZone(tz?: string | null): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeTimeZone(tz?: string | null): string {
  if (tz && isValidTimeZone(tz)) return tz;
  return 'Asia/Karachi';
}

export interface FormatMoneyOptions {
  currency?: string;
  showFractional?: boolean;
  showPaisaIfFraction?: boolean;
  locale?: string;
}

/**
 * Formats minor units (paisa/cents) to currency string.
 * For PKR: Byte-identical to formatPaisa (en-PK, 'Rs X').
 * For other currencies: Intl.NumberFormat style: 'currency' with 2 decimals only when fractional.
 * Strips all invisible Unicode control characters. Latin digits only.
 */
export function formatMoney(minor: number, options?: FormatMoneyOptions): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error('Minor amount must be a safe integer');
  }

  const activeRegion = getModuleRegion();
  const currencyCode = (options?.currency || activeRegion.currency || 'PKR').toUpperCase();
  const locale = options?.locale || (
    currencyCode === activeRegion.currency ? getRegionLocale() : 'en'
  );
  const showFraction = options?.showFractional ?? options?.showPaisaIfFraction ?? false;
  const major = minor / 100;
  const isFractional = minor % 100 !== 0;

  if (currencyCode === 'PKR') {
    if (isFractional && showFraction) {
      const formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        numberingSystem: 'latn',
      }).format(major);
      return `Rs ${formatted}`;
    }
    const rounded = Math.round(major);
    const formatted = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      numberingSystem: 'latn',
    }).format(rounded);
    return `Rs ${formatted}`;
  }

  const fractionDigits = (isFractional || showFraction) ? 2 : 0;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    numberingSystem: 'latn',
  }).format(major);

  return formatted.replace(BIDI_REGEX, '').replace(/\u00A0/g, ' ').trim();
}

/**
 * Returns YYYY-MM-DD business date in the target timezone (defaults to current shop region).
 */
export function getBusinessDate(
  dateOrTimestamp: Date | string | number = new Date(),
  timeZone?: string
): string {
  const d = typeof dateOrTimestamp === 'object' ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid timestamp provided for business date derivation');
  }
  const tz = sanitizeTimeZone(timeZone || getModuleRegion().timeZone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).format(d);
}

/**
 * Returns formatted time for display in the target timezone (e.g. "02:30 PM").
 */
export function formatBusinessTime(
  dateOrTimestamp: Date | string | number = new Date(),
  timeZone?: string
): string {
  const d = typeof dateOrTimestamp === 'object' ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return '-';
  const tz = sanitizeTimeZone(timeZone || getModuleRegion().timeZone);
  return new Intl.DateTimeFormat(getRegionLocale(), {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    numberingSystem: 'latn',
  }).format(d).replace(BIDI_REGEX, '').replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

export function formatBusinessDateTime(
  dateOrTimestamp: Date | string | number,
  timeZone?: string,
): string {
  const d = typeof dateOrTimestamp === 'object' ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat(getRegionLocale(), {
    timeZone: sanitizeTimeZone(timeZone || getModuleRegion().timeZone),
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
  }).format(d)
    .replace(BIDI_REGEX, '')
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

/**
 * Formats a YYYY-MM-DD business date string into human-readable format (e.g. "13 Oct 2026").
 */
export function formatBusinessDate(businessDateStr: string): string {
  if (!businessDateStr) return '-';
  const parts = businessDateStr.split('-');
  if (parts.length !== 3) return businessDateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(Date.UTC(year, month, day));
  return new Intl.DateTimeFormat(getRegionLocale(), {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    numberingSystem: 'latn',
  }).format(d).replace(BIDI_REGEX, '').replace(/-/g, ' ');
}

/**
 * Derives previous business date in the target timezone.
 */
export function getPreviousBusinessDate(
  referenceDate: Date = new Date(),
  timeZone?: string
): string {
  const today = getBusinessDate(referenceDate, timeZone);
  const parts = today.split('-');
  const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
