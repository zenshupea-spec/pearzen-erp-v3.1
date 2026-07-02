import { describe, expect, it } from 'vitest';

import {
  FLEET_TELEMATICS_COMPANY_ID_REQUIRED,
  normalizeFleetTelematicsCompanyId,
  readFleetTelematicsWebhookSecret,
  validateFleetTelematicsCompanyId,
  verifyFleetTelematicsWebhookSecret,
} from './fleet-telematics-webhook';

describe('fleet telematics webhook', () => {
  it('compares webhook secrets with timingSafeEqual semantics', () => {
    const secret = 'fleet-webhook-secret-abc123';
    expect(verifyFleetTelematicsWebhookSecret(secret, secret)).toBe(true);
    expect(verifyFleetTelematicsWebhookSecret(`${secret}x`, secret)).toBe(false);
    expect(verifyFleetTelematicsWebhookSecret(null, secret)).toBe(false);
  });

  it('requires a UUID company_id', () => {
    expect(
      normalizeFleetTelematicsCompanyId('29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'),
    ).toBe('29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e');
    expect(normalizeFleetTelematicsCompanyId('')).toBeNull();
    expect(normalizeFleetTelematicsCompanyId('not-a-uuid')).toBeNull();
  });

  it('rejects missing company_id for webhook payloads', () => {
    const result = validateFleetTelematicsCompanyId(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(FLEET_TELEMATICS_COMPANY_ID_REQUIRED);
    }
  });
});
