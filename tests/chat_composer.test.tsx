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
      />,
    );

    expect(screen.getByRole('button', { name: /Device Repairs/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Spare Parts/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Print|Stamp|Paper/ })).toBeNull();
  });

  it('keeps the composer clean when no categories are available', () => {
    render(<ChatComposer onSend={vi.fn()} categories={[]} />);

    expect(screen.queryByText(/No shop category suggestions are available/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up categories' })).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Ledger entry' }) as HTMLTextAreaElement).disabled)
      .toBe(false);
  });

  it('retains the typed text when review fails and blocks duplicate submissions', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    render(
      <ChatComposer onSend={onSend} categories={shopCategories} />,
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
