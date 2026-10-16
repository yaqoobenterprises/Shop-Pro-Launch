import { describe, expect, it } from 'vitest';
import { parseMessage, SeedCategory } from '../src/parser';

const shopCategories: SeedCategory[] = [
  {
    id: 'category-repairs',
    name: 'Device Repairs',
    kind: 'income',
    aliases: ['Device Repairs', 'repairs'],
    unusualLimitPaisa: 5_000_000,
  },
];

describe('organization-scoped parser categories', () => {
  const referenceDate = new Date('2026-10-10T10:00:00+05:00');

  it('does not classify a transaction using categories absent from the shop', () => {
    const result = parseMessage('PRINT 300', [], referenceDate, []).entries[0];

    expect(result.action).toBe('ask_clarification');
    expect(result.categoryId).toBeNull();
  });

  it('matches shop category names and aliases without depending on letter case', () => {
    const byName = parseMessage(
      'device repairs 500',
      [],
      referenceDate,
      shopCategories,
    ).entries[0];
    const byAlias = parseMessage(
      'REPAIRS 700',
      [],
      referenceDate,
      shopCategories,
    ).entries[0];

    expect(byName.categoryId).toBe('category-repairs');
    expect(byAlias.categoryId).toBe('category-repairs');
    expect(byName.type).toBe('income');
  });
});
