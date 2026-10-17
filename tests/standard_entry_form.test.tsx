import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StandardEntryForm } from '../src/components/chat/StandardEntryForm';
import { SeedCategory } from '../src/parser';

const chooseOption = (label: string, optionName: string) => {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
};

const categories: SeedCategory[] = [
  {
    id: 'income-repairs',
    name: 'Device Repairs',
    kind: 'income',
    aliases: ['Device Repairs', 'repairs'],
    unusualLimitPaisa: 10_000,
  },
  {
    id: 'expense-parts',
    name: 'Spare Parts',
    kind: 'expense',
    aliases: ['Spare Parts', 'parts'],
    unusualLimitPaisa: 10_000,
  },
];

describe('standard transaction entry', () => {
  it('routes structured input through the deterministic parser for review', () => {
    const onReview = vi.fn();
    render(
      <StandardEntryForm categories={categories} onReview={onReview} onAddCategory={vi.fn()} />,
    );

    chooseOption('Transaction type', 'Expense');
    chooseOption('Category', 'Spare Parts');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,000' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'supplier payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review entry' }));

    expect(onReview).toHaveBeenCalledOnce();
    expect(onReview.mock.calls[0][0]).toMatchObject({
      type: 'expense',
      categoryId: 'expense-parts',
      amountPaisa: 100_000,
      note: 'supplier payment',
    });
    expect(onReview.mock.calls[0][0].isUnusualAmount).toBe(true);
  });

  it('rejects invalid amounts without opening the review step', () => {
    const onReview = vi.fn();
    render(
      <StandardEntryForm categories={categories} onReview={onReview} onAddCategory={vi.fn()} />,
    );
    chooseOption('Category', 'Device Repairs');
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review entry' }));

    expect(onReview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid amount');
  });
});
