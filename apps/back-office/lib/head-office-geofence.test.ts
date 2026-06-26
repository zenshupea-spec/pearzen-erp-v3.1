import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  haversineDistanceM,
  isWithinHeadOfficeGeofence,
} from './head-office-geofence-core';
import { isHeadOfficeGeofenceExempt } from './head-office-geofence-exempt';

/** Classic Venture Security — Colombo HQ (`md_settings._internalWorkLocations`). */
const COLOMBO_HQ = {
  id: 'loc_mq6unt0e_6mmt8r',
  name: 'colombo hq',
  address: '196 park road colombo 5',
  latitude: 6.887468200112363,
  longitude: 79.87288584121994,
  geofenceRadiusM: 10,
};

describe('head-office-geofence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts coordinates inside the configured 10 m Colombo HQ radius', () => {
    expect(
      isWithinHeadOfficeGeofence(
        COLOMBO_HQ.latitude,
        COLOMBO_HQ.longitude,
        [COLOMBO_HQ],
      ),
    ).toBe(true);
  });

  it('rejects coordinates ~500 m from Colombo HQ', () => {
    const offSiteLat = COLOMBO_HQ.latitude + 500 / 111_000;
    const distanceM = haversineDistanceM(
      offSiteLat,
      COLOMBO_HQ.longitude,
      COLOMBO_HQ.latitude,
      COLOMBO_HQ.longitude,
    );
    expect(distanceM).toBeGreaterThan(400);
    expect(distanceM).toBeLessThan(600);
    expect(
      isWithinHeadOfficeGeofence(offSiteLat, COLOMBO_HQ.longitude, [COLOMBO_HQ]),
    ).toBe(false);
  });

  it('fail-closes in production when no HO locations and env coords are unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isWithinHeadOfficeGeofence(6.89, 79.87, [])).toBe(false);
  });

  it('allows local dev pass-through when no HO locations and env coords are unset', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isWithinHeadOfficeGeofence(6.89, 79.87, [])).toBe(true);
  });

  it('uses env fallback coords when tenant HO locations are empty', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HEAD_OFFICE_LAT', String(COLOMBO_HQ.latitude));
    vi.stubEnv('HEAD_OFFICE_LNG', String(COLOMBO_HQ.longitude));
    vi.stubEnv('HEAD_OFFICE_RADIUS_KM', '0.05');
    expect(
      isWithinHeadOfficeGeofence(
        COLOMBO_HQ.latitude,
        COLOMBO_HQ.longitude,
        [],
      ),
    ).toBe(true);
  });
});

describe('head-office-geofence-exempt', () => {
  it('exempts MD and OD only', () => {
    expect(isHeadOfficeGeofenceExempt('MD')).toBe(true);
    expect(isHeadOfficeGeofenceExempt('OD')).toBe(true);
    expect(isHeadOfficeGeofenceExempt('HR')).toBe(false);
    expect(isHeadOfficeGeofenceExempt('OM')).toBe(false);
    expect(isHeadOfficeGeofenceExempt(null)).toBe(false);
  });
});
