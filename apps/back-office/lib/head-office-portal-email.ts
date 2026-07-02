import { CVS_TENANT_SLUG } from './company-ids';
import { executivePortalOtpEmailFrom } from './executive-portal-auth-policy';
import { HO_PORTAL_OTP_LENGTH } from './head-office-portal-password';
import { cvsPortalProductionHosts } from './tenant-portal-host';
import { tenantAppPathUrl, tenantSubdomainsLive } from './tenant-host';

export type HeadOfficePortalOtpSignInPortal = 'md' | 'hq' | 'om' | 'tm';

export type HeadOfficePortalOtpEmailInput = {
  to: string;
  otp: string;
  staffName: string;
  portalLabel: string;
  expiresMinutes: number;
  /** Full URL override — skips tenant resolution when set. */
  signInUrl?: string;
  /** Which login route to link when signInUrl is omitted. */
  portal?: HeadOfficePortalOtpSignInPortal;
  tenantSlug?: string | null;
};

export type HeadOfficePortalOtpEmailResult = {
  ok: boolean;
  emailed: boolean;
  error?: string;
  resendMessageId?: string;
};

function defaultBackOfficeOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_BACK_OFFICE_URL?.trim().replace(/\/$/, '') ||
    `http://127.0.0.1:${process.env.PORT ?? process.env.BACK_OFFICE_PORT ?? '3002'}`
  );
}

function defaultTenantSlug(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_DEV_TENANT_SLUG?.trim();
  return fromEnv || null;
}

function loginPathForPortal(portal: HeadOfficePortalOtpSignInPortal): string {
  switch (portal) {
    case 'hq':
      return '/login/hq';
    case 'om':
      return '/login/om';
    case 'tm':
      return '/login/tm';
    default:
      return '/login/md';
  }
}

function productionHostForPortal(
  portal: HeadOfficePortalOtpSignInPortal,
  hosts: ReturnType<typeof cvsPortalProductionHosts>,
): string {
  switch (portal) {
    case 'hq':
      return hosts.hq;
    case 'om':
      return hosts.om;
    case 'tm':
      return hosts.tm;
    default:
      return hosts.md;
  }
}

/** Resolve a full sign-in URL for OTP emails (tenant MD/HQ host or local dev). */
export function resolveHeadOfficePortalOtpSignInUrl(input: {
  signInUrl?: string;
  portal?: HeadOfficePortalOtpSignInPortal;
  tenantSlug?: string | null;
  origin?: string;
}): string {
  const explicit = input.signInUrl?.trim();
  if (explicit) return explicit;

  const portal = input.portal ?? 'md';
  const pathname = loginPathForPortal(portal);
  const slug = input.tenantSlug ?? defaultTenantSlug();
  const origin = input.origin ?? defaultBackOfficeOrigin();

  if (!slug) {
    return `${origin.replace(/\/$/, '')}${pathname}`;
  }

  if (slug === CVS_TENANT_SLUG && tenantSubdomainsLive()) {
    const hosts = cvsPortalProductionHosts();
    const host = productionHostForPortal(portal, hosts);
    return `https://${host}${pathname}`;
  }

  const tenantUrl = tenantAppPathUrl(slug, pathname, origin);
  if (tenantUrl) return tenantUrl;

  return `${origin.replace(/\/$/, '')}${pathname}`;
}

export function headOfficePortalOtpLabel(
  portal: HeadOfficePortalOtpSignInPortal,
): string {
  switch (portal) {
    case 'hq':
      return 'HQ Staff Portal';
    case 'om':
      return 'OM Portal';
    case 'tm':
      return 'TM Portal';
    default:
      return 'MD Portal';
  }
}

function postLoginInstructionsForPortal(
  portal: HeadOfficePortalOtpSignInPortal,
): string {
  if (portal === 'md') {
    return 'Enter your work email and this code on the login page. You will then set a permanent password and enroll two-factor authentication.';
  }
  return 'Enter your work email and this code on the login page. You will then set a permanent portal password.';
}

export function buildHeadOfficePortalOtpEmailBody(input: {
  staffName: string;
  otp: string;
  portalLabel: string;
  expiresMinutes: number;
  signInUrl: string;
  portal?: HeadOfficePortalOtpSignInPortal;
}): { subject: string; text: string } {
  const name = input.staffName.trim() || 'there';
  const minutes = Math.max(1, Math.round(input.expiresMinutes));
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';

  const subject = `${input.portalLabel} — your sign-in code`;
  const text = [
    `Hello ${name},`,
    '',
    `Your ${input.portalLabel} one-time sign-in code is:`,
    '',
    input.otp,
    '',
    `This ${HO_PORTAL_OTP_LENGTH}-digit code expires in ${minutes} ${minuteLabel}.`,
    '',
    `Sign in at: ${input.signInUrl}`,
    '',
    postLoginInstructionsForPortal(input.portal ?? 'md'),
    '',
    'If you did not request this code, contact your administrator immediately.',
    '',
    '— Classic Venture Security',
  ].join('\n');

  return { subject, text };
}

export type HeadOfficePortalLoginNotificationKind =
  | 'login_success'
  | 'login_failure'
  | 'otp_request';

