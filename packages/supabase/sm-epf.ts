/** Pure SM EPF helpers — safe to import from client or server (no Supabase secrets). */

/** Treat blank / literal "null" SM values as unassigned. */
export function normalizeSmEpf(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null') return null;
  return s.toUpperCase();
}

/** All normalized alias keys on an employee row (order not significant). */
export function collectSmEpfAliasKeys(row: {
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string[] {
  const keys = new Set<string>();
  for (const field of [row.emp_number, row.epf_no, row.epf_num != null ? String(row.epf_num) : '']) {
    const key = normalizeSmEpf(field);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * Keys used to join `sm_visit_logs.sm_epf` to an employee.
 * Order: portal auth → epf_no → epf_num → emp_number (matches MD/SM portal canonical chain).
 */
export function smVisitLookupKeys(
  row: {
    emp_number?: string | null;
    epf_no?: string | null;
    epf_num?: string | number | null;
  },
  portalAuthEpf?: string | null,
): string[] {
  const keys = new Set<string>();
  const portal = normalizeSmEpf(portalAuthEpf);
  if (portal) keys.add(portal);
  for (const alias of collectSmEpfAliasKeys(row)) {
    keys.add(alias);
  }
  const canonical = sectorManagerEpfKey(row);
  if (canonical) keys.add(canonical);
  return [...keys];
}

/** Canonical SM key stored on site_profiles.assigned_sm_epf */
export function sectorManagerEpfKey(row: {
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
}): string | null {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  return epf ? epf.toUpperCase() : null;
}
