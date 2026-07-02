import { isExecutivePortalRank } from './executive-portal-auth-policy';
import { sendHeadOfficePortalLoginNotificationEmail, headOfficePortalOtpLabel } from './head-office-portal-email';
import { notifyIfAfterHoursPortalLogin } from './portal-after-hours-login-alerts';
import type { StaffPortalId } from './portal-isolation';
import { staffPortalIdForRole } from './portal-isolation';
import { recordPortalLoginEvent } from './portal-login-events';

export const EXECUTIVE_LOGIN_FAILURE_NOTIFICATION_COOLDOWN_MS = 60_000;

export type ExecutivePortalLoginNotificationInput = {
  employeeId: string;
  workEmail: string;
  recoveryEmail?: string | null;
  portalAuthEmail: string;
  rank: string | null | undefined;
  success: boolean;
  kind?: 'login' | 'otp_request';
  ipAddress?: string | null;
  deviceLabel?: string | null;
  staffPortal?: StaffPortalId | null;
};

export type FinalizePortalLoginNotificationsInput = {
  employeeId: string;
  workEmail: string;
  recoveryEmail?: string | null;
  portalAuthEmail: string;
  rank: string | null | undefined;
  employeeName?: string | null;
  companyId: string | null;
  staffPortal?: StaffPortalId | null;
  ipAddress?: string | null;
  deviceLabel?: string | null;
};

export async function readPortalLoginRequestMetadata(): Promise<{
  ipAddress: string | null;
  deviceLabel: string | null;
}> {
  try {
    const { headers } = await import('next/headers');
    const headerStore = await headers();
    const ipAddress =
      headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headerStore.get('x-real-ip') ??
      null;
    const userAgent = headerStore.get('user-agent');
    const deviceLabel = userAgent ? userAgent.slice(0, 200) : null;
    return { ipAddress, deviceLabel };
  } catch {
    return { ipAddress: null, deviceLabel: null };
  }
}

export async function wasExecutiveLoginFailureNotificationSentRecently(
  employeeId: string,
): Promise<boolean> {
  const { createSupabaseServiceClient } = await import('../../../packages/supabase/service');
  const service = createSupabaseServiceClient();
  const since = new Date(
    Date.now() - EXECUTIVE_LOGIN_FAILURE_NOTIFICATION_COOLDOWN_MS,
  ).toISOString();
  const { count } = await service
    .from('portal_login_events')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('event_type', 'executive_login_notification')
    .eq('success', false)
    .gte('created_at', since);

  return (count ?? 0) > 0;
}

/**
 * Emails MD/OD on login success, failed credential attempts, and self-service OTP requests.
 * Failure notifications are rate-limited to one email per minute per employee.
 */
export async function notifyExecutivePortalLoginAttempt(
  input: ExecutivePortalLoginNotificationInput,
): Promise<void> {
  if (!isExecutivePortalRank(input.rank)) return;

  const workEmail = input.workEmail.trim();
  if (!workEmail) return;

  const notificationKind =
    input.kind === 'otp_request'
      ? 'otp_request'
      : input.success
        ? 'login_success'
        : 'login_failure';

  if (!input.success && notificationKind === 'login_failure') {
    const throttled = await wasExecutiveLoginFailureNotificationSentRecently(
      input.employeeId,
    );
    if (throttled) return;
  }

  const portalLabel = input.staffPortal
    ? headOfficePortalOtpLabel(input.staffPortal)
    : 'MD Portal';

  const mail = await sendHeadOfficePortalLoginNotificationEmail({
    to: workEmail,
    workEmail,
    success: input.success,
    kind: notificationKind,
    ip: input.ipAddress,
    deviceLabel: input.deviceLabel,
    portalLabel,
  });

  await recordPortalLoginEvent({
    employeeId: input.employeeId,
    portalAuthEmail: input.portalAuthEmail,
    eventType: 'executive_login_notification',
    success: notificationKind === 'login_failure' ? false : true,
    ipAddress: input.ipAddress ?? null,
    deviceLabel: input.deviceLabel ?? null,
    detail: JSON.stringify({
      kind: notificationKind,
      emailed: Boolean(mail.emailed),
      error: mail.error ?? null,
    }),
  });
}

/** Run once the employee has fully completed portal sign-in (post 2FA / setup). */
export async function finalizePortalLoginNotifications(
  input: FinalizePortalLoginNotificationsInput,
): Promise<void> {
  const staffPortal =
    input.staffPortal ?? staffPortalIdForRole(input.rank, { rbacGated: false });

  await notifyExecutivePortalLoginAttempt({
    employeeId: input.employeeId,
    workEmail: input.workEmail,
    recoveryEmail: input.recoveryEmail,
    portalAuthEmail: input.portalAuthEmail,
    rank: input.rank,
    success: true,
    ipAddress: input.ipAddress,
    deviceLabel: input.deviceLabel,
    staffPortal,
  });

  await notifyIfAfterHoursPortalLogin({
    companyId: input.companyId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    employeeRank: input.rank,
    workEmail: input.workEmail,
    portalAuthEmail: input.portalAuthEmail,
    staffPortal,
    ipAddress: input.ipAddress,
    deviceLabel: input.deviceLabel,
  });
}
