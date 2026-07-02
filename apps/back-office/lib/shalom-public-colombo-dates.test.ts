import { describe, expect, it } from 'vitest';

import {
  addColomboDays,
  colomboTodayIso,
  formatColomboGuestDate,
  shiftColomboMonth,
} from './shalom-public-colombo-dates';

describe('shalom-public-colombo-dates', () => {
  it('resolves today in Asia/Colombo', () => {
    const today = colomboTodayIso(Date.parse('2026-07-02T13:00:00.000Z'));
    expect(today).toBe('2026-07-02');
  });

  it('adds days across month boundaries', () => {
    expect(addColomboDays('2026-07-30', 3)).toBe('2026-08-02');
  });

  it('shifts months', () => {
    expect(shiftColomboMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftColomboMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('formats guest-facing dates', () => {
    expect(formatColomboGuestDate('2026-08-14')).toMatch(/14/);
    expect(formatColomboGuestDate('2026-08-14')).toMatch(/2026/);
  });
});
