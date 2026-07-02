import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { executivePortalOtpEmailFrom } from './executive-portal-auth-policy';
import {
  generateHeadOfficeOtp,
  getHeadOfficePortalAuthByEmployeeId,
  normalizeWorkEmail,
  verifyHeadOfficeTotpStepUp,
} from './head-office-portal-auth';
import {
  buildExecutiveWorkEmailChangeOtpEmailBody,
  EXECUTIVE_RECOVERY_EMAIL_OTP_EXPIRES_MINUTES,
  EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS,
  storeRecoveryEmailChangeCodeHash,
  verifyRecoveryEmailChangeCodeHash,
} from './head-office-portal-recovery-email-change-utils';
import {
  normalizeRecoveryEmail,
  validateExecutiveWorkEmailChange,
} from './head-office-portal-recovery-email';

export type HeadOfficeWorkEmailOtpDestination = 'work' | 'recovery';

export {
  buildExecutiveWorkEmailChangeOtpEmailBody,
  EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS as EXECUTIVE_WORK_EMAIL_OTP_TTL_MS,
} from './head-office-portal-recovery-email-change-utils';

async function sendWorkEmailChangeOtp(input: {
  to: string;
  staffName: string;
  currentWorkEmail: string;
  newWorkEmail: string;
  otp: string;
  sendOtpTo: HeadOfficeWorkEmailOtpDestination;
}): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const { subject, text } = buildExecutiveWorkEmailChangeOtpEmailBody({
    staffName: input.staffName,
    currentWorkEmail: input.currentWorkEmail,
    newWorkEmail: input.newWorkEmail,
    otp: input.otp,
    expiresMinutes: EXECUTIVE_RECOVERY_EMAIL_OTP_EXPIRES_MINUTES,
    sendOtpTo: input.sendOtpTo,
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
        to: [input.to],
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

    return { ok: true, emailed: true };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

async function isWorkEmailTakenByOther(
  workEmail: string,
  employeeId: string,
): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('employees')
    .select('id')
    .ilike('email', workEmail)
    .neq('id', employeeId)
    .maybeSingle();

  return Boolean(data?.id);
}

async function invalidateOtherHeadOfficeVaultSessions(input: {
  companyId: string;
  currentSessionId: string | null;
}): Promise<void> {
  const service = createSupabaseServiceClient();
  await service.rpc('revoke_other_head_office_vault_sessions', {
    p_current_session_id: input.currentSessionId,
    p_company_id: input.companyId,
  });
}

export async function requestHeadOfficeWorkEmailChangeOtp(input: {
  employeeId: string;
  companyId: string;
  currentWorkEmail: string;
  recoveryEmail: string | null;
  staffName: string;
  newWorkEmail: string;
  sendOtpTo: HeadOfficeWorkEmailOtpDestination;
  totpCode: string;
}): Promise<
  | { ok: true; otpSentTo: string }
  | { ok: false; error: string }
> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(input.employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: 'Portal access is not active.' };
  }
  if (!authRecord.two_factor_enabled) {
    return {
      ok: false,
      error: 'Enable two-factor authentication before changing your work email.',
    };
  }

  const stepUp = await verifyHeadOfficeTotpStepUp(input.employeeId, input.totpCode);
  if (!stepUp.ok) {
    return { ok: false, error: stepUp.error ?? 'Invalid authenticator code.' };
  }

  const validated = validateExecutiveWorkEmailChange({
    currentWorkEmail: input.currentWorkEmail,
    recoveryEmail: input.recoveryEmail,
    newWorkEmail: input.newWorkEmail,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const newWork = validated.workEmail;
  if (await isWorkEmailTakenByOther(newWork, input.employeeId)) {
    return {
      ok: false,
      error: 'That work email is already assigned to another employee.',
    };
  }

  const otpDestination =
    input.sendOtpTo === 'recovery'
      ? normalizeRecoveryEmail(authRecord.recovery_email ?? '')
      : normalizeRecoveryEmail(authRecord.work_email);

  if (!otpDestination) {
    return {
      ok: false,
      error:
        input.sendOtpTo === 'recovery'
          ? 'Set a recovery email before using the recovery inbox OTP path.'
          : 'Work email is missing on your portal record.',
    };
  }

  if (
    input.sendOtpTo === 'recovery' &&
    otpDestination === normalizeRecoveryEmail(newWork)
  ) {
    return {
      ok: false,
      error: 'Choose the current work email inbox for this OTP — it must differ from the new work email.',
    };
  }

  const otp = generateHeadOfficeOtp();
  const service = createSupabaseServiceClient();
  const expiresAt = new Date(Date.now() + EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS).toISOString();

  await service
    .from('head_office_work_email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('employee_id', input.employeeId)
    .is('consumed_at', null);

  const { error } = await service.from('head_office_work_email_change_requests').insert({
    employee_id: input.employeeId,
    new_work_email: newWork,
    send_otp_to: input.sendOtpTo,
    code_hash: storeRecoveryEmailChangeCodeHash(otp),
    expires_at: expiresAt,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const mail = await sendWorkEmailChangeOtp({
    to: otpDestination,
    staffName: input.staffName,
    currentWorkEmail: input.currentWorkEmail,
    newWorkEmail: newWork,
    otp,
    sendOtpTo: input.sendOtpTo,
  });
  if (!mail.ok) {
    return { ok: false, error: mail.error ?? 'Could not send verification email.' };
  }
  if (!mail.emailed) {
    return {
      ok: false,
      error: 'Email delivery is not configured. Set RESEND_API_KEY and PORTAL_EMAIL_FROM.',
    };
  }

  return {
    ok: true,
    otpSentTo: otpDestination,
  };
}

export async function confirmHeadOfficeWorkEmailChange(input: {
  employeeId: string;
  companyId: string;
  currentWorkEmail: string;
  recoveryEmail: string | null;
  newWorkEmail: string;
  verificationCode: string;
  currentSessionId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const validated = validateExecutiveWorkEmailChange({
    currentWorkEmail: input.currentWorkEmail,
    recoveryEmail: input.recoveryEmail,
    newWorkEmail: input.newWorkEmail,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const newWork = validated.workEmail;
  const service = createSupabaseServiceClient();
  const { data: pending } = await service
    .from('head_office_work_email_change_requests')
    .select('id, code_hash, expires_at, new_work_email, send_otp_to')
    .eq('employee_id', input.employeeId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { ok: false, error: 'No pending work email change. Request a new code.' };
  }

  if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
    return { ok: false, error: 'Verification code expired. Start again.' };
  }

  if (normalizeRecoveryEmail(String(pending.new_work_email)) !== newWork) {
    return { ok: false, error: 'Email does not match the pending change.' };
  }

  if (!verifyRecoveryEmailChangeCodeHash(input.verificationCode, String(pending.code_hash))) {
    return { ok: false, error: 'Invalid verification code.' };
  }

  if (await isWorkEmailTakenByOther(newWork, input.employeeId)) {
    return {
      ok: false,
      error: 'That work email is already assigned to another employee.',
    };
  }

  const now = new Date().toISOString();
  const { error: employeeError } = await service
    .from('employees')
    .update({ email: newWork })
    .eq('id', input.employeeId);

  if (employeeError) {
    if (employeeError.message.includes('employees_email_lower_unique')) {
      return {
        ok: false,
        error: 'That work email is already assigned to another employee.',
      };
    }
    return { ok: false, error: employeeError.message };
  }

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(input.employeeId);
  const portalAuthEmail = authRecord?.portal_auth_email?.trim() || null;
  const authUpdate: Record<string, unknown> = {
    work_email: newWork,
    updated_at: now,
  };
  if (!portalAuthEmail || normalizeWorkEmail(portalAuthEmail) === normalizeWorkEmail(input.currentWorkEmail)) {
    authUpdate.portal_auth_email = newWork;
  }

  const { error: authError } = await service
    .from('head_office_portal_auth')
    .update(authUpdate)
    .eq('employee_id', input.employeeId);

  if (authError) {
    return { ok: false, error: authError.message };
  }

  await service
    .from('head_office_work_email_change_requests')
    .update({ consumed_at: now })
    .eq('id', pending.id);

  await invalidateOtherHeadOfficeVaultSessions({
    companyId: input.companyId,
    currentSessionId: input.currentSessionId,
  });

  return { ok: true };
}
