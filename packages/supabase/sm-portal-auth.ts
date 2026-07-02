import 'server-only';

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function smPortalSyntheticEmail(canonicalEpf: string): string {
  return `${canonicalEpf.trim().toLowerCase()}@pearzen.sm`;
}

function randomPortalPassword(): string {
  return randomBytes(24).toString('hex');
}

async function findSmPortalAuthUser(
  admin: SupabaseClient,
  canonicalEpf: string,
) {
  const email = smPortalSyntheticEmail(canonicalEpf);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
  return data?.users?.find((user) => user.email?.toLowerCase() === email) ?? null;
}

/** Clear provisioned OTP metadata after a successful login (session must stay valid for set-PIN). */
export async function burnSmPortalOtpAfterLogin(
  admin: SupabaseClient,
  canonicalEpf: string,
): Promise<void> {
  const epf = canonicalEpf.trim().toUpperCase();
  await admin
    .from('sm_portal_auth')
    .update({
      current_otp: null,
      current_otp_hash: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);
}

/** Revoke a provisioned OTP so it cannot sign in again (expired OTP attempt). */
export async function revokeSmPortalOtpCredentials(
  admin: SupabaseClient,
  canonicalEpf: string,
): Promise<void> {
  const epf = canonicalEpf.trim().toUpperCase();
  const user = await findSmPortalAuthUser(admin, epf);
  if (user) {
    await admin.auth.admin.updateUserById(user.id, {
      password: randomPortalPassword(),
    });
  }

  await admin
    .from('sm_portal_auth')
    .update({
      current_otp: null,
      current_otp_hash: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', epf);
}
