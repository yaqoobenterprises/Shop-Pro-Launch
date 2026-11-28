import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CashFlowChart } from '../src/components/charts/CashFlowChart';
import { CategoryDonut } from '../src/components/charts/CategoryDonut';
import { formatPaisa } from '../src/lib/money';
import { monotoneSegments, niceScale } from '../src/design-system/chartGeometry';
import { cashFlowOptions, categoryOptions, axisAmount } from "../src/components/charts/echartsOptions";
import manifest from '../src/design-system/manifest.json';

const rows = [
  { key: 'one', label: 'Mon', title: 'Monday', income_paisa: 10000, expense_paisa: 30000, net_profit_paisa: -20000, transaction_count: 2 },
  { key: 'two', label: 'Tue', title: 'Tuesday', income_paisa: 40000, expense_paisa: 10000, net_profit_paisa: 30000, transaction_count: 2 },
];

describe('versioned Shop Pro design tokens and chart interaction', () => {
  it('pins the versioned font and token bytes used by the live app', () => {
    for (const [file, hash] of Object.entries(manifest.sourceHashes)) {
      expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(hash);
    }
  });
  it('keeps zero in signed scales and represents one minor unit accurately', () => {
    expect(niceScale([-20000, 30000]).lo).toBeLessThan(0);
    expect(niceScale([-20000, -10000]).hi).toBe(0);
    expect(niceScale([1])).toMatchObject({ lo: 0, hi: 1 });
  });
  it('never curves outside the neighboring observed amounts', () => {
    for (const values of [[0, 100, 10, 90], [-30, -40, 10, 5], [1, 1, 1, 1]]) {
      for (const segment of monotoneSegments(values.map((y, x) => ({ x, y })))) {
        for (let i = 0; i <= 100; i++) {
          const t = i / 100, u = 1 - t;
          const y = u ** 3 * segment.start.y + 3 * u ** 2 * t * segment.c1.y + 3 * u * t ** 2 * segment.c2.y + t ** 3 * segment.end.y;
          expect(y).toBeGreaterThanOrEqual(Math.min(segment.start.y, segment.end.y) - 1e-8);
          expect(y).toBeLessThanOrEqual(Math.max(segment.start.y, segment.end.y) + 1e-8);
        }
      }
    }
  });
  it('supports keyboard dates, signed results and exact values without hover', () => {
    render(<CashFlowChart rows={rows} range="this week" />);
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowRight' });
    expect(screen.getByText('Monday · Income Rs 100 · Expenses Rs 300')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Net result', exact: true }));
    expect(screen.getByTitle(`Net result: ${formatPaisa(-20000)}`)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('img'), { key: 'End' });
    expect(screen.getByText('Tuesday · Net result Rs 300')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText(formatPaisa(-20000))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear chart selection' }));
    expect(screen.getByText('Select a date')).toBeTruthy();
  });
  it('shows single-cent observations accurately in both axes and exact tables', () => {
    render(<CashFlowChart rows={[{ ...rows[0], income_paisa: 1, expense_paisa: 0, net_profit_paisa: 1 }]} range="single-cent activity" />);
    expect(screen.getByTitle('Income: Rs 0.01')).toBeTruthy();
    expect(axisAmount(1)).toBe('0.01');
  });
  it('uses complete donut shares with full amounts and selectable legends', () => {
    render(<CategoryDonut items={[{ key: 'a', label: 'Stock', amountPaisa: 9000 }, { key: 'b', label: 'Utilities', amountPaisa: 1000 }]} />);
    const theme = { text: '', muted: '', grid: '', zero: '', surface: '', border: '', income: '', expense: '', result: '', palette: [], font: '' };
    const option = categoryOptions([{ key: 'a', label: 'Stock', amountPaisa: 9000 }, { key: 'b', label: 'Utilities', amountPaisa: 1000 }], theme);
    expect(option.series[0].padAngle).toBe(0);
    expect(option.series[0].data.map(item => item.value)).toEqual([9000, 1000]);
    const signed = cashFlowOptions(rows, 'result', theme);
    expect(signed.series[0].data).toEqual([-20000, 30000]);
    expect(signed.yAxis.scale).toBe(false);
    expect(signed.series[0].markLine.data).toEqual([{ yAxis: 0 }]);
    const utilities = screen.getByRole('button', { name: /Utilities/ });
    fireEvent.click(utilities);
    expect(utilities.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Rs 10')).toBeTruthy();
  });
  it('keeps all crowded categories visible as ranked bars and never fabricates an empty donut', () => {
    const { rerender, container } = render(<CategoryDonut items={Array.from({ length: 8 }, (_, i) => ({ key: String(i), label: `Category ${i}`, amountPaisa: (i + 1) * 100 }))} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    rerender(<CategoryDonut items={[]} />);
    expect(screen.getByText('No expenses for this period.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('reports an unsafe category aggregate instead of displaying a valid-looking total', () => {
    render(<CategoryDonut items={[{ key: 'a', label: 'A', amountPaisa: Number.MAX_SAFE_INTEGER }, { key: 'b', label: 'B', amountPaisa: 1 }]} />);
    expect(screen.getByRole('status').textContent).toBe('Category total unavailable.');
  });
});
