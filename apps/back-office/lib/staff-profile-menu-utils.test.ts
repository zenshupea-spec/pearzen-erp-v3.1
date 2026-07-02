import { describe, expect, it } from 'vitest';

import {
  profileExpiryTooltip,
  profileExpiryWarningActive,
  profileFirstName,
  profileInitials,
} from './staff-profile-menu-utils';

describe('staff-profile-menu-utils', () => {
  it('derives initials and first name from full name', () => {
    expect(profileInitials('Kamal Perera', 'TM')).toBe('KP');
    expect(profileFirstName('Kamal Perera')).toBe('Kamal');
  });

  it('falls back to rank for initials', () => {
    expect(profileInitials(null, 'OM')).toBe('OM');
  });

  it('flags expiry warning within 14 days', () => {
    expect(profileExpiryWarningActive(10)).toBe(true);
    expect(profileExpiryWarningActive(20)).toBe(false);
    expect(profileExpiryTooltip(3)).toBe('Password expires in 3 days');
  });
});