export type HeadOfficePortalLoginNotificationEmailInput = {
  to: string;
  workEmail: string;
  recoveryEmail?: string | null;
  success: boolean;
  kind?: HeadOfficePortalLoginNotificationKind;
  ip?: string | null;
  deviceLabel?: string | null;
  timestamp?: Date;
  portalLabel?: string;
};

export type HeadOfficePortalLoginNotificationEmailResult = {
  ok: boolean;
  emailed: boolean;
  error?: string;
  resendMessageId?: string;
};

function resolveLoginNotificationKind(
  input: Pick<
    HeadOfficePortalLoginNotificationEmailInput,
    'success' | 'kind'
  >,
): HeadOfficePortalLoginNotificationKind {
  if (input.kind) return input.kind;
  return input.success ? 'login_success' : 'login_failure';
}

function formatLoginNotificationTimestamp(timestamp: Date): string {
  return timestamp.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export function buildHeadOfficePortalLoginNotificationEmailBody(input: {
  workEmail: string;
  kind: HeadOfficePortalLoginNotificationKind;
  ip?: string | null;
  deviceLabel?: string | null;
  timestamp: Date;
  portalLabel: string;
}): { subject: string; text: string } {
  const portalLabel = input.portalLabel.trim() || 'MD Portal';
  const workEmail = input.workEmail.trim();
  const timeLabel = formatLoginNotificationTimestamp(input.timestamp);
  const ipLabel = input.ip?.trim() || 'Unknown';
  const deviceLabel = input.deviceLabel?.trim() || 'Unknown';

  if (input.kind === 'otp_request') {
    const subject = `Password reset code requested — ${portalLabel}`;
    const text = [
      `A password reset code was requested for your ${portalLabel} account (${workEmail}).`,
      '',
      `Time: ${timeLabel}`,
      `IP address: ${ipLabel}`,
      `Device: ${deviceLabel}`,
      '',
      'If you did not request this, contact your administrator immediately.',
      '',
      '— Classic Venture Security',
    ].join('\n');
    return { subject, text };
  }

  if (input.kind === 'login_success') {
    const subject = `New sign-in to ${portalLabel}`;
    const text = [
      `A successful sign-in to ${portalLabel} was detected for ${workEmail}.`,
      '',
      `Time: ${timeLabel}`,
      `IP address: ${ipLabel}`,
      `Device: ${deviceLabel}`,
      '',
      'If this was not you, contact Pearzen SaaS immediately and change your password.',
      '',
      '— Classic Venture Security',
    ].join('\n');
    return { subject, text };
  }

  const subject = `Failed sign-in attempt — ${portalLabel}`;
  const text = [
    `A failed sign-in attempt to ${portalLabel} was detected for ${workEmail}.`,
    '',
    `Time: ${timeLabel}`,
    `IP address: ${ipLabel}`,
    `Device: ${deviceLabel}`,
    '',
    'If this was not you, your account may be under attack. Change your password and contact Pearzen SaaS if attempts continue.',
    '',
    '— Classic Venture Security',
  ].join('\n');
  return { subject, text };
}

export async function sendHeadOfficePortalLoginNotificationEmail(
  input: HeadOfficePortalLoginNotificationEmailInput,
): Promise<HeadOfficePortalLoginNotificationEmailResult> {
  const to = input.to.trim();
  if (!to) {
    return { ok: false, emailed: false, error: 'Recipient email is required.' };
  }

  const workEmail = input.workEmail.trim() || to;
  const kind = resolveLoginNotificationKind(input);
  const portalLabel = input.portalLabel?.trim() || 'MD Portal';
  const timestamp = input.timestamp ?? new Date();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const { subject, text } = buildHeadOfficePortalLoginNotificationEmailBody({
    workEmail,
    kind,
    ip: input.ip,
    deviceLabel: input.deviceLabel,
    timestamp,
    portalLabel,
  });

  const recoveryEmail = input.recoveryEmail?.trim().toLowerCase() ?? '';
  const normalizedTo = to.toLowerCase();
  const bcc =
    recoveryEmail && recoveryEmail !== normalizedTo ? [recoveryEmail] : undefined;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: executivePortalOtpEmailFrom(),
        to: [to],
        ...(bcc ? { bcc } : {}),
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, emailed: true, resendMessageId: json.id };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export async function sendHeadOfficePortalOtpEmail(
  input: HeadOfficePortalOtpEmailInput,
): Promise<HeadOfficePortalOtpEmailResult> {
  const to = input.to.trim();
  if (!to) {
    return { ok: false, emailed: false, error: 'Recipient email is required.' };
  }

  const otp = input.otp.trim();
  if (!otp) {
    return { ok: false, emailed: false, error: 'OTP is required.' };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const signInUrl = resolveHeadOfficePortalOtpSignInUrl({
    signInUrl: input.signInUrl,
    portal: input.portal,
    tenantSlug: input.tenantSlug,
  });

  const { subject, text } = buildHeadOfficePortalOtpEmailBody({
    staffName: input.staffName,
    otp,
    portalLabel: input.portalLabel,
    expiresMinutes: input.expiresMinutes,
    signInUrl,
    portal: input.portal,
  });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: executivePortalOtpEmailFrom(),
        to: [to],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, emailed: true, resendMessageId: json.id };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}
