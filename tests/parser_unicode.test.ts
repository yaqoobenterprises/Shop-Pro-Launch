import { describe, expect, it } from 'vitest';
import { parseMessage, SeedCategory } from '../src/parser';
import { normalizeLine } from '../src/parser/normalizer';

describe('Unicode numeric input', () => {
  it('normalizes Arabic-Indic and Eastern Arabic-Indic digits and separators', () => {
    const arabicIndic = normalizeLine('خرچ ۱۲٬۵۰۰٫۵۰');
    const easternArabicIndic = normalizeLine('خرچ ۱۲،۵۰۰.۵۰');

    expect(arabicIndic.amountPaisa).toBe(1_250_050);
    expect(easternArabicIndic.amountPaisa).toBe(1_250_050);
    expect(arabicIndic.cleanedText).toBe('خرچ');
    expect(easternArabicIndic.cleanedText).toBe('خرچ');
  });

  it('preserves Urdu words for category clarification and alias matching', () => {
    const categories: SeedCategory[] = [
      {
        id: 'expense-food',
        name: 'Food',
        kind: 'expense',
        aliases: ['کھانا'],
        unusualLimitPaisa: 5_000_000,
      },
    ];
    const matched = parseMessage('کھانا ۱۲۵٫۵۰', [], new Date('2026-10-10T10:00:00+05:00'), categories)
      .entries[0];
    const unknown = parseMessage('نامعلوم ۱۲۵٫۵۰', [], new Date('2026-10-10T10:00:00+05:00'), categories)
      .entries[0];

    expect(matched.categoryId).toBe('expense-food');
    expect(matched.amountPaisa).toBe(12_550);
    expect(unknown.action).toBe('ask_clarification');
    expect(unknown.amountPaisa).toBe(12_550);
  });
});
