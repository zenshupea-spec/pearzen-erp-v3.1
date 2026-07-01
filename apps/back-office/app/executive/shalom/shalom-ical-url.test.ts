import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildShalomIcalExportUrl } from './shalom-ical-url';

describe('buildShalomIcalExportUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_BACK_OFFICE_URL;
    delete process.env.NEXT_PUBLIC_DEV_TENANT_SLUG;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds the public export path for a property id', () => {
    vi.stubEnv('NEXT_PUBLIC_BACK_OFFICE_URL', 'https://cvs.example.com/');
    expect(buildShalomIcalExportUrl('prop-123')).toBe(
      'https://cvs.example.com/api/ical/export/prop-123.ics',
    );
  });

  it('falls back to local dev origin when no public URL is configured', () => {
    expect(buildShalomIcalExportUrl('abc-def')).toBe(
      'http://127.0.0.1:3002/api/ical/export/abc-def.ics',
    );
  });
});
