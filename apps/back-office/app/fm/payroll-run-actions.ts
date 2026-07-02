'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchApprovedSmPenaltiesForPayrollMonth } from './lib/fm-sm-penalties';
import { guardGrossAfterPenaltyShiftOffset } from './lib/shift-adjustments';
import { computeSmGrossLkr } from './lib/sm-pay-settings';
import { fetchSmVisitCountsByEmployeeId } from './lib/sm-visit-lookup';
import { flatMonthGrossFromStandardDay } from '../../lib/compensation-engine';
import { calcCafeMemberGrossLkr } from '../../lib/cafe-payroll-cost';
import { getCafePayrollCostForPeriod } from '../executive/cafe/actions';
import { completedYearsOfService } from '../../../../packages/gratuity';
import { adjustedMonthlyBasicFromRank } from '../../../../packages/rank-pay-matrix';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { getMdEngineConstants } from '../executive/settings/engine-constants-actions';
import { getPayrollComplianceSettings, getPayrollStatutorySettings, getPayrollWorkingDaysSettings } from '../executive/settings/actions';
import { applyFmPayrollCompliance } from './lib/fm-payroll-compliance';
import {
  computeEmployeePayrollStatutory,
  type PayrollStatutoryRates,
} from '../../../../packages/payroll-deductions';
import { computeGuardMonthGrossPay } from '../../lib/guard-site-pay';
import { fetchApprovedAttendanceShiftCountsForFm, fetchSmConfirmedShiftCountsForFm } from '../hq/deductions/lib/monthly-site-shifts';
import { auditStaffAction } from '../../lib/staff-audit';
import { normalizeCorporatePayrollGroup, resolveHoPayrollGrossLkr } from './lib/payroll-earnings-display';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { canAccessPathViaPortalRbac } from '../../../../packages/portal-rbac';
import {
  buildBatchId,
  canRegenerateRun,
  dbStatusToWorkflow,
  employeePayrollGroup,
  PAYROLL_GROUP_LABELS,
  type PayrollBatchStatusPayload,
  type PayrollGroupId,
  type PayrollGroupWorkflow,
  type PayrollRunDbStatus,
} from '../../lib/payroll-run-types';
import { payrollMonthFromFmPeriod } from '../../lib/deduction-month-lock-storage';
import { writePayrollRunWorkflowAudit } from '../../lib/payroll-run-audit';
import { getBankExportSettings } from '../executive/settings/bank-export-actions';
import { decryptEmployeePiiValue } from '../../lib/employee-pii';
import {
  assertPayrollBankExportAllowed,
  buildPayrollBankLine,
  employeeMatchesPayrollBankCohort,
  filterPayrollBankLinesForExport,
  generatePayrollBankFileContent,
  payrollBankFilename,
  payrollBankMimeType,
  type PayrollBankExportCohort,
} from '../../lib/payroll-bank-export';
import { GUARD_COHORT_META } from './lib/guard-payroll-cohorts';

const PAYROLL_PATHS = ['/fm', '/fm/batch', '/executive/payroll', '/executive/audit'] as const;

function revalidatePayrollPaths() {
  for (const path of PAYROLL_PATHS) revalidatePath(path);
}

function isMissingPayrollTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /payroll_runs|payslips/i.test(error.message ?? '');
}

function payrollStatutoryRatesFromSettings(
  settings: Awaited<ReturnType<typeof getPayrollStatutorySettings>>,
): PayrollStatutoryRates {
  return {
    epfEmployeeRate: settings.epfEmployeeRate,
    epfEmployerRate: settings.epfEmployerRate,
    etfRate: settings.etfRate,
    apitSlabs: settings.apitSlabs,
    stampDutyLkr: settings.stampDutyLkr,
    stampDutyThresholdLkr: settings.stampDutyThresholdLkr,
  };
}

