import { describe, expect, it } from 'vitest';

import {
  buildShalomGuestIdObjectPath,
  formatShalomGuestIdStorageRef,
  parseShalomGuestIdStorageRef,
  SHALOM_GUEST_IDS_BUCKET,
} from './shalom-guest-id-storage';

describe('shalom-guest-id-storage', () => {
  it('builds object paths and storage refs', () => {
    const path = buildShalomGuestIdObjectPath('company-1', 'booking-1', 'file-1');
    expect(path).toBe('company-1/booking-1/file-1.jpg');
    expect(formatShalomGuestIdStorageRef(SHALOM_GUEST_IDS_BUCKET, path)).toBe(
      'storage://shalom-guest-ids/company-1/booking-1/file-1.jpg',
    );
  });

  it('parses storage refs for the guest-id bucket', () => {
    const stored = 'storage://shalom-guest-ids/company-1/booking-1/file-1.jpg';
    expect(parseShalomGuestIdStorageRef(stored)).toEqual({
      bucket: 'shalom-guest-ids',
      objectPath: 'company-1/booking-1/file-1.jpg',
    });
    expect(parseShalomGuestIdStorageRef('storage://other-bucket/x/y.jpg')).toBeNull();
    expect(parseShalomGuestIdStorageRef('')).toBeNull();
  });
});
