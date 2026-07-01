import { describe, expect, it } from 'vitest';

import {
  allocateShalomInvoiceReference,
  buildShalomStayInvoiceContent,
  buildShalomStayInvoiceFromBooking,
  formatShalomInvoiceDate,
  isValidShalomGuestInvoiceEmail,
  SHALOM_INVOICE_REF_PREFIX,
  SHALOM_RESIDENCE_BRAND,
  SHALOM_STAY_INVOICE_EMAIL_FROM_DEFAULT,
  shalomStayInvoiceEmailFrom,
} from './shalom-stay-invoice';

describe('shalom-stay-invoice', () => {
  it('reuses an existing invoice reference', () => {
    expect(allocateShalomInvoiceReference('SHL-2026-00042')).toBe('SHL-2026-00042');
    expect(allocateShalomInvoiceReference('  SHL-2026-00099  ')).toBe('SHL-2026-00099');
  });

  it('allocates a new SHL-YYYY-NNNNN reference', () => {
    const ref = allocateShalomInvoiceReference(null, new Date('2026-07-01T00:00:00Z'));
    expect(ref).toMatch(/^SHL-2026-\d{5}$/);
    expect(SHALOM_INVOICE_REF_PREFIX).toBe('SHL');
  });

  it('formats invoice dates for display', () => {
    expect(formatShalomInvoiceDate('2026-07-15')).toBe('15 Jul 2026');
  });

  it('builds Shalom Residence invoice with stay nights and amount only', () => {
    const result = buildShalomStayInvoiceContent({
      reference: 'SHL-2026-00042',
      issuedAt: '2026-07-20T10:00:00.000Z',
      propertyName: 'Shalom Villa',
      guestName: 'Jane Guest',
      checkIn: '2026-07-18',
      checkOut: '2026-07-20',
      nights: 2,
      collectLkr: 8500,
      totalLkr: 8500,
    });

    expect(result.totalLkr).toBe(8500);
    expect(result.html).toContain(SHALOM_RESIDENCE_BRAND);
    expect(result.html).toContain('2 nights stay');
    expect(result.html).toContain('LKR 8.5K');
    expect(result.html).not.toContain('Broken glass');
    expect(result.text).toContain('2 nights stay');
    expect(result.text).toContain('Total: LKR 8.5K');
  });

  it('computes total from collect amount only (ignores damages on booking)', () => {
    const result = buildShalomStayInvoiceFromBooking({
      reference: 'SHL-2026-00100',
      propertyName: 'Lake House',
      guestName: 'Alex',
      checkIn: '2026-08-01',
      checkOut: '2026-08-03',
      nights: 2,
      collectLkr: 10000,
    });

    expect(result.reference).toBe('SHL-2026-00100');
    expect(result.totalLkr).toBe(10000);
    expect(result.html).toContain(SHALOM_RESIDENCE_BRAND);
    expect(result.html).toContain('Lake House');
    expect(result.html).not.toContain('Stain');
  });

  it('validates guest invoice email addresses', () => {
    expect(isValidShalomGuestInvoiceEmail('guest@example.com')).toBe(true);
    expect(isValidShalomGuestInvoiceEmail('not-an-email')).toBe(false);
    expect(isValidShalomGuestInvoiceEmail('')).toBe(false);
  });

  it('defaults stay invoice sender to pearzen.tech fallback', () => {
    expect(SHALOM_STAY_INVOICE_EMAIL_FROM_DEFAULT).toContain('support@pearzen.tech');
    expect(shalomStayInvoiceEmailFrom()).toBe(SHALOM_STAY_INVOICE_EMAIL_FROM_DEFAULT);
  });
});
