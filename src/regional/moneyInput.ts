import { getCurrencyConfig } from './currencies';
import { getRegionLocale } from './locale';
import { getModuleRegion } from './region';

const BIDI_REGEX = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export function parseLocalizedMoneyInput(
  input: string,
  locale: string = getRegionLocale(),
): { minor: number; isValid: boolean; error?: string } {
  if (typeof input !== 'string' || !input.trim()) {
    return { minor: 0, isValid: false, error: 'Empty amount input' };
  }

  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((part) => part.type === 'group')?.value;
  const decimal = parts.find((part) => part.type === 'decimal')?.value || '.';
  const digits = input.trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const integerPattern = group
    ? `(?:\\d{1,3}(?:${escapeRegExp(group)}\\d{3})+|\\d+)`
    : '\\d+';
  let normalized: string | null = null;
  const localPattern = new RegExp(`^${integerPattern}(?:${escapeRegExp(decimal)}\\d{1,2})?$`);
  if (localPattern.test(digits)) {
    normalized = digits.split(group || '\u0000').join('').replace(decimal, '.');
  } else if (decimal !== '.' && /^\d+(?:\.\d{1,2})$/.test(digits)) {
    normalized = digits;
  }

  const amount = normalized === null ? Number.NaN : Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { minor: 0, isValid: false, error: 'Invalid amount format' };
  }
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) {
    return { minor: 0, isValid: false, error: 'Amount exceeds safe integer range' };
  }
  return { minor, isValid: true };
}

export function parseMoneyInput(
  input: string,
  currencyCode?: string,
): { minor: number; isValid: boolean; error?: string } {
  if (!input || typeof input !== 'string') {
    return { minor: 0, isValid: false, error: 'Empty amount input' };
  }

  const activeRegion = getModuleRegion();
  const code = (currencyCode || activeRegion.currency || 'PKR').toUpperCase();
  const config = getCurrencyConfig(code);
  let cleaned = input
    .replace(/,/g, '')
    .replace(/rs\.?/gi, ' ')
    .replace(/\b(pkr|rp)\b/gi, ' ')
    .replace(/\/-/g, ' ')
    .replace(/[=/]-/g, ' ')
    .replace(/=/g, ' ')
    .replace(/[$€£₹]/g, ' ');

  if (code && code !== 'PKR') {
    cleaned = cleaned.replace(new RegExp(`\\b${code}\\b`, 'gi'), ' ');
  }
  if (config?.symbol) {
    cleaned = cleaned.replace(
      new RegExp(config.symbol.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'),
      ' ',
    );
  }

  cleaned = cleaned.replace(BIDI_REGEX, '').trim();
  const amount = Number.parseFloat(cleaned);
  if (!Number.isFinite(amount)) {
    return { minor: 0, isValid: false, error: `Invalid number format: "${input}"` };
  }
  if (amount <= 0) {
    return { minor: 0, isValid: false, error: 'Amount must be greater than zero' };
  }
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor)) {
    return { minor: 0, isValid: false, error: 'Amount exceeds safe integer range' };
  }
  return { minor, isValid: true };
}