async function fetchPayrollGuardShiftCounts(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  payrollMonth: string,
  guardEmployees: Array<{
    id: string;
    emp_number?: unknown;
    epf_no?: unknown;
    epf_num?: unknown;
  }>,
): Promise<Map<string, number>> {
  const [year, month] = payrollMonth.split('-').map(Number);
  const start = `${payrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const counts = new Map<string, number>();

  const { data: timeShifts } = await db
    .from('time_shifts')
    .select('employee_id, site_id')
    .eq('company_id', companyId)
    .eq('verification_status', 'VERIFIED')
    .gte('shift_date', start)
    .lte('shift_date', end);

  (timeShifts ?? []).forEach((row) => {
    const key = `${row.employee_id}:${row.site_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const guardRows = guardEmployees.map((emp) => ({
    id: String(emp.id),
    emp_number: emp.emp_number as string | null,
    epf_no: emp.epf_no as string | null,
    epf_num: emp.epf_num as string | number | null,
  }));

  const attendanceShiftCounts = await fetchApprovedAttendanceShiftCountsForFm(
    db,
    guardRows,
    `${payrollMonth}-01`,
    companyId,
  );
  attendanceShiftCounts.forEach((count, key) => {
    counts.set(key, (counts.get(key) ?? 0) + count);
  });

  const smRosterShiftCounts = await fetchSmConfirmedShiftCountsForFm(
    db,
    guardRows,
    `${payrollMonth}-01`,
    companyId,
  );
  smRosterShiftCounts.forEach((count, key) => {
    counts.set(key, (counts.get(key) ?? 0) + count);
  });

  return counts;
}

async function resolveFmCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return { supabase, companyId: rosterCompanyId(sessionCompanyId) };
}

function canPerformFmPayrollWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm', profile.portalRbac ?? undefined, {
      writeRequired: true,
    });
  }
  return false;
}

async function requireFmRole(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canPerformFmPayrollWrite(profile)) throw new Error('Forbidden');
  return user;
}

async function requireMdRole(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD') throw new Error('Forbidden');
  return user;
}

function defaultRuns(year: number, month: number): PayrollGroupWorkflow[] {
  return (['security', 'cafe'] as PayrollGroupId[]).map((groupId) => ({
    groupId,
    batchId: buildBatchId(year, month, groupId),
    status: 'DRAFT' as const,
  }));
}

function rowToWorkflow(row: Record<string, unknown>): PayrollGroupWorkflow {
  const groupId = row.group_id as PayrollGroupId;
  const dbStatus = row.status as PayrollRunDbStatus;
  return {
    groupId,
    batchId: String(row.batch_id),
    status: dbStatusToWorkflow(dbStatus),
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    payslipCount: Number(row.payslip_count ?? 0),
    grossTotal: Number(row.gross_total ?? 0),
    netTotal: Number(row.net_total ?? 0),
  };
}

