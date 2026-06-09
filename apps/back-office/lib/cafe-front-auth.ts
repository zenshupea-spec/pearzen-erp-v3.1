import type { SupabaseClient, User } from '@supabase/supabase-js';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type CafeEmployeeRow = {
  id: string;
  full_name: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | null;
  status: string | null;
  group: string | null;
  rank: string | null;
};

export const CAFE_FRONT_EPF_MAX_LENGTH = 10;
/** Matches SM portal — Supabase Auth requires at least 6 characters. */
export const CAFE_FRONT_PIN_LENGTH = 6;
export const CAFE_FRONT_OTP_MAX_LENGTH = 6;

export function cafeEmployeeEpfKey(employee: CafeEmployeeRow): string {
  const epf = employee.epf_no ?? employee.epf_num;
  return epf ? normalizeEpfNo(String(epf)) : '';
}

export function normalizeEpfNo(input: string): string {
  return input.trim().toUpperCase().slice(0, CAFE_FRONT_EPF_MAX_LENGTH);
}

export function epfAuthLocalPart(epf: string): string {
  return normalizeEpfNo(epf).toLowerCase();
}

export function cafeFrontAuthEmail(epf: string): string {
  return `${epfAuthLocalPart(epf)}@pearzen.local`;
}

export function cafeFrontAuthPassword(epfOrKey: string): string {
  const fixed = process.env.FIELD_PWA_AUTH_PASSWORD;
  if (fixed) return fixed;

  const template = process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE;
  if (template) {
    return template
      .replaceAll('{{epfNo}}', epfOrKey)
      .replaceAll('{{empNumber}}', epfOrKey);
  }

  return epfOrKey;
}

export function isCafeEmployee(employee: CafeEmployeeRow): boolean {
  const group = (employee.group ?? '').trim().toUpperCase();
  return group === 'CAFE';
}

export function isEmployeeActive(employee: CafeEmployeeRow): boolean {
  return (employee.status ?? '').trim().toUpperCase() === 'ACTIVE';
}

export function employeeRosterKey(employee: CafeEmployeeRow): string {
  if (employee.emp_number) return String(employee.emp_number).trim().toUpperCase();
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf != null) return String(epf).trim();
  return '';
}

const FULL_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_no, epf_num, status, group, rank';

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
  };
}

export async function findCafeEmployeeByEpf(
  supabase: SupabaseClient,
  epfInput: string,
): Promise<CafeEmployeeRow | null> {
  const key = normalizeEpfNo(epfInput);
  if (!key) return null;

  for (const column of ['epf_no', 'epf_num'] as const) {
    const { data } = await supabase
      .from('employees')
      .select(FULL_EMPLOYEE_SELECT)
      .eq(column, key)
      .maybeSingle();
    if (data) return mapEmployeeRow(data as Record<string, unknown>);
  }

  const { data: ilike } = await supabase
    .from('employees')
    .select(FULL_EMPLOYEE_SELECT)
    .or(`epf_no.ilike.${key},epf_num.ilike.${key}`)
    .maybeSingle();

  return mapEmployeeRow(ilike as Record<string, unknown> | null);
}

export async function resolveCafeEmployeeForUser(
  user: User,
): Promise<CafeEmployeeRow | null> {
  if (!user.email) return null;
  const localPart = user.email.split('@')[0]?.trim();
  if (!localPart) return null;

  const service = createSupabaseServiceClient();
  const employee = await findCafeEmployeeByEpf(service, localPart);
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
} | null> {
  const key = normalizeEpfNo(epf);
  if (!key) return null;

  const { data } = await supabase
    .from('cafe_portal_auth')
    .select('needs_pin_setup, is_active')
    .eq('epf_number', key)
    .maybeSingle();

  if (!data) return null;
  return {
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
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

  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
      user_metadata: {
        role: 'CAFE_STAFF',
        employee_id: employee.id,
        full_name: employee.full_name,
      },
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
      user_metadata: {
        role: 'CAFE_STAFF',
        employee_id: employee.id,
        full_name: employee.full_name,
      },
    });
    if (error) return { ok: false, error: error.message };
  }

  const { error: dbError } = await supabase.from('cafe_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp: otp,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (dbError) return { ok: false, error: dbError.message };
  return { ok: true };
}
