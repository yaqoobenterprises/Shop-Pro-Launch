import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatComposer } from '../src/components/chat/ChatComposer';
import { SeedCategory } from '../src/parser';

const shopCategories: SeedCategory[] = [
  {
    id: 'category-repairs',
    name: 'Device Repairs',
    kind: 'income',
    aliases: ['Device Repairs', 'repairs'],
    unusualLimitPaisa: 5_000_000,
  },
  {
    id: 'category-parts',
    name: 'Spare Parts',
    kind: 'expense',
    aliases: ['Spare Parts', 'parts'],
    unusualLimitPaisa: 5_000_000,
  },
];

describe('shop-specific chat composer', () => {
  it('offers only the active shop categories as quick-entry suggestions', () => {
    render(
      <ChatComposer
        onSend={vi.fn()}
        categories={shopCategories}
        onAddCategory={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Device Repairs/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Spare Parts/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Print|Stamp|Paper/ })).toBeNull();
  });

  it('shows an empty-shop setup state without disabling the main input', () => {
    const onAddCategory = vi.fn();
    render(
      <ChatComposer onSend={vi.fn()} categories={[]} onAddCategory={onAddCategory} />,
    );

    expect(screen.getByText(/No shop category suggestions are available/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set up categories' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Ledger entry' }) as HTMLTextAreaElement).disabled)
      .toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Set up categories' }));
    expect(onAddCategory).toHaveBeenCalledOnce();
  });

  it('retains the typed text when review fails and blocks duplicate submissions', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    render(
      <ChatComposer onSend={onSend} categories={shopCategories} onAddCategory={vi.fn()} />,
    );

    const input = screen.getByRole('textbox', { name: 'Ledger entry' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Device Repairs 500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send entry' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    await waitFor(() => expect(input.value).toBe('Device Repairs 500'));
    expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
  });
});
