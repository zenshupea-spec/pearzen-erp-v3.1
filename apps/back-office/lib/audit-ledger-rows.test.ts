import { describe, expect, it } from 'vitest';

function auditRowMatchesFilterDate(createdAt: string, filterDate: string): boolean {
  if (!filterDate) return true;
  return createdAt.slice(0, 10) === filterDate;
}

describe('audit ledger date filter', () => {
  it('matches ISO created_at against YYYY-MM-DD picker value', () => {
    expect(
      auditRowMatchesFilterDate('2026-07-01T10:42:00.000Z', '2026-07-01'),
    ).toBe(true);
    expect(
      auditRowMatchesFilterDate('2026-07-01T10:42:00.000Z', '2026-07-02'),
    ).toBe(false);
  });

  it('does not match en-GB display timestamps', () => {
    expect(auditRowMatchesFilterDate('01/07/2026, 10:42:00', '2026-07-01')).toBe(
      false,
    );
  });
});