export async function getPayrollBatchStatus(
  year: number,
  month: number,
): Promise<PayrollBatchStatusPayload> {
  const { companyId } = await resolveFmCompanyId();
  const defaults = defaultRuns(year, month);

  if (!companyId) {
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (isMissingPayrollTable(error)) {
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  if (error) {
    console.error('getPayrollBatchStatus:', error.message);
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  const runs = defaults.map((def) => {
    const row = (data ?? []).find((r) => r.group_id === def.groupId);
    return row ? rowToWorkflow(row as Record<string, unknown>) : def;
  });

  const generated = runs.some((r) => (r.payslipCount ?? 0) > 0);

  return { tableReady: true, periodYear: year, periodMonth: month, generated, runs };
}

export type GeneratePayrollResult = {
  success: boolean;
  count?: number;
  skipped?: number;
  skippedIds?: string[];
  skippedLabels?: string[];
  error?: string;
  blocked?: boolean;
  blockedGroups?: PayrollGroupId[];
};

export async function generateMonthEndPayrollForPeriod(
  year: number,
  month: number,
): Promise<GeneratePayrollResult> {
  try {
    const { supabase, companyId } = await resolveFmCompanyId();
    await requireFmRole(supabase);

    if (!companyId) {
      return { success: false, error: 'No company context for payroll generation.' };
    }

    const db = createSupabaseServiceClient();

  const { data: existingRuns, error: runsError } = await db
    .from('payroll_runs')
    .select('group_id, status')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (isMissingPayrollTable(runsError)) {
    return {
      success: false,
      error: 'Payroll tables not ready. Run: npm run db:apply-payroll-runs',
      blocked: true,
    };
  }

  const lockedGroups = new Set(
    (existingRuns ?? [])
      .filter((r) => !canRegenerateRun(r.status as PayrollRunDbStatus))
      .map((r) => r.group_id as PayrollGroupId),
  );

  if (lockedGroups.size === 2) {
    return {
      success: false,
      blocked: true,
      blockedGroups: [...lockedGroups],
      error: `Payroll for ${year}-${String(month).padStart(2, '0')} is fully submitted or approved. Re-edit batches from the batch desk to regenerate.`,
    };
  }

  let query = db.from('employees').select('*').ilike('status', 'active');
  query = query.eq('company_id', companyId);

  const { data: employees, error: empError } = await query;
  if (empError) {
    return { success: false, error: empError.message };
  }

  const payrollMonth = `${year}-${String(month).padStart(2, '0')}`;
  const guardEmployees = (employees ?? []).filter(
    (emp) => employeePayrollGroup((emp as Record<string, unknown>).group) === 'security',
  );

  const [rankMatrix, engineConstants, payrollStatutory, workingDays, payrollCompliance, sitesResult, shiftCounts, cafePayroll] = await Promise.all([
    getRankPayMatrix(),
    getMdEngineConstants(),
    getPayrollStatutorySettings(),
    getPayrollWorkingDaysSettings(),
    getPayrollComplianceSettings(),
    db
      .from('site_profiles')
      .select('id, site_name, rate_matrix')
      .eq('company_id', companyId)
      .neq('site_status', 'ARCHIVED'),
    fetchPayrollGuardShiftCounts(db, companyId, payrollMonth, guardEmployees),
    getCafePayrollCostForPeriod(`${payrollMonth}-01`, companyId),
  ]);

  const cafeGrossByEmployee = new Map(
    cafePayroll.staff.map((member) => [member.id, calcCafeMemberGrossLkr(member)]),
  );

  const statutoryRates = payrollStatutoryRatesFromSettings(payrollStatutory);

  const smPenalties = await fetchApprovedSmPenaltiesForPayrollMonth(companyId, year, month);
  const penaltyAmountsByEmployee = new Map<string, number>();
  for (const penalty of smPenalties) {
    penaltyAmountsByEmployee.set(
      penalty.employeeId,
      (penaltyAmountsByEmployee.get(penalty.employeeId) ?? 0) + penalty.amountLkr,
    );
  }

  const smEmployeesForVisits = (employees ?? []).filter(
    (emp) => normalizeCorporatePayrollGroup((emp as Record<string, unknown>).group) === 'SECTOR_MANAGER',
  );
  const smVisitCounts = await fetchSmVisitCountsByEmployeeId(
    companyId,
    payrollMonth,
    smEmployeesForVisits.map((emp) => ({
      id: String(emp.id),
      emp_number: (emp as Record<string, unknown>).emp_number as string | null,
      epf_no: (emp as Record<string, unknown>).epf_no as string | null,
      epf_num: (emp as Record<string, unknown>).epf_num as string | number | null,
    })),
  );

  const payrollSites = (sitesResult.data ?? []).map((site) => ({
    id: String(site.id),
    site_name: String(site.site_name ?? ''),
    rate_matrix: site.rate_matrix,
  }));

  const periodEndIso = `${year}-${String(month).padStart(2, '0')}-28`;
  const runIds = new Map<PayrollGroupId, string>();
  const runTotals = new Map<PayrollGroupId, { count: number; gross: number; net: number }>();

  for (const groupId of ['security', 'cafe'] as PayrollGroupId[]) {
    if (lockedGroups.has(groupId)) continue;

    const batchId = buildBatchId(year, month, groupId);
    const { data: runRow, error: runError } = await db
      .from('payroll_runs')
      .upsert(
        {
          company_id: companyId,
          period_year: year,
          period_month: month,
          group_id: groupId,
          batch_id: batchId,
          status: 'DRAFT',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,period_year,period_month,group_id' },
      )
      .select('id')
      .single();

    if (runError) {
      return { success: false, error: runError.message };
    }
    runIds.set(groupId, runRow.id);
    runTotals.set(groupId, { count: 0, gross: 0, net: 0 });
  }

  let processedCount = 0;
  let skippedCount = 0;
  const skippedIds: string[] = [];
  const skippedLabels: string[] = [];
  const nowIso = new Date().toISOString();

  for (const emp of employees ?? []) {
    const row = emp as Record<string, unknown>;
    const groupId = employeePayrollGroup(row.group);
    if (lockedGroups.has(groupId)) continue;

    const runId = runIds.get(groupId);
    if (!runId) continue;

    if (Boolean(row.requires_md_approval)) {
      skippedCount += 1;
      skippedIds.push(String(emp.id));
      skippedLabels.push(
        row.emp_number != null
          ? String(row.emp_number)
          : row.full_name != null
            ? String(row.full_name)
            : String(emp.id),
      );

      const { error: voidError } = await db
        .from('payslips')
        .delete()
        .eq('company_id', companyId)
        .eq('profile_id', emp.id)
        .eq('period_year', year)
        .eq('period_month', month)
        .eq('status', 'DRAFT');

      if (voidError) {
        console.error(
          `Payslip void failed for ${row.emp_number ?? emp.id} (requires_md_approval):`,
          voidError.message,
        );
      }

      continue;
    }

    const rank = row.rank != null ? String(row.rank) : null;
    const years = completedYearsOfService(
      row.date_joined != null ? String(row.date_joined) : null,
      periodEndIso,
    );
    const recordedBasic =
      row.basic_salary != null
        ? Number(row.basic_salary)
        : row.base_salary != null
          ? Number(row.base_salary)
          : null;

    const rankMatrixBasic = adjustedMonthlyBasicFromRank(rankMatrix, rank, years, recordedBasic);
    const isHeadOffice = normalizeCorporatePayrollGroup(row.group) === 'HEAD_OFFICE';
    const isSectorManager = normalizeCorporatePayrollGroup(row.group) === 'SECTOR_MANAGER';
    const isGuard = groupId === 'security' && !isHeadOffice && !isSectorManager;
    const B = isHeadOffice
      ? resolveHoPayrollGrossLkr({
          basicSalary: row.basic_salary,
          baseSalary: row.base_salary,
          rankMatrixBasicLkr: rankMatrixBasic,
        })
      : rankMatrixBasic;
    const isCafe = groupId === 'cafe';
    const grossPay = isHeadOffice
      ? B
      : isSectorManager
        ? computeSmGrossLkr(
            smVisitCounts.get(String(emp.id)) ?? 0,
            engineConstants.smPayMode,
            engineConstants.smPerVisitBonus,
            engineConstants.smFixedBasic,
          ).totalGrossLkr
      : isGuard
        ? computeGuardMonthGrossPay({
            homeSiteName: row.site != null ? String(row.site) : null,
            rank,
            dateJoined: row.date_joined != null ? String(row.date_joined) : null,
            rankMatrix,
            periodEndIso,
            recordedBasic,
            sites: payrollSites,
            shiftCounts,
            employeeId: String(emp.id),
            flags: {
              enforceFlatSiteRate: engineConstants.enforceFlatSiteRate,
              allowPoyaOnFlatRate: engineConstants.allowPoyaOnFlatRate,
            },
            dayDivisors: {
              wbWorkingDays: workingDays.wbWorkingDays,
              wbHours: workingDays.wbHours,
            },
            soWorkingDays: workingDays.soWorkingDays,
          })
        : isCafe
          ? (cafeGrossByEmployee.get(String(emp.id)) ?? 0)
          : flatMonthGrossFromStandardDay(B, workingDays);

    const { data: advances } = await db
      .from('salary_advances')
      .select('amount')
      .eq('company_id', companyId)
      .eq('profile_id', emp.id)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('status', 'APPROVED');

    const totalAdvances = advances?.reduce((sum, adv) => sum + Number(adv.amount), 0) || 0;
    const totalPenalties = penaltyAmountsByEmployee.get(String(emp.id)) ?? 0;
    let adjustedGrossPay = grossPay;
    if (isGuard && totalPenalties > 0) {
      const guardShiftTotal = payrollSites.reduce(
        (sum, site) => sum + (shiftCounts.get(`${emp.id}:${site.id}`) ?? 0),
        0,
      );
      adjustedGrossPay = guardGrossAfterPenaltyShiftOffset(
        grossPay,
        guardShiftTotal,
        totalPenalties,
      ).grossPay;
    }
    const statutory = computeEmployeePayrollStatutory(adjustedGrossPay, statutoryRates);
    const complianceResult = applyFmPayrollCompliance({
      grossPay: adjustedGrossPay,
      basicSalary: B,
      statutoryDeductions: statutory.epfEmployee + statutory.apit + statutory.stampDuty,
      voluntaryDeductions: totalAdvances,
      compliance: payrollCompliance,
    });
    const netPay = complianceResult.netPay;

    const { error: upsertError } = await db.from('payslips').upsert(
      {
        profile_id: emp.id,
        company_id: emp.company_id ?? companyId,
        payroll_run_id: runId,
        period_month: month,
        period_year: year,
        adjusted_basic: B,
        gross_pay: adjustedGrossPay,
        net_pay: netPay,
        epf_employee: statutory.epfEmployee,
        epf_employer: statutory.epfEmployer,
        etf: statutory.etfEmployer,
        status: 'DRAFT',
        updated_at: nowIso,
      },
      { onConflict: 'profile_id,company_id,period_year,period_month' },
    );

    if (upsertError) {
      console.error(`Payslip upsert failed for ${row.emp_number ?? emp.id}:`, upsertError.message);
      continue;
    }

    processedCount++;
    const totals = runTotals.get(groupId)!;
    totals.count += 1;
    totals.gross += adjustedGrossPay;
    totals.net += netPay;
    runTotals.set(groupId, totals);
  }

  for (const [groupId, totals] of runTotals) {
    const runId = runIds.get(groupId);
    if (!runId) continue;
    await db
      .from('payroll_runs')
      .update({
        payslip_count: totals.count,
        gross_total: Number(totals.gross.toFixed(2)),
        net_total: Number(totals.net.toFixed(2)),
        updated_at: nowIso,
      })
      .eq('id', runId);
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Generate Month-End Payroll',
    targetEntity: `${year}-${String(month).padStart(2, '0')}`,
    details: { month, year, processedCount, skippedCount, skippedIds },
  });

    revalidatePayrollPaths();
    return {
      success: true,
      count: processedCount,
      skipped: skippedCount,
      skippedIds,
      skippedLabels,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Payroll generation failed',
    };
  }
}

async function updateRunStatus(
  groupId: PayrollGroupId,
  year: number,
  month: number,
  nextStatus: PayrollRunDbStatus,
  actorField: 'submitted_by' | 'approved_by' | 'paid_by',
  timestampField: 'submitted_at' | 'approved_at' | 'paid_at',
  actorId: string,
) {
  const { companyId } = await resolveFmCompanyId();
  if (!companyId) throw new Error('No company context');

  const db = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data: run, error: fetchError } = await db
    .from('payroll_runs')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!run) throw new Error('Payroll run not found. Generate payroll first.');

  const { error: runError } = await db
    .from('payroll_runs')
    .update({
      status: nextStatus,
      [actorField]: actorId,
      [timestampField]: nowIso,
      updated_at: nowIso,
    })
    .eq('id', run.id);

  if (runError) throw new Error(runError.message);

  const payslipStatus =
    nextStatus === 'DRAFT'
      ? 'DRAFT'
      : nextStatus === 'SUBMITTED'
        ? 'SUBMITTED'
        : nextStatus === 'APPROVED' || nextStatus === 'PAID'
          ? 'APPROVED'
          : 'DRAFT';

  await db
    .from('payslips')
    .update({ status: payslipStatus, updated_at: nowIso })
    .eq('payroll_run_id', run.id);

  revalidatePayrollPaths();
}

export async function submitPayrollGroupForReview(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    const user = await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('id, status, payslip_count')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Generate payroll before submitting for MD review.' };
    if (run.status !== 'DRAFT') {
      return { success: false, error: 'This batch is already submitted or approved.' };
    }
    if ((run.payslip_count ?? 0) === 0) {
      return { success: false, error: 'No payslips in this batch. Generate payroll first.' };
    }

    const engine = await getMdEngineConstants();
    if (engine.requireDeductionMonthLock) {
      const payrollMonth = payrollMonthFromFmPeriod({ year, month });
      const { data: deductionLock, error: lockError } = await db
        .from('payroll_deduction_month_locks')
        .select('id')
        .eq('company_id', companyId!)
        .eq('payroll_month', payrollMonth)
        .maybeSingle();

      if (lockError && lockError.code !== '42P01') {
        return { success: false, error: lockError.message };
      }
      if (!deductionLock) {
        return {
          success: false,
          error:
            'Deductions pending admin lock — wait for Deductions Admin to lock the month and send to FM.',
        };
      }
    }

    await updateRunStatus(groupId, year, month, 'SUBMITTED', 'submitted_by', 'submitted_at', user.id);

    const audit = await writePayrollRunWorkflowAudit(
      supabase,
      companyId!,
      groupId,
      year,
      month,
      'SUBMIT_PAYROLL_BATCH',
    );
    if (!audit.ok) return { success: false, error: audit.error };

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Submit failed' };
  }
}

