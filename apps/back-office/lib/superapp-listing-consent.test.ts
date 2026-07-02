import { describe, expect, it } from 'vitest';

import {
  isSuperappListingActive,
  superappExportErrorStatus,
  type SuperappListingConsent,
} from './superapp-listing-consent-shared';

function consent(partial: Partial<SuperappListingConsent>): SuperappListingConsent {
  return {
    companyId: '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e',
    consentedAt: null,
    listProducts: false,
    listBooking: false,
    consentedByEmail: null,
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...partial,
  };
}

describe('isSuperappListingActive', () => {
  it('requires consented_at and at least one listing flag', () => {
    expect(
      isSuperappListingActive(
        consent({ consentedAt: '2026-06-01T00:00:00.000Z', listProducts: true }),
      ),
    ).toBe(true);
    expect(
      isSuperappListingActive(
        consent({ consentedAt: '2026-06-01T00:00:00.000Z', listBooking: true }),
      ),
    ).toBe(true);
    expect(isSuperappListingActive(consent({ listProducts: true }))).toBe(false);
    expect(isSuperappListingActive(null)).toBe(false);
  });
});

describe('superappExportErrorStatus', () => {
  it('maps consent failures to 403', () => {
    expect(superappExportErrorStatus('Listing consent not granted for this tenant.')).toBe(403);
  });

  it('maps missing company to 404', () => {
    expect(superappExportErrorStatus('Company not found.')).toBe(404);
  });
});
