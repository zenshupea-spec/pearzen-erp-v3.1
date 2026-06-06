import type { SupabaseClient } from '@supabase/supabase-js';
import { payrollMonthDateRange } from './payroll-month';

export type GuardEmpRow = {
  id: string;
  emp_number: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
};

export type MonthlySiteShiftRollup = {
  /** siteKey (lowercase trimmed name) → employeeId → deduped shift slot count */
  shiftCountBySite: Map<string, Map<string, number>>;
  /** siteKey → display label */
  siteNameByKey: Map<string, string>;
};

function siteKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

export function guardEpfKeys(emp: GuardEmpRow): string[] {
  const keys = new Set<string>();
  if (emp.emp_number) keys.add(String(emp.emp_number).trim());
  if (emp.epf_no) keys.add(String(emp.epf_no).trim());
  if (emp.epf_num != null) keys.add(String(emp.epf_num).trim());
  return [...keys].filter(Boolean);
}

function parseSiteNameFromRelation(
  sp: { site_name?: string } | { site_name?: string }[] | null,
): string | null {
  const row = Array.isArray(sp) ? sp[0] : sp;
  const name = row?.site_name?.trim();
  return name || null;
}

type ShiftAccumulator = Map<string, Map<string, Set<string>>>;

function recordShiftSlot(
  acc: ShiftAccumulator,
  siteName: string,
  employeeId: string,
  slotKey: string,
  siteNameByKey: Map<string, string>,
) {
  const trimmed = siteName.trim();
  if (!trimmed) return;
  const siteKey = siteKeyFromName(trimmed);
  if (!siteNameByKey.has(siteKey)) siteNameByKey.set(siteKey, trimmed);

  let byEmployee = acc.get(siteKey);
  if (!byEmployee) {
    byEmployee = new Map();
    acc.set(siteKey, byEmployee);
  }
  let slots = byEmployee.get(employeeId);
  if (!slots) {
    slots = new Set();
    byEmployee.set(employeeId, slots);
  }
  slots.add(slotKey);
}

function rollupFromAccumulator(acc: ShiftAccumulator): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [siteKey, byEmployee] of acc) {
    const counts = new Map<string, number>();
    for (const [employeeId, slots] of byEmployee) {
      counts.set(employeeId, slots.size);
    }
    out.set(siteKey, counts);
  }
  return out;
}

export async function fetchMonthlySiteShiftRollup(
  supabase: SupabaseClient,
  guards: GuardEmpRow[],
  payrollMonthIso: string,
  companyId: string | null,
): Promise<MonthlySiteShiftRollup> {
  const { start, end } = payrollMonthDateRange(payrollMonthIso);
  const epfToEmployeeId = new Map<string, string>();
  const employeeIds = guards.map((g) => g.id);
  const employeeIdSet = new Set(employeeIds);

  for (const emp of guards) {
    for (const epf of guardEpfKeys(emp)) {
      epfToEmployeeId.set(epf, emp.id);
    }
  }

  const acc: ShiftAccumulator = new Map();
  const siteNameByKey = new Map<string, string>();

  const epfList = [...epfToEmployeeId.keys()];
  if (epfList.length > 0) {
    const { data: smRows, error: smError } = await supabase
      .from('sm_guard_attendance')
      .select('guard_epf, site_name, shift_date, shift_type')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .neq('status', 'CANCELLED')
      .in('guard_epf', epfList);

    if (smError) {
      console.error('❌ Deductions (sm_guard_attendance):', smError.message);
    } else {
      for (const row of smRows ?? []) {
        const employeeId = epfToEmployeeId.get(String(row.guard_epf ?? '').trim());
        if (!employeeId || !row.shift_date || !row.site_name) continue;
        const slotKey = `${row.shift_date}|${row.shift_type ?? 'DAY'}`;
        recordShiftSlot(acc, String(row.site_name), employeeId, slotKey, siteNameByKey);
      }
    }
  }

  if (employeeIds.length > 0) {
    let rosterQuery = supabase
      .from('time_rosters')
      .select('employee_id, shift_date, site_profiles ( site_name )')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .eq('status', 'ACTIVE')
      .in('employee_id', employeeIds);

    if (companyId) rosterQuery = rosterQuery.eq('company_id', companyId);

    const { data: rosterRows, error: rosterError } = await rosterQuery;
    if (rosterError) {
      console.error('❌ Deductions (time_rosters):', rosterError.message);
    } else {
      for (const row of rosterRows ?? []) {
        const employeeId = String(row.employee_id ?? '');
        if (!employeeIdSet.has(employeeId) || !row.shift_date) continue;
        const siteName = parseSiteNameFromRelation(
          row.site_profiles as { site_name?: string } | { site_name?: string }[] | null,
        );
        if (!siteName) continue;
        recordShiftSlot(acc, siteName, employeeId, String(row.shift_date), siteNameByKey);
      }
    }

    let shiftQuery = supabase
      .from('time_shifts')
      .select('employee_id, shift_date, site_profiles ( site_name )')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .in('employee_id', employeeIds);

    if (companyId) shiftQuery = shiftQuery.eq('company_id', companyId);

    const { data: shiftRows, error: shiftError } = await shiftQuery;
    if (shiftError) {
      console.error('❌ Deductions (time_shifts):', shiftError.message);
    } else {
      for (const row of shiftRows ?? []) {
        const employeeId = String(row.employee_id ?? '');
        if (!employeeIdSet.has(employeeId) || !row.shift_date) continue;
        const siteName = parseSiteNameFromRelation(
          row.site_profiles as { site_name?: string } | { site_name?: string }[] | null,
        );
        if (!siteName) continue;
        recordShiftSlot(acc, siteName, employeeId, String(row.shift_date), siteNameByKey);
      }
    }
  }

  return {
    shiftCountBySite: rollupFromAccumulator(acc),
    siteNameByKey,
  };
}

export function hasShiftRollupData(rollup: MonthlySiteShiftRollup): boolean {
  for (const counts of rollup.shiftCountBySite.values()) {
    if (counts.size > 0) return true;
  }
  return false;
}
