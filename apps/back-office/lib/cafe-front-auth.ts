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

export function normalizeEpfNo(input: string): string {
  return input.trim();
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

export async function provisionCafeFrontAuth(
  supabase: SupabaseClient,
  employee: CafeEmployeeRow,
): Promise<{ ok: boolean; error?: string }> {
  const epf = employee.epf_no ?? employee.epf_num;
  if (!epf) return { ok: false, error: 'Employee has no EPF number.' };

  const email = cafeFrontAuthEmail(epf);
  const password = cafeFrontAuthPassword(epf);

  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, {
      password,
      user_metadata: {
        role: 'CAFE_STAFF',
        employee_id: employee.id,
        full_name: employee.full_name,
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'CAFE_STAFF',
      employee_id: employee.id,
      full_name: employee.full_name,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
