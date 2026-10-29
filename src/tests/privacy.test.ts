import { describe, expect, it } from 'vitest';
import { redactCompletionOutput, redactMonetaryOutput, redactTextOutput } from '../privacy.js';

describe('monetary output privacy', () => {
  it('masks monetary fields across nested objects, arrays, and dynamic insight rows', () => {
    expect(
      redactMonetaryOutput({
        data: [{ id: '17', amount: '123.45', balance: 700, name: 'Rent 123.45 EUR' }],
        pagination: { page: 2, totalPages: 9, total: 34 },
        dates: { '2026-10-01': { sum: 600, count: 4 } },
        dynamicLabels: { '100.00 EUR': 4, 'rent 50 USD': 2 },
      }),
    ).toEqual({
      data: [{ id: '17', amount: '[hidden]', balance: '[hidden]', name: '[hidden]' }],
      pagination: { page: 2, totalPages: 9, total: 34 },
      dates: { '2026-10-01': { sum: '[hidden]', count: '[hidden]' } },
      dynamicLabels: { '[hidden]': '[hidden]' },
    });
  });

  it('preserves dates and ordinary identifiers while hiding amounts and raw CSV numbers', () => {
    expect(redactMonetaryOutput({ id: '52', date: '2026-10-29', currency_code: 'EUR', total: 12.5 })).toEqual({
      id: '52',
      date: '2026-10-29',
      currency_code: 'EUR',
      total: '[hidden]',
    });
    expect(redactTextOutput('date,amount\n2026-10-29,12.50')).toBe('date,amount\n2026-10-29,[hidden]');
  });

  it('masks currency amounts and numeric prose in API errors and completions', () => {
    expect(redactTextOutput('Invalid amount: 12.50 EUR')).toBe('[hidden]');
    expect(redactCompletionOutput('42 (Savings 100.00 EUR - asset)')).toBe('42 [hidden]');
  });
});
