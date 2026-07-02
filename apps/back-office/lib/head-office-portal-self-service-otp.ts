import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE,
  headOfficeForgotPasswordOtpResetFields,
  isEligibleExecutivePortalSelfServiceTarget,
  otpExpiresMinutesForRank,
  otpLifetimeMsForRank,
} from './executive-portal-auth-policy';
import { fetchEmployeePortalProfileByEmail } from './hr-portal-access';
import {
  generateHeadOfficeOtp,
  getHeadOfficePortalAuthByEmail,
  normalizeWorkEmail,
  resolvePortalAuthEmail,
  syncHeadOfficeSupabaseAuthPassword,
} from './head-office-portal-auth';
import { sendHeadOfficePortalOtpEmail } from './head-office-portal-email';
import { notifyExecutivePortalLoginAttempt } from './head-office-portal-login-notification';
import { recordPortalLoginEvent } from './portal-login-events';

const SELF_SERVICE_COOLDOWN_MS = 60 * 1000;
const SELF_SERVICE_HOURLY_MAX = 5;
const SELF_SERVICE_HOURLY_WINDOW_MS = 60 * 60 * 1000;

async function countRecentSelfServiceOtpRequests(
  employeeId: string,
): Promise<number> {
  const service = createSupabaseServiceClient();
  const since = new Date(Date.now() - SELF_SERVICE_HOURLY_WINDOW_MS).toISOString();
  const { count } = await service
    .from('portal_login_events')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('event_type', 'otp_self_service_requested')
    .gte('created_at', since);

  return count ?? 0;
}

function isWithinSelfServiceCooldown(lastProvisionedAt: string | null): boolean {
  if (!lastProvisionedAt) return false;
  return Date.now() - new Date(lastProvisionedAt).getTime() < SELF_SERVICE_COOLDOWN_MS;
}

/**
 * Self-service OTP for MD/OD on `/login/md/request-code`.
 * Always returns the same success message; rate limits and invalid targets are silent.
 */
export async function requestExecutivePortalAccessCode(workEmail: string): Promise<{
  message: string;
}> {
  const email = normalizeWorkEmail(workEmail);
  if (!email) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  const profile = await fetchEmployeePortalProfileByEmail(email);
  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  if (
    !isEligibleExecutivePortalSelfServiceTarget({
      employeeId: profile?.employeeId,
      rank: profile?.role,
      authActive: Boolean(authRecord?.is_active),
    })
  ) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  if (!authRecord || !profile?.employeeId) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  if (isWithinSelfServiceCooldown(authRecord.last_otp_provisioned_at)) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  const recentCount = await countRecentSelfServiceOtpRequests(authRecord.employee_id);
  if (recentCount >= SELF_SERVICE_HOURLY_MAX) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  const otp = generateHeadOfficeOtp();
  const otpExpiresAt = new Date(
    Date.now() + otpLifetimeMsForRank(profile.role),
  ).toISOString();
  const portalAuthEmail = resolvePortalAuthEmail(authRecord);
  const nowIso = new Date().toISOString();

  const authSync = await syncHeadOfficeSupabaseAuthPassword(portalAuthEmail, otp, {
    employeeId: authRecord.employee_id,
    fullName: profile.full_name,
  });
  if (!authSync.ok) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  const service = createSupabaseServiceClient();
  const updatePayload: Record<string, unknown> = {
    current_otp: otp,
    otp_expires_at: otpExpiresAt,
    last_otp_provisioned_at: nowIso,
    last_otp_provisioned_by_employee_id: null,
    last_otp_provisioned_by_name: 'Self-service',
    last_otp_provisioned_lat: null,
    last_otp_provisioned_lng: null,
    last_otp_provisioned_location_label: null,
    updated_at: nowIso,
    ...headOfficeForgotPasswordOtpResetFields(authRecord),
  };

  const { error } = await service
    .from('head_office_portal_auth')
    .update(updatePayload)
    .eq('employee_id', authRecord.employee_id);

  if (error) {
    return { message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE };
  }

  const staffName = profile.full_name?.trim() || 'Executive';
  const mail = await sendHeadOfficePortalOtpEmail({
    to: email,
    otp,
    staffName,
    portalLabel: 'MD Portal',
    expiresMinutes: otpExpiresMinutesForRank(profile.role),
    portal: 'md',
  });

  await recordPortalLoginEvent({
    employeeId: authRecord.employee_id,
    portalAuthEmail,
    eventType: 'otp_self_service_requested',
    success: true,
    detail: JSON.stringify({
      emailed: Boolean(mail.emailed),
      forgotPasswordReset: Boolean(
        Object.keys(headOfficeForgotPasswordOtpResetFields(authRecord)).length > 0,
      ),
    }),
  });

  if (mail.emailed) {
    await recordPortalLoginEvent({
      employeeId: authRecord.employee_id,
      portalAuthEmail,
      eventType: 'otp_emailed',
      success: true,
      detail: JSON.stringify({ source: 'self_service' }),
    });
    await notifyExecutivePortalLoginAttempt({
      employeeId: authRecord.employee_id,
      workEmail: email,
      recoveryEmail: authRecord.recovery_email,
      portalAuthEmail,
      rank: profile.role,
      success: true,
      kind: 'otp_request',
    });
  } else if (mail.error) {
    await recordPortalLoginEvent({
      employeeId: authRecord.employee_id,
      portalAuthEmail,
      eventType: 'otp_email_failed',
      success: false,
      detail: mail.error,
    });
  }

  return {
    message: EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE,
  };
}
