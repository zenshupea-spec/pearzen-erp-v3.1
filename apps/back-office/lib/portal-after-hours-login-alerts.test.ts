import { describe, expect, it } from 'vitest';

import {
  isWithinAfterHoursWindow,
  normalizePortalAfterHoursLoginAlertSettings,
  parsePortalAlertTimeToMinutes,
} from './portal-after-hours-login-alerts-policy';

describe('portal after-hours login alerts', () => {
  const settings = normalizePortalAfterHoursLoginAlertSettings({
    enabled: true,
    startTime: '17:00',
    endTime: '08:00',
    notifyEmails: ['od@example.com'],
  });

  it('normalizes email lists and defaults', () => {
    expect(
      normalizePortalAfterHoursLoginAlertSettings({
        enabled: false,
        startTime: '25:99',
        endTime: 'bad',
        notifyEmails: 'a@x.com, A@x.com\nb@x.com',
      }),
    ).toEqual({
      enabled: false,
      startTime: '17:00',
      endTime: '08:00',
      notifyEmails: ['a@x.com', 'b@x.com'],
    });
  });

  it('detects overnight after-hours window', () => {
    // 2026-07-02 18:30 Asia/Colombo = 2026-07-02T13:00:00.000Z
    expect(isWithinAfterHoursWindow(settings, Date.parse('2026-07-02T13:00:00.000Z'))).toBe(
      true,
    );
    // 2026-07-02 10:00 Asia/Colombo = 2026-07-02T04:30:00.000Z
    expect(isWithinAfterHoursWindow(settings, Date.parse('2026-07-02T04:30:00.000Z'))).toBe(false);
    // 2026-07-02 07:30 Asia/Colombo = 2026-07-02T02:00:00.000Z
    expect(isWithinAfterHoursWindow(settings, Date.parse('2026-07-02T02:00:00.000Z'))).toBe(true);
  });

  it('respects disabled setting', () => {
    expect(
      isWithinAfterHoursWindow(
        { ...settings, enabled: false },
        Date.parse('2026-07-02T13:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('parses HH:mm values', () => {
    expect(parsePortalAlertTimeToMinutes('17:00')).toBe(17 * 60);
    expect(parsePortalAlertTimeToMinutes('8:05')).toBe(8 * 60 + 5);
    expect(parsePortalAlertTimeToMinutes('invalid')).toBeNull();
  });
});
