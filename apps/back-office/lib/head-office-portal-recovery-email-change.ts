import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { executivePortalOtpEmailFrom } from './executive-portal-auth-policy';
import {
  generateHeadOfficeOtp,
  getHeadOfficePortalAuthByEmployeeId,
  verifyHeadOfficeTotpStepUp,
} from './head-office-portal-auth';
import {
  buildExecutiveRecoveryEmailVerificationEmailBody,
  EXECUTIVE_RECOVERY_EMAIL_OTP_EXPIRES_MINUTES,
  EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS,
  storeRecoveryEmailChangeCodeHash,
  verifyRecoveryEmailChangeCodeHash,
} from './head-office-portal-recovery-email-change-utils';
import {
  normalizeRecoveryEmail,
  validateExecutiveRecoveryEmail,
} from './head-office-portal-recovery-email';

export {
  buildExecutiveRecoveryEmailVerificationEmailBody,
  EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS,
  verifyRecoveryEmailChangeCodeHash,
} from './head-office-portal-recovery-email-change-utils';

async function sendRecoveryEmailVerificationOtp(input: {
  to: string;
  staffName: string;
  workEmail: string;
  otp: string;
}): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const { subject, text } = buildExecutiveRecoveryEmailVerificationEmailBody({
    staffName: input.staffName,
    workEmail: input.workEmail,
    otp: input.otp,
    expiresMinutes: EXECUTIVE_RECOVERY_EMAIL_OTP_EXPIRES_MINUTES,
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

async function isRecoveryEmailTakenByOther(
  recoveryEmail: string,
  employeeId: string,
): Promise<boolean> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('head_office_portal_auth')
    .select('employee_id')
    .eq('recovery_email', recoveryEmail)
    .neq('employee_id', employeeId)
    .maybeSingle();

  return Boolean(data?.employee_id);
}

export async function getExecutiveRecoveryEmailProfile(employeeId: string): Promise<
  | {
      ok: true;
      workEmail: string;
      recoveryEmail: string | null;
      recoveryEmailVerifiedAt: string | null;
      twoFactorEnabled: boolean;
    }
  | { ok: false; error: string }
> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: 'Portal access is not active.' };
  }

  return {
    ok: true,
    workEmail: authRecord.work_email,
    recoveryEmail: authRecord.recovery_email,
    recoveryEmailVerifiedAt: authRecord.recovery_email_verified_at,
    twoFactorEnabled: authRecord.two_factor_enabled,
  };
}

export async function requestExecutiveRecoveryEmailChange(input: {
  employeeId: string;
  workEmail: string;
  staffName: string;
  newRecoveryEmail: string;
  totpCode: string;
}): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(input.employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: 'Portal access is not active.' };
  }
  if (!authRecord.two_factor_enabled) {
    return {
      ok: false,
      error: 'Enable two-factor authentication before changing your recovery email.',
    };
  }

  const stepUp = await verifyHeadOfficeTotpStepUp(input.employeeId, input.totpCode);
  if (!stepUp.ok) {
    return { ok: false, error: stepUp.error ?? 'Invalid authenticator code.' };
  }

  const validated = validateExecutiveRecoveryEmail(
    input.workEmail,
    input.newRecoveryEmail,
  );
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const newRecovery = validated.recoveryEmail;
  if (newRecovery === normalizeRecoveryEmail(authRecord.recovery_email ?? '')) {
    return { ok: false, error: 'That is already your recovery email.' };
  }

  if (await isRecoveryEmailTakenByOther(newRecovery, input.employeeId)) {
    return {
      ok: false,
      error: 'That recovery email is already registered to another portal account.',
    };
  }

  const otp = generateHeadOfficeOtp();
  const service = createSupabaseServiceClient();
  const expiresAt = new Date(Date.now() + EXECUTIVE_RECOVERY_EMAIL_OTP_TTL_MS).toISOString();

  await service
    .from('head_office_recovery_email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('employee_id', input.employeeId)
    .is('consumed_at', null);

  const { error } = await service
    .from('head_office_recovery_email_change_requests')
    .insert({
      employee_id: input.employeeId,
      new_recovery_email: newRecovery,
      code_hash: storeRecoveryEmailChangeCodeHash(otp),
      expires_at: expiresAt,
    });

  if (error) {
    return { ok: false, error: error.message };
  }

  const mail = await sendRecoveryEmailVerificationOtp({
    to: newRecovery,
    staffName: input.staffName,
    workEmail: input.workEmail,
    otp,
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

  return { ok: true };
}

export async function confirmExecutiveRecoveryEmailChange(input: {
  employeeId: string;
  workEmail: string;
  newRecoveryEmail: string;
  verificationCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const validated = validateExecutiveRecoveryEmail(
    input.workEmail,
    input.newRecoveryEmail,
  );
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const newRecovery = validated.recoveryEmail;
  const service = createSupabaseServiceClient();
  const { data: pending } = await service
    .from('head_office_recovery_email_change_requests')
    .select('id, code_hash, expires_at, new_recovery_email')
    .eq('employee_id', input.employeeId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) {
    return { ok: false, error: 'No pending recovery email change. Request a new code.' };
  }

  if (new Date(String(pending.expires_at)).getTime() <= Date.now()) {
    return { ok: false, error: 'Verification code expired. Start again.' };
  }

  if (normalizeRecoveryEmail(String(pending.new_recovery_email)) !== newRecovery) {
    return { ok: false, error: 'Email does not match the pending change.' };
  }

  if (!verifyRecoveryEmailChangeCodeHash(input.verificationCode, String(pending.code_hash))) {
    return { ok: false, error: 'Invalid verification code.' };
  }

  if (await isRecoveryEmailTakenByOther(newRecovery, input.employeeId)) {
    return {
      ok: false,
      error: 'That recovery email is already registered to another portal account.',
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await service
    .from('head_office_portal_auth')
    .update({
      recovery_email: newRecovery,
      recovery_email_verified_at: now,
      updated_at: now,
    })
    .eq('employee_id', input.employeeId);

  if (updateError) {
    if (updateError.message.toLowerCase().includes('unique')) {
      return {
        ok: false,
        error: 'That recovery email is already registered to another portal account.',
      };
    }
    return { ok: false, error: updateError.message };
  }

  await service
    .from('head_office_recovery_email_change_requests')
    .update({ consumed_at: now })
    .eq('id', pending.id);

  return { ok: true };
}
