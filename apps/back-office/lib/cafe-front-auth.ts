import type { SupabaseClient, User } from '@supabase/supabase-js';

import { resolveAuthUserCompanyId } from '../../../packages/supabase/auth-tenant-metadata';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export {
  CAFE_FRONT_AUTH_EMAIL_DOMAIN,
  CAFE_FRONT_EPF_MAX_LENGTH,
  CAFE_FRONT_OTP_MAX_LENGTH,
  CAFE_FRONT_PIN_LENGTH,
  CAFE_PORTAL_OTP_LIFETIME_MS,
  cafeEmployeeEpfKey,
  cafeFrontAuthEmail,
  cafeFrontAuthEmailDomain,
  cafeFrontAuthPassword,
  employeeRosterKey,
  epfAuthLocalPart,
  isCafeEmployee,
  isCafeFrontAuthEmail,
  isCafeOtpValid,
  isEmployeeActive,
  normalizeEpfNo,
  type CafeEmployeeRow,
} from './cafe-front-auth-shared';

import {
  CAFE_PORTAL_OTP_LIFETIME_MS,
  cafeEmployeeEpfKey,
  cafeFrontAuthEmail,
  isCafeEmployee,
  isCafeFrontAuthEmail,
  isCafeOtpValid,
  isEmployeeActive,
  normalizeEpfNo,
  type CafeEmployeeRow,
} from './cafe-front-auth-shared';

const FULL_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_no, epf_num, status, group, rank, site, company_id';

function mapEmployeeRow(
  row: Record<string, unknown> | null,
): CafeEmployeeRow | null {
  if (!row || typeof row.id !== 'string') return null;
  const epfNum = row.epf_num != null ? String(row.epf_num) : null;
  const epfNo = row.epf_no != null ? String(row.epf_no) : epfNum;
  return {
    id: row.id,
    full_name: (row.full_name as string | null) ?? null,
    emp_number: (row.emp_number as string | null) ?? null,
    epf_no: epfNo,
    epf_num: epfNum,
    status: (row.status as string | null) ?? null,
    group: (row.group as string | null) ?? null,
    rank: (row.rank as string | null) ?? null,
    site: (row.site as string | null) ?? null,
    company_id: row.company_id != null ? String(row.company_id) : null,
  };
}

function applyCafeEmployeeScope<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  companyId?: string | null,
): T {
  let scoped = query.eq('group', 'CAFE');
  if (companyId) scoped = scoped.eq('company_id', companyId);
  return scoped;
}

/** Tenant-scoped café roster lookup — `group = CAFE` only (R-CAFE-AUTH-01). */
export async function findCafeEmployeeByEpf(
  supabase: SupabaseClient,
  epfInput: string,
  companyId?: string | null,
): Promise<CafeEmployeeRow | null> {
  const key = normalizeEpfNo(epfInput);
  if (!key) return null;

  for (const column of ['epf_no', 'epf_num'] as const) {
    const { data } = await applyCafeEmployeeScope(
      supabase.from('employees').select(FULL_EMPLOYEE_SELECT).eq(column, key),
      companyId,
    ).maybeSingle();
    if (data) return mapEmployeeRow(data as Record<string, unknown>);
  }

  const ilikeQuery = applyCafeEmployeeScope(
    supabase.from('employees').select(FULL_EMPLOYEE_SELECT),
    companyId,
  ).or(`epf_no.ilike.${key},epf_num.ilike.${key}`);
  const { data: ilikeRows } = await ilikeQuery;
  if (ilikeRows?.length === 1) {
    return mapEmployeeRow(ilikeRows[0] as Record<string, unknown>);
  }

  return null;
}

export async function resolveCafeEmployeeForUser(
  user: User,
): Promise<CafeEmployeeRow | null> {
  if (!user.email || !isCafeFrontAuthEmail(user.email)) return null;
  const localPart = user.email.split('@')[0]?.trim();
  if (!localPart) return null;

  const service = createSupabaseServiceClient();
  const companyId = resolveAuthUserCompanyId(user);
  const employee = await findCafeEmployeeByEpf(service, localPart, companyId);
  if (!employee || !isEmployeeActive(employee) || !isCafeEmployee(employee)) {
    return null;
  }
  return employee;
}

export async function getCafePortalAuthRecord(
  supabase: SupabaseClient,
  epf: string,
): Promise<{
  needs_pin_setup: boolean;
  is_active: boolean;
  current_otp: string | null;
  otp_expires_at: string | null;
} | null> {
  const key = normalizeEpfNo(epf);
  if (!key) return null;

  const { data } = await supabase
    .from('cafe_portal_auth')
    .select('needs_pin_setup, is_active, current_otp, otp_expires_at')
    .eq('epf_number', key)
    .maybeSingle();

  if (!data) return null;
  return {
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
    current_otp: typeof data.current_otp === 'string' ? data.current_otp : null,
    otp_expires_at:
      typeof data.otp_expires_at === 'string' ? data.otp_expires_at : null,
  };
}

export async function provisionCafePortalOtp(
  supabase: SupabaseClient,
  employee: CafeEmployeeRow,
  otp: string,
): Promise<{ ok: boolean; error?: string }> {
  const epf = cafeEmployeeEpfKey(employee);
  if (!epf) return { ok: false, error: 'Employee has no EPF number.' };

  const email = cafeFrontAuthEmail(epf);

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
      role: 'CAFE_STAFF',
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

  const { error: dbError } = await supabase.from('cafe_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp: otp,
      otp_expires_at: new Date(Date.now() + CAFE_PORTAL_OTP_LIFETIME_MS).toISOString(),
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
  const buffer = new Uint8Array(24);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Clear OTP metadata after successful login — keep auth password until set-PIN. */
export async function burnCafePortalOtpAfterLogin(
  supabase: SupabaseClient,
  epf: string,
): Promise<void> {
  const normalizedEpf = epf.trim().toUpperCase();
  await supabase
    .from('cafe_portal_auth')
    .update({
      current_otp: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', normalizedEpf);
}

/** Revoke a provisioned café OTP so it cannot sign in again (expired OTP attempt). */
export async function revokeCafePortalOtpCredentials(
  supabase: SupabaseClient,
  epf: string,
): Promise<void> {
  const normalizedEpf = epf.trim().toUpperCase();
  const email = cafeFrontAuthEmail(normalizedEpf);

  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000, page: 1 });
  const user = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    await supabase.auth.admin.updateUserById(user.id, {
      password: randomPortalPassword(),
    });
  }

  await supabase
    .from('cafe_portal_auth')
    .update({
      current_otp: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('epf_number', normalizedEpf);
}
