import 'server-only';

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  hashShalomPortalOtp,
  isShalomPortalOtpActive,
  verifyShalomPortalOtp,
} from '../../../packages/supabase/shalom-portal-otp';

import {
  SHALOM_PORTAL_OTP_LIFETIME_MS,
  shalomEmployeeEpfKey,
  shalomFrontAuthEmail,
  type ShalomEmployeeRow,
} from './shalom-front-auth-shared';

export function isShalomPortalOtpValid(
  authRecord: {
    current_otp_hash: string | null;
    otp_expires_at: string | null;
  } | null,
  otp: string,
  epf: string,
): boolean {
  if (!authRecord?.current_otp_hash || !authRecord.otp_expires_at) return false;
  if (!isShalomPortalOtpActive(authRecord.otp_expires_at)) return false;
  return verifyShalomPortalOtp(otp, epf, authRecord.current_otp_hash);
}

export async function provisionShalomPortalOtp(
  supabase: SupabaseClient,
  employee: ShalomEmployeeRow,
  otp: string,
): Promise<{ ok: boolean; error?: string }> {
  const epf = shalomEmployeeEpfKey(employee);
  if (!epf) return { ok: false, error: 'Employee has no EPF number.' };

  const email = shalomFrontAuthEmail(epf);
  const companyId =
    employee.company_id ??
    (
      await supabase.from('employees').select('company_id').eq('id', employee.id).maybeSingle()
    ).data?.company_id;
  if (!companyId) {
    return { ok: false, error: 'Employee is missing company_id.' };
  }

  const authPayload = {
    app_metadata: { company_id: companyId },
    user_metadata: {
      role: 'SHALOM_CARETAKER',
      employee_id: employee.id,
      full_name: employee.full_name,
    },
  };

  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
      ...authPayload,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
      ...authPayload,
    });
    if (error) return { ok: false, error: error.message };
  }

  const otpHash = hashShalomPortalOtp(otp, epf);
  const { error: dbError } = await supabase.from('shalom_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp_hash: otpHash,
      otp_expires_at: new Date(Date.now() + SHALOM_PORTAL_OTP_LIFETIME_MS).toISOString(),
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}

function randomPortalPassword(): string {
  return randomBytes(24).toString('hex');
}

/** Clear OTP metadata after successful login — keep auth password until set-PIN. */
export async function burnShalomPortalOtpAfterLogin(
  supabase: SupabaseClient,
  epf: string,
): Promise<void> {
  const normalizedEpf = epf.trim().toUpperCase();
  await supabase
    .from('shalom_portal_auth')
    .update({
      current_otp_hash: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', normalizedEpf);
}

/** Revoke a provisioned Shalom OTP so it cannot sign in again (expired OTP attempt). */
export async function revokeShalomPortalOtpCredentials(
  supabase: SupabaseClient,
  epf: string,
): Promise<void> {
  const normalizedEpf = epf.trim().toUpperCase();
  const email = shalomFrontAuthEmail(normalizedEpf);

  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000, page: 1 });
  const user = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    await supabase.auth.admin.updateUserById(user.id, {
      password: randomPortalPassword(),
    });
  }

  await supabase
    .from('shalom_portal_auth')
    .update({
      current_otp_hash: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', normalizedEpf);
}

export { isShalomPortalOtpActive };
