/**
 * Shop business date engine (defaults to Asia/Karachi for existing installations).
 * Business dates are derived in the configured shop timezone, regardless of device timezone.
 */

import { getModuleRegion } from '../regional/region';
import { getRegionLocale, sanitizeTimeZone } from '../regional/format';

export const SHOP_TIMEZONE = 'Asia/Karachi';

/**
 * Returns the YYYY-MM-DD business date string in the shop timezone for a timestamp.
 * If no timestamp is provided, derives it from current time.
 */
export function getKarachiBusinessDate(
  dateOrTimestamp: Date | string | number = new Date(),
  timeZone: string = getModuleRegion().timeZone,
): string {
  const d = typeof dateOrTimestamp === 'object' ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid timestamp provided for business date derivation');
  }

  // Use Intl.DateTimeFormat with en-CA which yields ISO format YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: sanitizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(d);
}

/**
 * Returns the current time formatted for display in the shop timezone.
 */
export function formatKarachiTime(
  dateOrTimestamp: Date | string | number = new Date(),
  timeZone: string = getModuleRegion().timeZone,
): string {
  const d = typeof dateOrTimestamp === 'object' ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat(getRegionLocale(), {
    timeZone: sanitizeTimeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d).replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

/**
 * Formats a YYYY-MM-DD business date string to a human-readable date (e.g. "03 Oct 2026")
 */
export function formatDisplayDate(businessDateStr: string): string {
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
  }).format(d).replace(/-/g, ' ');
}

/**
 * Validates whether a device's business date has unacceptable future drift.
 * Protects against users with clocks set ahead.
 * Allows at most 1 day ahead (to account for edge-of-midnight syncs).
 */
export function validateDateDrift(
  businessDate: string,
  referenceDate: Date = new Date()
): { isValid: boolean; error?: string } {
  const currentKarachiDate = getKarachiBusinessDate(referenceDate);

  // Compare lexicographically (YYYY-MM-DD)
  if (businessDate > currentKarachiDate) {
    // Check if it's more than 1 day ahead
    const current = new Date(currentKarachiDate);
    const target = new Date(businessDate);
    const diffDays = Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      return {
        isValid: false,
        error: `Future business date rejected. Entry date (${businessDate}) is ${diffDays} days ahead of shop date (${currentKarachiDate}).`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Derives yesterday's business date in the configured shop timezone.
 */
export function getYesterdayKarachiDate(referenceDate: Date = new Date()): string {
  const today = getKarachiBusinessDate(referenceDate);
  const parts = today.split('-');
  const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
