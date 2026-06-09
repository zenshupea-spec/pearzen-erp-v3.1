'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  lookupFmRetentionSnapshot,
  lookupFmUnsettledBalances,
  type UnsettledBalanceLine,
} from '../../../lib/employee-clearance-ledger';
import {
  calculateSalaryRelease,
  DEFAULT_PREV_MONTH_SHIFT_THRESHOLD,
  DEFAULT_SALARY_MONTH_SHIFT_THRESHOLD,
  salaryReleaseLabel,
  salaryReleaseReason,
  type SalaryReleaseAction,
} from '../../../lib/salary-retention';
import {
  computeClearanceSettlement,
  evaluateHrResignationGate,
  type ClearanceSettlement,
  type HrResignationGate,
} from '../../../lib/clearance-settlement';
import { calculateGratuityProvision, type GratuityCalculation } from '../../../../../packages/gratuity';
import { getGratuitySettings } from '../../executive/settings/gratuity-actions';
import { auditStaffAction } from '../../../lib/staff-audit';
import { getRankPayMatrix } from '../../executive/settings/rank-matrix-actions';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access';
import type {
  ClearanceShiftRow,
  EmployeeClearanceSnapshot,
} from './clearance-types';

async function requireHrRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  return { supabase, userId: user.id };
}

function monthRange(offsetMonths: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  return {
    start,
    end,
    startIso: start.toISOString().split('T')[0],
    endIso: end.toISOString().split('T')[0],
    label: start.toLocaleString('en-LK', { month: 'long', year: 'numeric' }),
  };
}

function shiftDateFromDeviceTime(iso: string): string {
  return iso.split('T')[0];
}

type ClearanceEmployeeRow = {
  emp_number?: string | null;
  epf_no?: string | number | null;
  /** Live schema column until `epf_no` migration is applied */
  epf_num?: string | number | null;
  base_salary?: number | null;
  basic_salary?: number | null;
  site?: string | null;
};

function employeeEmpKey(emp: ClearanceEmployeeRow): string | null {
  if (emp.emp_number) return String(emp.emp_number);
  const epf = emp.epf_no ?? emp.epf_num;
  if (epf != null) return String(epf);
  return null;
}