export async function revertPayrollGroupToDraft(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Payroll run not found.' };
    if (run.status === 'APPROVED') {
      return {
        success: false,
        error: 'MD-approved batches can only be unlocked by the Managing Director.',
      };
    }
    if (run.status === 'PAID') {
      return { success: false, error: 'Cannot re-edit a batch that has been marked as paid.' };
    }

    const nowIso = new Date().toISOString();
    const { data: runRow } = await db
      .from('payroll_runs')
      .select('id')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .single();

    if (runRow) {
      await db
        .from('payroll_runs')
        .update({
          status: 'DRAFT',
          submitted_at: null,
          submitted_by: null,
          approved_at: null,
          approved_by: null,
          paid_at: null,
          paid_by: null,
          updated_at: nowIso,
        })
        .eq('id', runRow.id);

      await db
        .from('payslips')
        .update({ status: 'DRAFT', updated_at: nowIso })
        .eq('payroll_run_id', runRow.id);
    }

    const audit = await writePayrollRunWorkflowAudit(
      supabase,
      companyId!,
      groupId,
      year,
      month,
      'REVERT_PAYROLL_BATCH',
    );
    if (!audit.ok) return { success: false, error: audit.error };

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Revert failed' };
  }
}

export async function approvePayrollGroupRun(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireMdRole(supabase);
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Batch not found on MD desk.' };
    if (run.status !== 'SUBMITTED') {
      return { success: false, error: 'Only submitted batches can be approved.' };
    }

    await updateRunStatus(groupId, year, month, 'APPROVED', 'approved_by', 'approved_at', user.id);

    const audit = await writePayrollRunWorkflowAudit(
      supabase,
      companyId,
      groupId,
      year,
      month,
      'APPROVE_PAYROLL_BATCH',
    );
    if (!audit.ok) return { success: false, error: audit.error };

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Approval failed' };
  }
}

