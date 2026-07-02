import { afterEach, describe, expect, it, vi } from 'vitest';

import { isExecutivePortalRank } from './executive-portal-auth-policy';
import {
  buildHeadOfficePortalLoginNotificationEmailBody,
  buildHeadOfficePortalOtpEmailBody,
  resolveHeadOfficePortalOtpSignInUrl,
  sendHeadOfficePortalLoginNotificationEmail,
  sendHeadOfficePortalOtpEmail,
} from './head-office-portal-email';

describe('executive login notification policy', () => {
  it('only targets MD and OD ranks', () => {
    expect(isExecutivePortalRank('MD')).toBe(true);
    expect(isExecutivePortalRank('OD')).toBe(true);
    expect(isExecutivePortalRank('HR')).toBe(false);
    expect(isExecutivePortalRank('FM')).toBe(false);
  });
});

describe('buildHeadOfficePortalLoginNotificationEmailBody', () => {
  const timestamp = new Date('2026-06-25T12:34:56.000Z');

  it('builds successful login copy', () => {
    const { subject, text } = buildHeadOfficePortalLoginNotificationEmailBody({
      workEmail: 'md@classicventure.lk',
      kind: 'login_success',
      ip: '203.0.113.10',
      deviceLabel: 'Mozilla/5.0',
      timestamp,
      portalLabel: 'MD Portal',
    });

    expect(subject).toBe('New sign-in to MD Portal');
    expect(text).toContain('successful sign-in');
    expect(text).toContain('md@classicventure.lk');
    expect(text).toContain('203.0.113.10');
    expect(text).toContain('Mozilla/5.0');
  });

  it('builds failed login copy', () => {
    const { subject, text } = buildHeadOfficePortalLoginNotificationEmailBody({
      workEmail: 'od@classicventure.lk',
      kind: 'login_failure',
      timestamp,
      portalLabel: 'MD Portal',
    });

    expect(subject).toBe('Failed sign-in attempt — MD Portal');
    expect(text).toContain('failed sign-in attempt');
    expect(text).toContain('Unknown');
  });

  it('builds forgot-password OTP request copy', () => {
    const { subject, text } = buildHeadOfficePortalLoginNotificationEmailBody({
      workEmail: 'md@classicventure.lk',
      kind: 'otp_request',
      ip: '10.0.0.1',
      timestamp,
      portalLabel: 'MD Portal',
    });

    expect(subject).toBe('Password reset code requested — MD Portal');
    expect(text).toContain('password reset code was requested');
    expect(text).toContain('10.0.0.1');
  });
});

describe('sendHeadOfficePortalLoginNotificationEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns emailed false when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendHeadOfficePortalLoginNotificationEmail({
      to: 'md@example.com',
      workEmail: 'md@example.com',
      success: true,
    });

    expect(result).toEqual({ ok: true, emailed: false });
  });

  it('requires recipient email', async () => {
    const result = await sendHeadOfficePortalLoginNotificationEmail({
      to: '   ',
      workEmail: 'md@example.com',
      success: false,
    });

    expect(result.ok).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.error).toMatch(/recipient/i);
  });
});

describe('buildHeadOfficePortalOtpEmailBody', () => {
  it('includes OTP, expiry, and sign-in URL', () => {
    const { subject, text } = buildHeadOfficePortalOtpEmailBody({
      staffName: 'Jane Perera',
      otp: '482910',
      portalLabel: 'MD Portal',
      expiresMinutes: 5,
      signInUrl: 'https://md.cvs.pearzen.tech/login/md',
    });

    expect(subject).toBe('MD Portal — your sign-in code');
    expect(text).toContain('Hello Jane Perera,');
    expect(text).toContain('482910');
    expect(text).toContain('expires in 5 minutes');
    expect(text).toContain('https://md.cvs.pearzen.tech/login/md');
  });

  it('uses HQ portal instructions without mandatory 2FA copy', () => {
    const { text } = buildHeadOfficePortalOtpEmailBody({
      staffName: 'Finance Manager',
      otp: '482910',
      portalLabel: 'HQ Staff Portal',
      expiresMinutes: 10,
      signInUrl: 'https://cvshq.pearzen.tech/login/hq',
      portal: 'hq',
    });

    expect(text).toContain('permanent portal password');
    expect(text).not.toContain('two-factor authentication');
  });
});

describe('resolveHeadOfficePortalOtpSignInUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns explicit signInUrl when provided', () => {
    expect(
      resolveHeadOfficePortalOtpSignInUrl({
        signInUrl: 'https://example.com/custom',
        portal: 'hq',
      }),
    ).toBe('https://example.com/custom');
  });

  it('builds local MD login URL with tenant query on dev', () => {
    vi.stubEnv('NEXT_PUBLIC_BACK_OFFICE_URL', 'http://127.0.0.1:3002');
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'cvs');

    expect(
      resolveHeadOfficePortalOtpSignInUrl({
        portal: 'md',
      }),
    ).toBe('http://127.0.0.1:3002/login/md?tenant=cvs');
  });

  it('builds local HQ login URL on dev', () => {
    vi.stubEnv('NEXT_PUBLIC_BACK_OFFICE_URL', 'http://127.0.0.1:3002');
    vi.stubEnv('NEXT_PUBLIC_DEV_TENANT_SLUG', 'cvs');

    expect(
      resolveHeadOfficePortalOtpSignInUrl({
        portal: 'hq',
      }),
    ).toBe('http://127.0.0.1:3002/login/hq?tenant=cvs');
  });
});

describe('sendHeadOfficePortalOtpEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns emailed false when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendHeadOfficePortalOtpEmail({
      to: 'md@example.com',
      otp: '123456',
      staffName: 'MD User',
      portalLabel: 'MD Portal',
      expiresMinutes: 5,
      signInUrl: 'http://127.0.0.1:3002/login/md',
    });

    expect(result).toEqual({ ok: true, emailed: false });
  });

  it('requires recipient email', async () => {
    const result = await sendHeadOfficePortalOtpEmail({
      to: '   ',
      otp: '123456',
      staffName: 'MD User',
      portalLabel: 'MD Portal',
      expiresMinutes: 5,
    });

    expect(result.ok).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.error).toMatch(/recipient/i);
  });
});
