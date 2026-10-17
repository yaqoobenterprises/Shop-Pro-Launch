import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SUPPORTED_CURRENCIES,
  getCurrencyConfig,
  isSupportedCurrency,
  detectDeviceRegion,
  formatMoney,
  parseLocalizedMoneyInput,
  parseMoneyInput,
  getBusinessDate,
  formatBusinessDate,
  getPreviousBusinessDate,
  isValidTimeZone,
  sanitizeTimeZone,
  setModuleRegion,
  resetModuleRegion,
} from '../src/regional';
import { getKarachiBusinessDate } from '../src/lib/dates';
import { formatPaisa } from '../src/lib/money';

describe('Regional Module Suite', () => {
  beforeEach(() => {
    resetModuleRegion();
  });

  afterEach(() => {
    resetModuleRegion();
  });

  describe('Currencies Registry Invariant', () => {
    it('verifies every supported currency has exactly 2 decimals (exponent 2)', () => {
      expect(SUPPORTED_CURRENCIES.length).toBe(28);
      for (const currency of SUPPORTED_CURRENCIES) {
        expect(currency.decimals).toBe(2);
        expect(currency.code.length).toBe(3);
        expect(currency.unusualAmountLimitMinor).toBeGreaterThan(0);
        expect(Number.isSafeInteger(currency.unusualAmountLimitMinor)).toBe(true);
        expect(currency.defaultCountries.length).toBeGreaterThan(0);
      }
    });

    it('looks up currency configs correctly', () => {
      expect(isSupportedCurrency('PKR')).toBe(true);
      expect(isSupportedCurrency('usd')).toBe(true);
      expect(isSupportedCurrency('JPY')).toBe(false); // 0 decimals not supported
      expect(isSupportedCurrency('KWD')).toBe(false); // 3 decimals not supported
      expect(getCurrencyConfig('USD')?.symbol).toBe('$');
    });
  });

  describe('Device Regional Detection', () => {
    it('detects device timezone and language gracefully without network', () => {
      const detected = detectDeviceRegion();
      expect(detected).toBeDefined();
      expect(typeof detected.timeZone).toBe('string');
      expect(['en', 'ur']).toContain(detected.uiLanguage);
    });
  });

  describe('formatMoney Regional Formatter', () => {
    it('is byte-identical to formatPaisa for PKR across all test cases', () => {
      setModuleRegion({ currency: 'PKR' });
      const testCases = [0, 100, 1250, 20000000, 50, 49, 9999999];
      for (const minor of testCases) {
        expect(formatMoney(minor)).toBe(formatPaisa(minor));
        expect(formatMoney(minor, { showFractional: true })).toBe(
          formatPaisa(minor, { showPaisaIfFraction: true })
        );
      }
    });

    it('formats other currencies with standard currency symbols and 2 decimals only when fractional', () => {
      setModuleRegion({ currency: 'USD' });
      // Whole amounts have no decimals
      expect(formatMoney(50000)).toBe('$500');
      // Fractional amounts have 2 decimals
      expect(formatMoney(50050)).toBe('$500.50');
      expect(formatMoney(125)).toBe('$1.25');

      setModuleRegion({ currency: 'GBP' });
      expect(formatMoney(10000)).toBe('£100');
      expect(formatMoney(10025)).toBe('£100.25');

      setModuleRegion({ currency: 'EUR' });
      expect(formatMoney(25000)).toBe('€250');
      expect(formatMoney(25099)).toBe('€250.99');
    });

    it('strips invisible bidi control characters from output', () => {
      setModuleRegion({ currency: 'AED' });
      const formatted = formatMoney(15000);
      // Ensure no \u200E, \u200F, \u061C
      expect(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/.test(formatted)).toBe(false);
    });
  });

  describe('parseMoneyInput Regional Parser', () => {
    it('parses input with foreign symbols and codes into integer minor units', () => {
      setModuleRegion({ currency: 'USD' });
      expect(parseMoneyInput('$500')).toEqual({ minor: 50000, isValid: true });
      expect(parseMoneyInput('USD 500.25')).toEqual({ minor: 50025, isValid: true });

      setModuleRegion({ currency: 'EUR' });
      expect(parseMoneyInput('€1,200.50')).toEqual({ minor: 120050, isValid: true });

      setModuleRegion({ currency: 'INR' });
      expect(parseMoneyInput('₹ 2500')).toEqual({ minor: 250000, isValid: true });
    });

    describe('Locale-aware standard amount input', () => {
      it('parses grouping and decimal separators based on the shop locale', () => {
        expect(parseLocalizedMoneyInput('1,234.50', 'en-US')).toEqual({
          minor: 123450,
          isValid: true,
        });
        expect(parseLocalizedMoneyInput('1.234,50', 'de-DE')).toEqual({
          minor: 123450,
          isValid: true,
        });
        expect(parseLocalizedMoneyInput('12abc', 'en-US').isValid).toBe(false);
      });
    });
  });

  describe('Date Engine with Dynamic Timezones', () => {
    it('validates timezones and falls back to Asia/Karachi on invalid string', () => {
      expect(isValidTimeZone('Asia/Karachi')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Invalid/Zone')).toBe(false);
      expect(sanitizeTimeZone('Invalid/Zone')).toBe('Asia/Karachi');
    });

    it('computes business dates correctly across timezones', () => {
      // 2026-10-13 23:30:00 UTC
      const date = new Date('2026-10-13T23:30:00.000Z');
      // In New York (EDT, UTC-4), this is 19:30 on 2026-10-13
      expect(getBusinessDate(date, 'America/New_York')).toBe('2026-10-13');
      // In Karachi (PKT, UTC+5), this is 04:30 on 2026-10-14
      expect(getBusinessDate(date, 'Asia/Karachi')).toBe('2026-10-14');
      // In Kiritimati (LINT, UTC+14), this is 13:30 on 2026-10-14
      expect(getBusinessDate(date, 'Pacific/Kiritimati')).toBe('2026-10-14');
    });

    it('uses the configured shop timezone for existing ledger date helpers', () => {
      setModuleRegion({ timeZone: 'America/New_York' });
      expect(getKarachiBusinessDate(new Date('2026-10-13T23:30:00.000Z'))).toBe('2026-10-13');
    });

    it('formats display dates and previous dates accurately', () => {
      expect(formatBusinessDate('2026-10-13')).toBe('13 Oct 2026');
      const ref = new Date('2026-10-14T02:00:00.000Z');
      expect(getPreviousBusinessDate(ref, 'Asia/Karachi')).toBe('2026-10-13');
    });
  });
});
