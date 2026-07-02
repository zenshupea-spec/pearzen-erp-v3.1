import { describe, expect, it } from 'vitest';

import { headOfficePortalDisplayEmail, portalAuthEmailFromUsername } from './head-office-portal-username';

/** Mirrors portalSessionEmailMatches in head-office-portal-auth.ts */
function portalSessionEmailMatches(
  authRecord: {
    portal_auth_email: string | null;
    work_email: string;
    login_username: string | null;
  },
  email: string,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const workEmail = authRecord.work_email.trim().toLowerCase();
  if (workEmail === normalized) return true;

  const portalAuthEmail =
    authRecord.portal_auth_email?.trim().toLowerCase() ||
    (authRecord.login_username
      ? portalAuthEmailFromUsername(authRecord.login_username)
      : workEmail);

  return portalAuthEmail === normalized;
}

function portalSessionCookieEmailsMatch(
  tokenEmail: string,
  sessionEmail: string,
  authRecord: {
    portal_auth_email: string | null;
    work_email: string;
    login_username: string | null;
  } | null,
): boolean {
  const tokenNorm = tokenEmail.trim().toLowerCase();
  const sessionNorm = sessionEmail.trim().toLowerCase();
  if (tokenNorm === sessionNorm) return true;
  if (!authRecord) return false;
  return (
    portalSessionEmailMatches(authRecord, tokenEmail) &&
    portalSessionEmailMatches(authRecord, sessionEmail)
  );
}

describe('headOfficePortalDisplayEmail', () => {
  it('returns work email for portal UI, not the internal Supabase auth alias', () => {
    expect(headOfficePortalDisplayEmail('  Zenshupea@gmail.com ')).toBe(
      'zenshupea@gmail.com',
    );
  });
});

describe('portalSessionEmailMatches', () => {
  const record = {
    work_email: 'md@classicventure.com',
    login_username: '123456789v',
    portal_auth_email: '123456789v@portal.pearzen.local',
  };

  it('accepts the synthetic portal auth email used at Supabase sign-in', () => {
    expect(portalSessionEmailMatches(record, '123456789v@portal.pearzen.local')).toBe(
      true,
    );
  });

  it('accepts the work email when session uses it directly', () => {
    expect(portalSessionEmailMatches(record, 'md@classicventure.com')).toBe(true);
  });

  it('rejects unrelated emails', () => {
    expect(portalSessionEmailMatches(record, 'other@example.com')).toBe(false);
  });
});

describe('portalSessionCookieEmailsMatch', () => {
  const record = {
    work_email: 'md@classicventure.com',
    login_username: '123456789v',
    portal_auth_email: '123456789v@portal.pearzen.local',
  };

  it('accepts cookie work email with Supabase portal auth session email', () => {
    expect(
      portalSessionCookieEmailsMatch(
        'md@classicventure.com',
        '123456789v@portal.pearzen.local',
        record,
      ),
    ).toBe(true);
  });

  it('accepts matching emails without auth record lookup', () => {
    expect(
      portalSessionCookieEmailsMatch(
        'md@classicventure.com',
        'md@classicventure.com',
        null,
      ),
    ).toBe(true);
  });
});
