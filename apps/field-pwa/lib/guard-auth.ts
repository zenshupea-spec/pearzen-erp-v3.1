import type { SupabaseClient } from '@supabase/supabase-js';

export type GuardEmployeeRow = {
  id: string;
  full_name: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | null;
  status: string | null;
};

export function normalizeEpfNo(input: string): string {
  return input.trim();
}

export function epfAuthLocalPart(epf: string): string {
  return normalizeEpfNo(epf).toLowerCase();
}

export function fieldPwaAuthEmail(epf: string): string {
  return `${epfAuthLocalPart(epf)}@pearzen.local`;
}

const SUPABASE_AUTH_PASSWORD_MIN_LENGTH = 6;

/** Supabase Auth rejects passwords shorter than 6 characters. */
function ensureFieldPwaAuthPasswordLength(password: string): string {
  if (password.length >= SUPABASE_AUTH_PASSWORD_MIN_LENGTH) return password;
  return `guard-${password}`;
}

export function fieldPwaAuthPassword(epfOrKey: string): string {
  const fixed = process.env.FIELD_PWA_AUTH_PASSWORD;
  if (fixed) return fixed;

  const template = process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE;
  if (template) {
    return ensureFieldPwaAuthPasswordLength(
      template
        .replaceAll('{{epfNo}}', epfOrKey)
        .replaceAll('{{empNumber}}', epfOrKey),
    );
  }

  return ensureFieldPwaAuthPasswordLength(epfOrKey);
}

/** Key used on attendance_logs / time_rosters (prefers internal emp_number when set). */
export function guardRosterKey(employee: GuardEmployeeRow): string {
  if (employee.emp_number) return String(employee.emp_number).trim().toUpperCase();
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf != null) return String(epf).trim();
  return '';
}

export function isEmployeeActive(employee: GuardEmployeeRow): boolean {
  return (employee.status ?? '').trim().toUpperCase() === 'ACTIVE';
}

const LEGACY_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_num, status';

const FULL_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_no, epf_num, status';

function mapEmployeeRow(
  row: Record<string, unknown> | null,
): GuardEmployeeRow | null {
  if (!row || typeof row.id !== 'string') return null;
  const epfNum = row.epf_num != null ? String(row.epf_num) : null;
  const epfNo =
    row.epf_no != null ? String(row.epf_no) : epfNum;
  return {
    id: row.id,
    full_name: (row.full_name as string | null) ?? null,
    emp_number: (row.emp_number as string | null) ?? null,
    epf_no: epfNo,
    epf_num: epfNum,
    status: (row.status as string | null) ?? null,
  };
}

export async function findEmployeeByEpf(
  supabase: SupabaseClient,
  epfInput: string,
): Promise<GuardEmployeeRow | null> {
  const key = normalizeEpfNo(epfInput);
  if (!key) return null;

  const { data: byEpfNo, error: epfNoError } = await supabase
    .from('employees')
    .select(FULL_EMPLOYEE_SELECT)
    .eq('epf_no', key)
    .maybeSingle();

  if (!epfNoError && byEpfNo) {
    return mapEmployeeRow(byEpfNo as Record<string, unknown>);
  }

  const { data: byEpfNum, error: epfNumError } = await supabase
    .from('employees')
    .select(LEGACY_EMPLOYEE_SELECT)
    .eq('epf_num', key)
    .maybeSingle();

  if (!epfNumError && byEpfNum) {
    return mapEmployeeRow(byEpfNum as Record<string, unknown>);
  }

  const { data: ilikeNo, error: ilikeNoErr } = await supabase
    .from('employees')
    .select(FULL_EMPLOYEE_SELECT)
    .ilike('epf_no', key);

  if (!ilikeNoErr && ilikeNo?.length === 1) {
    return mapEmployeeRow(ilikeNo[0] as Record<string, unknown>);
  }

  const { data: ilikeRows, error: ilikeError } = await supabase
    .from('employees')
    .select(LEGACY_EMPLOYEE_SELECT)
    .ilike('epf_num', key);

  if (!ilikeError && ilikeRows?.length === 1) {
    return mapEmployeeRow(ilikeRows[0] as Record<string, unknown>);
  }

  return null;
}

/** Create or refresh Supabase Auth for guard portal (EPF-based email). */
export async function provisionGuardPortalAuth(
  admin: SupabaseClient,
  employee: GuardEmployeeRow,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const canonicalEpf = canonicalEpfFromEmployee(employee);
  if (!canonicalEpf) {
    return { ok: false, error: 'Employee has no EPF number on file.' };
  }

  const email = fieldPwaAuthEmail(canonicalEpf);
  const password = fieldPwaAuthPassword(canonicalEpf);

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    return { ok: false, error: `Auth lookup failed: ${listError.message}` };
  }

  const found = listed?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (found) {
    const { error: updateErr } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      return { ok: false, error: `Auth update failed: ${updateErr.message}` };
    }
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return { ok: false, error: `Auth creation failed: ${createErr.message}` };
    }
  }

  return { ok: true, email };
}

export function canonicalEpfFromEmployee(employee: GuardEmployeeRow): string {
  const epf = employee.epf_no ?? employee.epf_num;
  return epf != null ? normalizeEpfNo(String(epf)) : '';
}

/** Auth local-parts to try (EPF first, then legacy emp_number accounts). */
export function authLocalPartsForEmployee(employee: GuardEmployeeRow): string[] {
  const parts: string[] = [];
  const epf = canonicalEpfFromEmployee(employee);
  if (epf) parts.push(epfAuthLocalPart(epf));
  if (employee.emp_number) {
    const emp = String(employee.emp_number).trim().toUpperCase();
    const epfPart = epf ? epfAuthLocalPart(epf) : '';
    if (emp && emp !== epfPart.toUpperCase()) {
      parts.push(emp.toLowerCase());
    }
  }
  return [...new Set(parts)];
}

export type GuardSessionContext = {
  epfNo: string;
  rosterKey: string;
  employee: GuardEmployeeRow | null;
};

export async function resolveGuardSession(
  supabase: SupabaseClient,
  sessionEmail: string | undefined,
): Promise<GuardSessionContext> {
  const local = (sessionEmail?.split('@')[0] ?? '').trim();
  if (!local) {
    return { epfNo: '', rosterKey: '', employee: null };
  }

  const employee = await findEmployeeByEpf(supabase, local);
  if (employee) {
    const epfNo = canonicalEpfFromEmployee(employee) || local;
    const rosterKey = guardRosterKey(employee) || epfNo;
    return { epfNo, rosterKey, employee };
  }

  // Legacy session: email local part was emp_number
  const rosterKey = local.toUpperCase();
  return { epfNo: local, rosterKey, employee: null };
}