function employeeBaseSalary(emp: ClearanceEmployeeRow): number | null {
  const raw = emp.base_salary ?? emp.basic_salary;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function missingColumn(err: { message: string } | null, col: string): boolean {
  const msg = err?.message ?? '';
  return msg.includes(col) && msg.includes('does not exist');
}

async function fetchShiftRowsForEmployee(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  emp: ClearanceEmployeeRow & { id: string },
  range: { startIso: string; endIso: string },
): Promise<ClearanceShiftRow[]> {
  const epf = employeeEmpKey(emp);
  const fallbackSite = emp.site || '—';
  const byDate = new Map<string, ClearanceShiftRow>();

  const add = (date: string, site: string, source: ClearanceShiftRow['source']) => {
    const existing = byDate.get(date);
    if (!existing) {
      byDate.set(date, { date, site: site || fallbackSite, source });
      return;
    }
    if (existing.site === '—' && site && site !== '—') {
      byDate.set(date, { ...existing, site });
    }
  };

  if (epf) {
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('device_time')
      .eq('emp_number', epf)
      .eq('action_type', 'CHECK_IN')
      .gte('device_time', `${range.startIso}T00:00:00`)
      .lte('device_time', `${range.endIso}T23:59:59`);

    for (const row of logs ?? []) {
      if (row.device_time) add(shiftDateFromDeviceTime(row.device_time), fallbackSite, 'attendance');
    }

    const { data: smRows } = await supabase
      .from('sm_guard_attendance')
      .select('shift_date, site_name')
      .eq('guard_epf', epf)
      .gte('shift_date', range.startIso)
      .lte('shift_date', range.endIso)
      .neq('status', 'CANCELLED');

    for (const row of smRows ?? []) {
      if (row.shift_date) {
        add(String(row.shift_date), row.site_name || fallbackSite, 'sm_portal');
      }
    }
  }

  const { data: timeShifts } = await supabase
    .from('time_shifts')
    .select('shift_date, site_id')
    .eq('employee_id', emp.id)
    .gte('shift_date', range.startIso)
    .lte('shift_date', range.endIso);

  for (const row of timeShifts ?? []) {
    if (row.shift_date) add(String(row.shift_date), fallbackSite, 'time_engine');
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function maxIsoDate(...candidates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const raw of candidates) {
    if (!raw) continue;
    const d = String(raw).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

async function fetchLastDateWorked(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  emp: ClearanceEmployeeRow & { id: string },
): Promise<string | null> {
  const epf = employeeEmpKey(emp);
  const dates: (string | null | undefined)[] = [];

  if (epf) {
    const { data: lastCheckIn } = await supabase
      .from('attendance_logs')
      .select('device_time')
      .eq('emp_number', epf)
      .eq('action_type', 'CHECK_IN')
      .order('device_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCheckIn?.device_time) {
      dates.push(shiftDateFromDeviceTime(lastCheckIn.device_time));
    }

    const { data: lastSm } = await supabase
      .from('sm_guard_attendance')
      .select('shift_date')
      .eq('guard_epf', epf)
      .neq('status', 'CANCELLED')
      .order('shift_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSm?.shift_date) dates.push(String(lastSm.shift_date));
  }

  const { data: lastTime } = await supabase
    .from('time_shifts')
    .select('shift_date')
    .eq('employee_id', emp.id)
    .order('shift_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTime?.shift_date) dates.push(String(lastTime.shift_date));

  return maxIsoDate(...dates);
}

export async function getEmployeeClearance(
  employeeId: string,
): Promise<EmployeeClearanceSnapshot> {
  const supabase = await createSupabaseServerClient();

  const selectAttempts = [
    'id, full_name, emp_number, epf_num, rank, basic_salary, date_joined, status, fm_offboarding_payment_confirmed_at, hr_offboarding_sent_to_fm_at',
    'id, full_name, emp_number, epf_num, rank, basic_salary, date_joined, status',
    'id, full_name, emp_number, epf_num, rank, basic_salary, date_joined',
    'id, full_name, emp_number, epf_num, rank, basic_salary',
    'id, full_name, emp_number, epf_num, rank',
  ];

  let emp: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  for (const cols of selectAttempts) {
    const res = await supabase
      .from('employees')
      .select(cols)
      .eq('id', employeeId)
      .maybeSingle();
    emp = res.data as Record<string, unknown> | null;
    error = res.error;
    if (!error) break;
    if (!missingColumn(error, 'group') && !missingColumn(error, 'date_joined') &&
        !error.message.includes('hr_offboarding') && !error.message.includes('fm_offboarding')) {
      break;
    }
  }

  if (error) throw new Error(error.message);
  if (!emp) throw new Error('Employee not found');

  const prevRange = monthRange(-1);
  const currRange = monthRange(0);
  const empNo = employeeEmpKey(emp);

  const [lastMonthShifts, currMonthShifts, lastDateWorked, rankMatrix, gratuitySettings] =
    await Promise.all([
      fetchShiftRowsForEmployee(supabase, emp, prevRange),
      fetchShiftRowsForEmployee(supabase, emp, currRange),
      fetchLastDateWorked(supabase, emp),
      getRankPayMatrix(),
      getGratuitySettings(),
    ]);

  const thresholds = {
    prevMonthMinShifts: DEFAULT_PREV_MONTH_SHIFT_THRESHOLD,
    salaryMonthMinShifts: DEFAULT_SALARY_MONTH_SHIFT_THRESHOLD,
  };

  let prevCount = lastMonthShifts.length;
  let currCount = currMonthShifts.length;

  const fmRetention = lookupFmRetentionSnapshot(empNo, emp.full_name);
  if (fmRetention?.prevMonthShifts != null) prevCount = fmRetention.prevMonthShifts;
  if (fmRetention?.currMonthShifts != null) currCount = fmRetention.currMonthShifts;

  const retentionStatus = calculateSalaryRelease(
    prevCount,
    currCount,
    thresholds.prevMonthMinShifts,
    thresholds.salaryMonthMinShifts,
  );

  const siteCounts = new Map<string, number>();
  for (const s of lastMonthShifts) {
    if (s.site && s.site !== '—') {
      siteCounts.set(s.site, (siteCounts.get(s.site) ?? 0) + 1);
    }
  }
  let primarySiteLastMonth: string | null = emp.site ?? null;
  if (siteCounts.size > 0) {
    primarySiteLastMonth = [...siteCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  let totalGrossLastMonthLkr: number | null = fmRetention?.totalGrossLkr ?? null;
  let totalDeductionsLastMonthLkr: number | null = fmRetention?.totalDeductionsLkr ?? null;
  let netTakeHomeLastMonthLkr: number | null = fmRetention?.netTakeHomeLkr ?? null;

  const baseSalary = employeeBaseSalary(emp);
  if (totalGrossLastMonthLkr == null && baseSalary && prevCount > 0) {
    const daily = baseSalary / 30;
    totalGrossLastMonthLkr = Math.round(daily * prevCount);
    totalDeductionsLastMonthLkr = 0;
    netTakeHomeLastMonthLkr = totalGrossLastMonthLkr;
  }

  const unsettledBalances: UnsettledBalanceLine[] = [
    ...lookupFmUnsettledBalances(empNo, emp.full_name),
  ];

  try {
    if (empNo) {
      const { data: advances } = await supabase
        .from('salary_advances')
        .select('amount, status')
        .eq('emp_number', empNo)
        .eq('status', 'APPROVED');

      const advanceTotal = (advances ?? []).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0,
      );
      if (advanceTotal > 0) {
        const existing = unsettledBalances.find((l) => l.type === 'advance');
        if (existing) {
          existing.amountLkr = Math.max(existing.amountLkr, advanceTotal);
          existing.source = 'database';
        } else {
          unsettledBalances.push({
            type: 'advance',
            label: 'Salary advance',
            amountLkr: advanceTotal,
            detail: 'Approved — pending recovery',
            source: 'database',
          });
        }
      }
    }

    const { data: payrollDeductions } = await supabase
      .from('payroll_deductions')
      .select('amount, category, reason')
      .eq('guard_id', employeeId);

    for (const row of payrollDeductions ?? []) {
      const amount = Number(row.amount || 0);
      if (amount <= 0) continue;
      const cat = String(row.category || 'OTHER').toLowerCase();
      const type =
        cat.includes('uniform')
          ? 'uniform'
          : cat.includes('meal')
            ? 'meals'
            : cat.includes('discipl')
              ? 'penalty'
              : 'other';
      unsettledBalances.push({
        type,
        label: String(row.category || 'Deduction'),
        amountLkr: amount,
        detail: row.reason ?? undefined,
        source: 'database',
      });
    }
  } catch {
    // Tables may be absent in partial dev schemas — FM ledger still applies
  }

  const totalOwedToCompanyLkr = unsettledBalances.reduce((s, l) => s + l.amountLkr, 0);

  const asOfIso =
    lastDateWorked ?? new Date().toISOString().split('T')[0];
  const dateJoined =
    (emp as { date_joined?: string | null }).date_joined ?? null;

  const gratuity = calculateGratuityProvision({
    settings: gratuitySettings,
    rankMatrix,
    rank: emp.rank ?? null,
    corporateGroup: (emp as { group?: string | null }).group ?? null,
    dateJoinedIso: dateJoined,
    asOfIso,
    recordedMonthlyBasicLkr: baseSalary,
  });

  const settlement = computeClearanceSettlement(
    netTakeHomeLastMonthLkr,
    totalOwedToCompanyLkr,
    gratuity.amountLkr,
  );
  const fmOffboardingPaymentConfirmed = Boolean(
    (emp as { fm_offboarding_payment_confirmed_at?: string | null })
      .fm_offboarding_payment_confirmed_at,
  );
  const fmOffboardingPaymentConfirmedAt =
    (emp as { fm_offboarding_payment_confirmed_at?: string | null })
      .fm_offboarding_payment_confirmed_at ?? null;
  const hrOffboardingSentToFmAt =
    (emp as { hr_offboarding_sent_to_fm_at?: string | null }).hr_offboarding_sent_to_fm_at ??
    null;
  const hrOffboardingSentToFm = Boolean(hrOffboardingSentToFmAt);
  const hrResignationGate = evaluateHrResignationGate({
    settlement,
    fmOffboardingPaymentConfirmed,
  });

  return {
    employeeId: emp.id,
    status: (emp as { status?: string | null }).status ?? null,
    fullName: emp.full_name ?? '—',
    empNo,
    rank: emp.rank ?? null,
    assignedSite: emp.site ?? null,
    lastDateWorked,
    lastMonthLabel: prevRange.label,
    lastMonthShiftCount: prevCount,
    lastMonthShifts,
    primarySiteLastMonth,
    totalGrossLastMonthLkr,
    totalDeductionsLastMonthLkr,
    netTakeHomeLastMonthLkr,
    currMonthLabel: currRange.label,
    currMonthShiftCount: currCount,
    retentionStatus,
    retentionLabel: salaryReleaseLabel(retentionStatus),
    retentionReason: salaryReleaseReason(
      retentionStatus,
      prevCount,
      currCount,
      thresholds,
    ),
    thresholds,
    unsettledBalances,
    totalOwedToCompanyLkr,
    settlement,
    hrResignationGate,
    fmOffboardingPaymentConfirmed,
    fmOffboardingPaymentConfirmedAt,
    hrOffboardingSentToFm,
    hrOffboardingSentToFmAt,
    gratuity,
  };
}

export async function sendOffboardingToFm(employeeId: string) {
  const { supabase, userId } = await requireHrRole();
  const snapshot = await getEmployeeClearance(employeeId);

  if ((snapshot.status || '').trim().toLowerCase() === 'resigned') {
    throw new Error('This employee is already resigned.');
  }

  if (snapshot.fmOffboardingPaymentConfirmed) {
    throw new Error('Finance has already confirmed final payment for this employee.');
  }

  if (snapshot.hrOffboardingSentToFm) {
    throw new Error('This case is already in the Finance offboarding queue.');
  }

  const { finalPayLkr, gratuityLkr, recoveryLkr } = snapshot.settlement;
  if (finalPayLkr <= 0 && gratuityLkr <= 0 && recoveryLkr <= 0) {
    throw new Error(
      'No final pay, gratuity, or recoveries on file — nothing to send to Finance.',
    );
  }

  if (snapshot.hrResignationGate.requiresDebtClearance) {
    throw new Error(snapshot.hrResignationGate.message);
  }

  const { error } = await supabase
    .from('employees')
    .update({
      hr_offboarding_sent_to_fm_at: new Date().toISOString(),
      hr_offboarding_sent_to_fm_by: userId,
    })
    .eq('id', employeeId);

  if (error?.message?.includes('hr_offboarding_sent_to_fm')) {
    throw new Error(
      'Offboarding queue is not available yet. Apply database migration 20260604230000_employees_hr_offboarding_sent_fm.sql.',
    );
  }
  if (error) throw new Error(error.message);

  await auditStaffAction({
    supabase,
    portal: 'hr',
    action: 'Send Offboarding to Finance',
    targetEntity: `Employee ${employeeId}`,
    details: {
      finalPayLkr: snapshot.settlement.finalPayLkr,
      gratuityLkr: snapshot.settlement.gratuityLkr,
      recoveryLkr: snapshot.settlement.recoveryLkr,
    },
  });

  revalidatePath('/hr/mnr');
  revalidatePath('/fm/offboarding');
}

export async function assertHrCanConfirmResignation(employeeId: string): Promise<void> {
  const snapshot = await getEmployeeClearance(employeeId);
  const payable =
    snapshot.settlement.finalPayLkr + snapshot.settlement.gratuityLkr;
  if (payable > 0 && !snapshot.hrOffboardingSentToFm) {
    throw new Error(
      'Send this employee to Finance → Offboarding settlements before confirming resignation.',
    );
  }
  if (!snapshot.hrResignationGate.ok) {
    throw new Error(snapshot.hrResignationGate.message);
  }
}
