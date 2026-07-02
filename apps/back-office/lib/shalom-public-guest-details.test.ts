import { describe, expect, it } from 'vitest';

import { validateShalomGuestDetails } from './shalom-public-guest-details';

describe('shalom-public-guest-details', () => {
  const validBase = {
    guestName: 'Amaya Perera',
    guestEmail: 'amaya@example.com',
    guestPhone: '+94 77 123 4567',
    specialRequests: 'Late check-in please',
    acceptedTerms: true,
    acceptedCancellation: true,
  };

  it('accepts valid guest details', () => {
    const result = validateShalomGuestDetails(validBase);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.guestEmail).toBe('amaya@example.com');
      expect(result.normalized.notes).toBe('Late check-in please');
    }
  });

  it('returns field errors for missing required fields', () => {
    const result = validateShalomGuestDetails({
      guestName: '',
      guestEmail: 'bad',
      guestPhone: '123',
      acceptedTerms: false,
      acceptedCancellation: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.guestName).toBeTruthy();
      expect(result.fieldErrors.guestEmail).toBeTruthy();
      expect(result.fieldErrors.guestPhone).toBeTruthy();
      expect(result.fieldErrors.acceptedTerms).toBeTruthy();
      expect(result.fieldErrors.acceptedCancellation).toBeTruthy();
    }
  });
});