export async function markPayrollGroupPaid(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    const user = await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Payroll run not found.' };
    if (run.status === 'PAID') {
      return { success: true };
    }
    if (run.status !== 'APPROVED') {
      return { success: false, error: 'Only MD-approved batches can be marked as paid.' };
    }

    await updateRunStatus(groupId, year, month, 'PAID', 'paid_by', 'paid_at', user.id);

    const audit = await writePayrollRunWorkflowAudit(
      supabase,
      companyId!,
      groupId,
      year,
      month,
      'MARK_PAYROLL_BATCH_PAID',
    );
    if (!audit.ok) return { success: false, error: audit.error };

    const { data: paidRun } = await db
      .from('payroll_runs')
      .select('id')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .single();

    if (paidRun) {
      await db
        .from('payslips')
        .update({ status: 'PAID', updated_at: new Date().toISOString() })
        .eq('payroll_run_id', paidRun.id);
    }

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Mark paid failed' };
  }
}

const COHORT_GROUP_LABELS: Partial<Record<PayrollBankExportCohort, string>> = {
  guard_commercial: GUARD_COHORT_META.guard_commercial.name,
  guard_other_bank: GUARD_COHORT_META.guard_other_bank.name,
  ho: 'Head Office',
  sm: 'Sector Managers',
  cafe: PAYROLL_GROUP_LABELS.cafe,
};

async function requireFmOrMdPayrollRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role === 'MD' || role === 'OD') return user;
  if (canPerformFmPayrollWrite(profile)) return user;
  throw new Error('Forbidden');
}

export type DownloadPayrollBankFileResult = {
  success: boolean;
  content?: string;
  filename?: string;
  mimeType?: string;
  error?: string;
};

export async function downloadPayrollBankFile(
  groupId: PayrollGroupId,
  year: number,
  month: number,
  cohort?: PayrollBankExportCohort | null,
): Promise<DownloadPayrollBankFileResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireFmOrMdPayrollRole(supabase);

    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: run, error: runError } = await db
      .from('payroll_runs')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (runError) return { success: false, error: runError.message };
    if (!run) return { success: false, error: 'Payroll run not found.' };

    try {
      assertPayrollBankExportAllowed(run.status as PayrollRunDbStatus);
    } catch (gateError) {
      return {
        success: false,
        error: gateError instanceof Error ? gateError.message : 'Export not allowed.',
      };
    }

    const { data: payslips, error: slipError } = await db
      .from('payslips')
      .select('profile_id, net_pay')
      .eq('payroll_run_id', run.id);

    if (slipError) return { success: false, error: slipError.message };
    if (!payslips?.length) {
      return { success: false, error: 'No payslips in this batch.' };
    }

    const profileIds = payslips.map((slip) => slip.profile_id);
    const { data: employees, error: empError } = await db
      .from('employees')
      .select('id, emp_number, full_name, bank_name, account_number, group')
      .in('id', profileIds);

    if (empError) return { success: false, error: empError.message };

    const netByProfile = new Map(
      payslips.map((slip) => [slip.profile_id, Number(slip.net_pay ?? 0)]),
    );

    const rawLines = (employees ?? [])
      .filter((emp) => employeeMatchesPayrollBankCohort(emp, cohort ?? null))
      .map((emp) =>
        buildPayrollBankLine({
          empNo:
            emp.emp_number != null
              ? String(emp.emp_number)
              : String(emp.id).slice(0, 8).toUpperCase(),
          fullName: emp.full_name != null ? String(emp.full_name) : 'Unknown',
          bankName: emp.bank_name != null ? String(emp.bank_name) : null,
          accountNumber: decryptEmployeePiiValue(emp.account_number),
          netPay: netByProfile.get(emp.id) ?? 0,
        }),
      )
      .filter((line): line is NonNullable<typeof line> => line != null);

    const bankSettings = await getBankExportSettings();
    const otherBank = cohort === 'guard_other_bank';
    const formatId = otherBank ? 'commercial_txt' : bankSettings.masterFormatId;

    const lines = filterPayrollBankLinesForExport(rawLines, {
      cohort: cohort ?? null,
      groupId,
      isolateExternalBank: bankSettings.isolateExternalBank,
      otherBank,
    });

    if (!lines.length) {
      return { success: false, error: 'No bank-exportable payslips for this selection.' };
    }

    const groupLabel =
      (cohort ? COHORT_GROUP_LABELS[cohort] : undefined) ?? PAYROLL_GROUP_LABELS[groupId];
    const periodSlug = `${year}${String(month).padStart(2, '0')}`;
    const content = generatePayrollBankFileContent({
      groupLabel,
      periodSlug,
      formatId,
      lines,
      otherBank,
    });
    const filename = payrollBankFilename(groupLabel, periodSlug, formatId, otherBank);
    const mimeType = payrollBankMimeType(formatId, otherBank);

    return { success: true, content, filename, mimeType };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Bank file generation failed',
    };
  }
}
