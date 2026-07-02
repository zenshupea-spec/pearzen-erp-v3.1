import { describe, expect, it } from 'vitest';

import {
  invoiceDispatchDate,
  invoiceDueDate,
  invoiceGeneratedAtIso,
} from './month-window';

describe('AR billing cycle dates', () => {
  const serviceMonth = '2026-05';

  it('uses MD dispatch day in the month after service', () => {
    expect(invoiceDispatchDate(serviceMonth, 1)).toBe('2026-06-01');
    expect(invoiceDispatchDate(serviceMonth, 5)).toBe('2026-06-05');
  });

  it('sets due date to day after collection warning in billing month', () => {
    expect(invoiceDueDate(serviceMonth, { collectionWarningDay: 6 })).toBe('2026-06-07');
    expect(invoiceDueDate(serviceMonth, { collectionWarningDay: 10 })).toBe('2026-06-11');
  });

  it('anchors generated audit timestamp on dispatch day', () => {
    const iso = invoiceGeneratedAtIso(serviceMonth, 5);
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(9);
  });

  it('rolls billing month across year boundary', () => {
    expect(invoiceDispatchDate('2026-12', 5)).toBe('2027-01-05');
    expect(invoiceDueDate('2026-12', { collectionWarningDay: 6 })).toBe('2027-01-07');
  });
});
