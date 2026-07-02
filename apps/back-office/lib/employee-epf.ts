import type { SupabaseClient } from '@supabase/supabase-js';

/** Canonical EPF for compare/store — numeric values drop leading zeros (007 → 7). */
export function normalizeEpfNo(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    return String(parseInt(s, 10));
  }
  return s.toLowerCase();
}

/** Live input — blocks leading zeros on numeric EPF (0007 → 7 as you type). */
export function sanitizeEpfNoInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) {
    return String(parseInt(trimmed, 10));
  }
  return trimmed;
}

export function employeeStoredEpfNo(row: {
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string {
  const raw = row.epf_no ?? row.epf_num;
  return raw == null ? '' : String(raw).trim();
}

/** Canonical roster / assignment key — epf_no first, then emp_number, then employee id. */
export function resolveGuardRosterKey(row: {
  id?: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string {
  const stored = employeeStoredEpfNo(row);
  if (stored) return stored.toUpperCase();
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  return row.id ? String(row.id).trim().toUpperCase() : '';
}

export function friendlyEpfSaveError(message: string): string {
  if (message.includes('employees_company_epf_no_unique')) {
    return 'EPF number is already assigned to another employee and cannot be reused.';
  }
  return message;
}

export async function assertEpfNoUnique(
  supabase: SupabaseClient,
  epfNo: unknown,
  options?: { excludeEmployeeId?: string; companyId?: string | null },
): Promise<void> {
  const norm = normalizeEpfNo(epfNo);
  if (!norm) return;

  const raw = typeof epfNo === 'string' ? epfNo.trim() : String(epfNo ?? '').trim();
  const candidates = [...new Set([raw, norm].filter(Boolean))];
  const orParts = candidates.flatMap((candidate) => [
    `epf_no.eq.${candidate}`,
    `epf_num.eq.${candidate}`,
  ]);

  let query = supabase
    .from('employees')
    .select('id, full_name, epf_no, epf_num')
    .or(orParts.join(','));

  if (options?.excludeEmployeeId) {
    query = query.neq('id', options.excludeEmployeeId);
  }
  if (options?.companyId) {
    query = query.eq('company_id', options.companyId);
  }

  const { data, error } = await query.limit(20);
  if (error) throw new Error(error.message);

  const conflict = (data ?? []).find(
    (row) => normalizeEpfNo(employeeStoredEpfNo(row)) === norm,
  );

  if (conflict) {
    throw new Error(
      `EPF number is already in use by ${conflict.full_name as string}. EPF numbers are never reused — assign a new number.`,
    );
  }
}

export function assertEpfDiffersFromPrevious(
  epfNo: unknown,
  previousEpfNo: unknown,
): void {
  const epf = normalizeEpfNo(epfNo);
  const prev = normalizeEpfNo(previousEpfNo);
  if (epf && prev && epf === prev) {
    throw new Error(
      'New EPF number must differ from the previous EPF number. Rejoining staff receive a new EPF membership number.',
    );
  }
}
