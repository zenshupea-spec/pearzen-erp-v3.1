'use server';

import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import { isMissingUniformVoStockTable } from '../../../../../packages/uniform-vo-stock';
import { resolveCompanyIdForSession } from '../../../lib/company-context';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  MEALS_DEDUCTIONS_LEDGER,
  UNIFORM_DEDUCTIONS_LEDGER,
} from '../../fm/lib/batch-deductions-ledger';
import {
  computeMonthMealCostByEmployee,
  siteFoodByKeyFromProfiles,
} from './lib/monthly-meal-cost';
import {
  fetchMonthlySiteShiftRollup,
  guardEpfKeys,
  hasShiftRollupData,
} from './lib/monthly-site-shifts';
import { payrollMonthFirstDay, payrollMonthLabel } from './lib/payroll-month';
import { uniformReorderMinQty } from './lib/uniform-stock';
import { DEFAULT_UNIFORM_CATALOG } from '../../../../../packages/uniform-catalog';
import type {
  MealSupplierMonthOwed,
  MealSupplierRow,
  SiteDeductionGroup,
  SiteMealAssignmentRow,
  UniformCourierItem,
  UniformCourierQueueOverview,
  UniformCourierQueueRow,
  UniformStockOverview,
  UniformStockItemRow,
  UniformSupplierRow,
  UniformVoHolderOption,
  UniformVoHolderRole,
  UniformVoStockRow,
} from './lib/types';
import { deductHqUniformWarehouseStock } from '../../../../../packages/uniform-hq-stock';
import { fetchUniformVoStockOnHand } from '../../../../../packages/uniform-vo-stock';

const DEDUCTIONS_BASE = '/hq/deductions';

function revalidateDeductions() {
  revalidatePath(DEDUCTIONS_BASE);
  revalidatePath(`${DEDUCTIONS_BASE}/site-suppliers`);
  revalidatePath(`${DEDUCTIONS_BASE}/suppliers`);
  revalidatePath(`${DEDUCTIONS_BASE}/uniform-suppliers`);
  revalidatePath(`${DEDUCTIONS_BASE}/uniform-issue`);
  revalidatePath(`${DEDUCTIONS_BASE}/uniform-courier`);
  revalidatePath(`${DEDUCTIONS_BASE}/issue-vo-stock`);
  revalidatePath('/fm/batch');
  revalidatePath('/fm');
}

export type DeductionMonthLockStatus = {
  payrollMonth: string;
  locked: boolean;
  lockedAt: string | null;
  draftEntryCount: number;
  isDemo: boolean;
  tableReady: boolean;
};

export async function getDeductionMonthLockStatus(
  payrollMonthInput?: string,
): Promise<DeductionMonthLockStatus> {
  const payrollMonth = payrollMonthFirstDay(payrollMonthInput?.slice(0, 7));
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let draftEntryCount = 0;
  if (companyId) {
    const { count, error: draftError } = await supabase
      .from('payroll_monthly_deduction_entries')
      .select('id', { count: 'exact', head: true })
      .eq('payroll_month', payrollMonth)
      .eq('company_id', companyId)
      .eq('status', 'DRAFT');

    if (!draftError) draftEntryCount = count ?? 0;
  }

  if (!companyId) {
    return {
      payrollMonth,
      locked: false,
      lockedAt: null,
      draftEntryCount,
      isDemo: true,
      tableReady: false,
    };
  }

  const { data: lockRow, error: lockError } = await supabase
    .from('payroll_deduction_month_locks')
    .select('locked_at')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth)
    .maybeSingle();

  if (lockError) {
    const missing = isMissingTableError(lockError.message);
    return {
      payrollMonth,
      locked: false,
      lockedAt: null,
      draftEntryCount,
      isDemo: missing,
      tableReady: !missing,
    };
  }

  return {
    payrollMonth,
    locked: Boolean(lockRow),
    lockedAt: lockRow?.locked_at ? String(lockRow.locked_at) : null,
    draftEntryCount,
    isDemo: false,
    tableReady: true,
  };
}

export async function lockDeductionMonthForFm(
  payrollMonthInput: string,
): Promise<{ success: boolean; error?: string; clientOnly?: boolean }> {
  const payrollMonth = payrollMonthFirstDay(payrollMonthInput.slice(0, 7));
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return { success: false, error: 'Company context required.', clientOnly: true };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('payroll_deduction_month_locks')
    .select('id')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'This payroll month is already locked and sent to FM.' };
  }

  const { error } = await supabase.from('payroll_deduction_month_locks').insert({
    company_id: companyId,
    payroll_month: payrollMonth,
    locked_by: user.id,
  });

  if (error) {
    if (isMissingTableError(error.message)) {
      return { success: true, clientOnly: true };
    }
    return { success: false, error: error.message };
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Lock Deduction Month',
    targetEntity: payrollMonth,
  });

  revalidateDeductions();
  return { success: true };
}

function parseUniformCourierItems(raw: unknown): UniformCourierItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const item = typeof row.item === 'string' ? row.item.trim() : '';
      const qty = Number(row.qty);
      if (!item || !Number.isFinite(qty) || qty < 1) return null;
      return { item, qty: Math.floor(qty) };
    })
    .filter((row): row is UniformCourierItem => row !== null);
}

function inferUniformCourierPortal(notes: string | null): UniformCourierQueueRow['portal'] {
  const n = notes ?? '';
  if (/\bHQ uniform\b/i.test(n)) return 'HQ';
  if (/\bTM uniform\b/i.test(n)) return 'TM';
  if (/\bOM uniform\b/i.test(n)) return 'OM';
  if (/^Uniform courier request:/i.test(n)) return 'SM';
  return 'Unknown';
}

function mapUniformCourierRow(row: Record<string, unknown>): UniformCourierQueueRow {
  const status = row.status as string;
  return {
    id: row.id as string,
    requestedAt: row.created_at as string,
    issuerEpf: String(row.sm_epf ?? '').toUpperCase(),
    portal: inferUniformCourierPortal((row.notes as string | null) ?? null),
    guardEpf: String(row.guard_epf ?? '').toUpperCase(),
    guardName: (row.guard_name as string | null) ?? null,
    items: parseUniformCourierItems(row.items),
    totalAmountLkr: row.total_amount != null ? Number(row.total_amount) : null,
    notes: (row.notes as string | null) ?? null,
    consentSelfieUrl: (row.consent_selfie_url as string | null) ?? null,
    status: status === 'DISPATCHED' ? 'DISPATCHED' : 'PENDING',
    dispatchedAt: (row.dispatched_at as string | null) ?? null,
    courierDispatchNotes: (row.courier_dispatch_notes as string | null) ?? null,
  };
}

function demoUniformCourierQueue(): UniformCourierQueueOverview {
  const pending: UniformCourierQueueRow[] = [
    {
      id: 'demo-courier-1',
      requestedAt: new Date().toISOString(),
      issuerEpf: 'SM042',
      portal: 'SM',
      guardEpf: 'G10042',
      guardName: 'Demo Guard Perera',
      items: [
        { item: 'Shirt (Short Sleeve)', qty: 1 },
        { item: 'Trousers', qty: 1 },
      ],
      totalAmountLkr: 6000,
      notes: 'Uniform courier request: 1× Shirt (Short Sleeve), 1× Trousers — LKR 6,000',
      consentSelfieUrl: null,
      status: 'PENDING',
      dispatchedAt: null,
      courierDispatchNotes: null,
    },
    {
      id: 'demo-courier-2',
      requestedAt: new Date(Date.now() - 86400000).toISOString(),
      issuerEpf: 'TM015',
      portal: 'TM',
      guardEpf: 'G20015',
      guardName: 'Demo Guard Silva',
      items: [{ item: 'Boots', qty: 1 }],
      totalAmountLkr: 6500,
      notes: 'TM uniform courier request: 1× Boots — LKR 6,500',
      consentSelfieUrl: null,
      status: 'PENDING',
      dispatchedAt: null,
      courierDispatchNotes: null,
    },
  ];
  return { pending, dispatched: [], isDemo: true };
}

export async function getUniformCourierQueue(): Promise<UniformCourierQueueOverview> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  const { data, error } = await supabase
    .from('sm_uniform_requests')
    .select(
      'id, sm_epf, guard_epf, guard_name, items, notes, total_amount, consent_selfie_url, status, created_at, dispatched_at, courier_dispatch_notes',
    )
    .eq('request_type', 'REQUEST_REPLACEMENT')
    .in('status', ['PENDING', 'DISPATCHED'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTableError(error.message)) {
      return demoUniformCourierQueue();
    }
    return { pending: [], dispatched: [], isDemo: false };
  }

  let rows = (data ?? []).map((row) => mapUniformCourierRow(row as Record<string, unknown>));

  if (companyId) {
    const { data: guards } = await supabase
      .from('employees')
      .select('emp_number')
      .eq('company_id', companyId);
    const companyGuardEpfs = new Set(
      (guards ?? []).map((g) => String(g.emp_number ?? '').trim().toUpperCase()).filter(Boolean),
    );
    if (companyGuardEpfs.size > 0) {
      rows = rows.filter((r) => companyGuardEpfs.has(r.guardEpf));
    }
  }

  const pending = rows.filter((r) => r.status === 'PENDING');
  const dispatched = rows.filter((r) => r.status === 'DISPATCHED');

  return { pending, dispatched, isDemo: false };
}

export async function markUniformCourierDispatched(input: {
  requestId: string;
  dispatchNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (input.requestId.startsWith('demo-')) {
    return { success: false, error: 'Preview mode — run migrations first.' };
  }

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseServiceClient();

  const { data: request, error: fetchErr } = await db
    .from('sm_uniform_requests')
    .select(
      'id, request_type, status, guard_epf, guard_name, items, notes, total_amount, sm_epf',
    )
    .eq('id', input.requestId)
    .maybeSingle();

  if (fetchErr || !request) {
    return { success: false, error: 'Courier request not found.' };
  }

  if (request.request_type !== 'REQUEST_REPLACEMENT') {
    return { success: false, error: 'Only courier replacement requests can be dispatched here.' };
  }

  if (request.status !== 'PENDING') {
    return { success: false, error: 'This request is no longer pending dispatch.' };
  }

  const items = parseUniformCourierItems(request.items);
  if (items.length === 0) {
    return { success: false, error: 'Request has no line items.' };
  }

  const stockResult = await deductHqUniformWarehouseStock(db, companyId, items);
  if ('error' in stockResult) {
    return { success: false, error: stockResult.error };
  }

  const now = new Date().toISOString();
  const dispatchNotes = input.dispatchNotes?.trim() || null;

  const { error: updateErr } = await db
    .from('sm_uniform_requests')
    .update({
      status: 'DISPATCHED',
      dispatched_at: now,
      dispatched_by: user?.id ?? null,
      courier_dispatch_notes: dispatchNotes,
    })
    .eq('id', input.requestId)
    .eq('status', 'PENDING');

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  const guardEpf = String(request.guard_epf ?? '').trim().toUpperCase();
  const totalAmount = Number(request.total_amount ?? 0);
  const notes = (request.notes as string | null) ?? 'Uniform courier dispatch';

  if (totalAmount > 0 && guardEpf) {
    const { data: guard } = await db
      .from('employees')
      .select('id, company_id')
      .eq('emp_number', guardEpf)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    const guardCompanyId = (guard as { company_id?: string | null } | null)?.company_id;
    if (guard?.id && guardCompanyId) {
      const { error: deductionError } = await db.from('payroll_deductions').insert({
        company_id: guardCompanyId,
        guard_id: guard.id,
        category: 'UNIFORM',
        amount: totalAmount,
        reason: `${notes} — dispatched ${now.slice(0, 10)}`,
        applied_month: payrollMonthFirstDay(),
        added_by: user?.id ?? null,
        approval_status: 'APPROVED',
      });
      if (deductionError) {
        console.error('[Uniform courier] Payroll deduction:', deductionError.message);
      }
    }
  }

  revalidateDeductions();
  return { success: true };
}

function isMissingTableError(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.toLowerCase().includes('does not exist') ||
    message.toLowerCase().includes('relation')
  );
}

function parseDemoShiftCount(detail: string | undefined): number {
  const m = (detail ?? '').match(/(\d+)\s*shift/i);
  return m ? Number(m[1]) : 1;
}

function demoSiteGroups(payrollMonth: string): SiteDeductionGroup[] {
  const bySite = new Map<string, SiteDeductionGroup>();

  const upsert = (
    site: string,
    empNo: string,
    name: string,
    rank: string,
    uniform: number,
    meals: number,
    shiftCount: number,
  ) => {
    const siteKey = site.trim().toLowerCase();
    let group = bySite.get(siteKey);
    if (!group) {
      group = {
        siteKey,
        siteName: site,
        siteProfileId: null,
        mealSupplierName: null,
        employees: [],
        pendingCount: 0,
      };
      bySite.set(siteKey, group);
    }
    const existing = group.employees.find((e) => e.empNumber === empNo);
    if (existing) {
      existing.uniformAmountLkr += uniform;
      existing.mealsAmountLkr += meals;
      existing.monthMealCostLkr += meals;
      existing.shiftCount = Math.max(existing.shiftCount, shiftCount);
      return;
    }
    group.employees.push({
      employeeId: `demo-${empNo}`,
      empNumber: empNo,
      fullName: name,
      rank,
      shiftCount,
      monthMealCostLkr: meals,
      entryId: null,
      uniformAmountLkr: uniform,
      mealsAmountLkr: meals,
      mealsFromShifts: meals > 0,
      status: null,
    });
  };

  for (const row of MEALS_DEDUCTIONS_LEDGER) {
    upsert(row.site, row.empNo, row.name, row.rank, 0, row.amountLkr, parseDemoShiftCount(row.detail));
    const g = bySite.get(row.site.trim().toLowerCase())!;
    if (!g.mealSupplierName) g.mealSupplierName = row.supplier;
  }
  for (const row of UNIFORM_DEDUCTIONS_LEDGER) {
    upsert(row.site, row.empNo, row.name, row.rank, row.amountLkr, 0, 1);
  }

  const monthMealByEmpNo = new Map<string, number>();
  for (const row of MEALS_DEDUCTIONS_LEDGER) {
    monthMealByEmpNo.set(row.empNo, (monthMealByEmpNo.get(row.empNo) ?? 0) + row.amountLkr);
  }

  for (const g of bySite.values()) {
    for (const e of g.employees) {
      const total = monthMealByEmpNo.get(e.empNumber);
      if (total != null) e.monthMealCostLkr = total;
    }
    g.employees.sort((a, b) => a.fullName.localeCompare(b.fullName));
    g.pendingCount = g.employees.filter((e) => !e.status).length;
  }

  return [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
}

export async function getSiteDeductionGroups(
  payrollMonthInput?: string,
): Promise<{ groups: SiteDeductionGroup[]; payrollMonth: string; isDemo: boolean }> {
  const payrollMonth = payrollMonthFirstDay(payrollMonthInput);
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let empQuery = supabase
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, rank, site, status, group')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) empQuery = empQuery.eq('company_id', companyId);

  const { data: employees, error: empError } = await empQuery;
  if (empError) {
    if (isMissingTableError(empError.message)) {
      return { groups: demoSiteGroups(payrollMonth), payrollMonth, isDemo: true };
    }
    console.error('❌ Deductions (employees):', empError.message);
    return { groups: demoSiteGroups(payrollMonth), payrollMonth, isDemo: true };
  }

  type EmpRow = {
    id: string;
    emp_number: string | null;
    epf_no: string | null;
    epf_num: string | number | null;
    full_name: string | null;
    rank: string | null;
    site: string | null;
    group: string | null;
  };

  const guards = ((employees ?? []) as EmpRow[]).filter(
    (e) =>
      String(e.group ?? '').toUpperCase() === 'GUARD' ||
      (e.site != null && String(e.site).trim() !== ''),
  );

  if (!guards.length) {
    return { groups: demoSiteGroups(payrollMonth), payrollMonth, isDemo: true };
  }

  const employeeIds = guards.map((g) => g.id);

  let entries: {
    id: string;
    employee_id: string;
    uniform_amount_lkr: number;
    meals_amount_lkr: number;
    status: string;
  }[] = [];

  const { data: entryRows, error: entryError } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('id, employee_id, uniform_amount_lkr, meals_amount_lkr, status')
    .eq('payroll_month', payrollMonth)
    .in('employee_id', employeeIds);

  if (entryError) {
    if (!isMissingTableError(entryError.message)) {
      console.error('❌ Deductions (entries):', entryError.message);
    }
  } else {
    entries = (entryRows ?? []) as typeof entries;
  }

  const entryByEmployee = new Map(entries.map((e) => [e.employee_id, e]));

  const uniformIssuedByGuard = new Map<string, number>();
  if (employeeIds.length > 0) {
    let uniformDedQuery = supabase
      .from('payroll_deductions')
      .select('guard_id, amount')
      .eq('category', 'UNIFORM')
      .eq('applied_month', payrollMonth)
      .in('guard_id', employeeIds);

    if (companyId) uniformDedQuery = uniformDedQuery.eq('company_id', companyId);

    const { data: uniformDeductions, error: uniformDedError } = await uniformDedQuery;
    if (uniformDedError && !isMissingTableError(uniformDedError.message)) {
      console.error('❌ Deductions (uniform payroll_deductions):', uniformDedError.message);
    } else {
      for (const row of uniformDeductions ?? []) {
        const guardId = row.guard_id as string;
        uniformIssuedByGuard.set(
          guardId,
          (uniformIssuedByGuard.get(guardId) ?? 0) + Number(row.amount ?? 0),
        );
      }
    }
  }

  let sites: {
    id: string;
    site_name: string;
    provides_food?: boolean | null;
    food_allowance_lkr?: number | null;
  }[] = [];
  let siteQuery = supabase
    .from('site_profiles')
    .select('id, site_name, provides_food, food_allowance_lkr')
    .order('site_name');
  if (companyId) siteQuery = siteQuery.eq('company_id', companyId);
  const { data: siteRows } = await siteQuery;
  sites = (siteRows ?? []) as typeof sites;
  const siteFoodByKey = siteFoodByKeyFromProfiles(sites);

  const siteIdByName = new Map(sites.map((s) => [s.site_name.toLowerCase(), s.id]));

  const assignmentBySiteId = new Map<string, string>();
  const supplierNameById = new Map<string, string>();

  if (sites.length > 0) {
    const { data: assignments } = await supabase
      .from('site_meal_supplier_assignments')
      .select('site_profile_id, meal_supplier_id, meal_suppliers ( name )')
      .in(
        'site_profile_id',
        sites.map((s) => s.id),
      );

    for (const row of assignments ?? []) {
      const siteId = row.site_profile_id as string;
      const supplierId = row.meal_supplier_id as string;
      assignmentBySiteId.set(siteId, supplierId);
      const sp = row.meal_suppliers as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(sp) ? sp[0]?.name : sp?.name;
      if (name) supplierNameById.set(supplierId, name);
    }
  }

  const guardById = new Map(guards.map((g) => [g.id, g]));
  const shiftRollup = await fetchMonthlySiteShiftRollup(
    supabase,
    guards,
    payrollMonth,
    companyId,
  );
  const useShiftRollup = hasShiftRollupData(shiftRollup);
  const monthMealCostByEmployee = computeMonthMealCostByEmployee(shiftRollup, siteFoodByKey);

  const bySite = new Map<string, SiteDeductionGroup>();

  const ensureGroup = (siteKey: string, siteName: string) => {
    let group = bySite.get(siteKey);
    if (!group) {
      const profileId = siteIdByName.get(siteKey) ?? null;
      const supplierId = profileId ? assignmentBySiteId.get(profileId) : undefined;
      group = {
        siteKey,
        siteName,
        siteProfileId: profileId,
        mealSupplierName: supplierId ? (supplierNameById.get(supplierId) ?? null) : null,
        employees: [],
        pendingCount: 0,
      };
      bySite.set(siteKey, group);
    }
    return group;
  };

  const addEmployeeToGroup = (siteKey: string, siteName: string, emp: EmpRow, shiftCount: number) => {
    const group = ensureGroup(siteKey, siteName);
    if (group.employees.some((e) => e.employeeId === emp.id)) return;

    const entry = entryByEmployee.get(emp.id as string);
    const status = entry?.status === 'APPROVED' ? 'APPROVED' : entry ? 'DRAFT' : null;
    if (status === 'DRAFT' || !entry) group.pendingCount += 1;

    const savedUniform = Number(entry?.uniform_amount_lkr ?? 0);
    const issuedUniform = uniformIssuedByGuard.get(emp.id as string) ?? 0;
    const uniformAmountLkr = savedUniform > 0 ? savedUniform : issuedUniform;

    const monthMealCostLkr = monthMealCostByEmployee.get(emp.id as string) ?? 0;
    const savedMeals = Number(entry?.meals_amount_lkr ?? 0);
    const mealsAmountLkr = savedMeals > 0 ? savedMeals : monthMealCostLkr;

    group.employees.push({
      employeeId: emp.id as string,
      empNumber: String(emp.emp_number ?? guardEpfKeys(emp)[0] ?? '—'),
      fullName: String(emp.full_name ?? 'Unknown'),
      rank: (emp.rank as string | null) ?? null,
      shiftCount,
      monthMealCostLkr,
      entryId: entry?.id ?? null,
      uniformAmountLkr,
      uniformFromIssue: savedUniform === 0 && issuedUniform > 0,
      mealsAmountLkr,
      mealsFromShifts: savedMeals === 0 && monthMealCostLkr > 0,
      status: status as 'DRAFT' | 'APPROVED' | null,
    });
  };

  if (useShiftRollup) {
    for (const [siteKey, countsByEmployee] of shiftRollup.shiftCountBySite) {
      const siteName =
        sites.find((s) => s.site_name.toLowerCase() === siteKey)?.site_name ??
        shiftRollup.siteNameByKey.get(siteKey) ??
        siteKey;
      for (const [employeeId, shiftCount] of countsByEmployee) {
        if (shiftCount < 1) continue;
        const emp = guardById.get(employeeId);
        if (!emp) continue;
        addEmployeeToGroup(siteKey, siteName, emp, shiftCount);
      }
    }
  } else {
    for (const emp of guards) {
      const siteName = (emp.site as string | null)?.trim() || 'Unassigned Site';
      const siteKey = siteName.toLowerCase();
      addEmployeeToGroup(siteKey, siteName, emp, 0);
    }
  }

  for (const g of bySite.values()) {
    g.employees.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  const groups = [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
  return { groups, payrollMonth, isDemo: false };
}

async function resolveUniformAmountLkrForEntry(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string,
  employeeId: string,
  payrollMonth: string,
): Promise<number> {
  const { data: entry } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('uniform_amount_lkr')
    .eq('employee_id', employeeId)
    .eq('payroll_month', payrollMonth)
    .maybeSingle();

  const savedUniform = Number(entry?.uniform_amount_lkr ?? 0);
  if (savedUniform > 0) return savedUniform;

  let uniformDedQuery = supabase
    .from('payroll_deductions')
    .select('amount')
    .eq('category', 'UNIFORM')
    .eq('applied_month', payrollMonth)
    .eq('guard_id', employeeId)
    .eq('company_id', companyId);

  const { data: uniformDeductions, error: uniformDedError } = await uniformDedQuery;
  if (uniformDedError && !isMissingTableError(uniformDedError.message)) {
    console.error('❌ Deductions (uniform resolve on save):', uniformDedError.message);
    return 0;
  }

  return (uniformDeductions ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function saveEmployeeDeductionEntry(input: {
  employeeId: string;
  payrollMonth: string;
  mealsAmountLkr: number;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const payrollMonth = payrollMonthFirstDay(input.payrollMonth.slice(0, 7));

  const { data: existing } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('status')
    .eq('employee_id', input.employeeId)
    .eq('payroll_month', payrollMonth)
    .maybeSingle();

  if (existing?.status === 'APPROVED') {
    return { success: false, error: 'This month is already approved — cannot edit amounts.' };
  }

  const uniformAmountLkr = await resolveUniformAmountLkrForEntry(
    supabase,
    companyId,
    input.employeeId,
    payrollMonth,
  );

  const payload = {
    company_id: companyId,
    employee_id: input.employeeId,
    payroll_month: payrollMonth,
    uniform_amount_lkr: Math.max(0, uniformAmountLkr),
    meals_amount_lkr: Math.max(0, input.mealsAmountLkr),
    notes: input.notes?.trim() || null,
    status: 'DRAFT',
    updated_at: new Date().toISOString(),
    ...(user?.id ? { created_by: user.id } : {}),
  };

  const { error } = await supabase.from('payroll_monthly_deduction_entries').upsert(payload, {
    onConflict: 'employee_id,payroll_month',
  });

  if (error) {
    if (input.employeeId.startsWith('demo-')) {
      return { success: false, error: 'Preview mode — connect Supabase and run migrations first.' };
    }
    return { success: false, error: error.message };
  }

  await auditStaffAction({
    supabase,
    portal: 'hq',
    action: 'Save Deduction Entry',
    targetEntity: `Employee ${input.employeeId} · ${payrollMonth}`,
    details: {
      mealsAmountLkr: input.mealsAmountLkr,
      uniformAmountLkr,
    },
  });

  revalidateDeductions();
  return { success: true };
}

export async function approveEmployeeDeductionEntry(
  entryId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: entry, error: fetchError } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('*')
    .eq('id', entryId)
    .single();

  if (fetchError || !entry) {
    return { success: false, error: fetchError?.message ?? 'Entry not found' };
  }

  const { error: updateError } = await supabase
    .from('payroll_monthly_deduction_entries')
    .update({
      status: 'APPROVED',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (updateError) return { success: false, error: updateError.message };

  const uniform = Number(entry.uniform_amount_lkr ?? 0);
  const meals = Number(entry.meals_amount_lkr ?? 0);
  const month = String(entry.payroll_month);
  const guardId = String(entry.employee_id);
  const companyId = String(entry.company_id);

  const deductions: {
    company_id: string;
    guard_id: string;
    category: string;
    amount: number;
    applied_month: string;
    added_by: string;
    approval_status: string;
    reason: string;
  }[] = [];

  if (uniform > 0) {
    deductions.push({
      company_id: companyId,
      guard_id: guardId,
      category: 'UNIFORM',
      amount: uniform,
      applied_month: month,
      added_by: user.id,
      approval_status: 'APPROVED',
      reason: `HQ Deductions Admin · ${payrollMonthLabel(month)}`,
    });
  }
  if (meals > 0) {
    deductions.push({
      company_id: companyId,
      guard_id: guardId,
      category: 'MEAL_OVERAGE',
      amount: meals,
      applied_month: month,
      added_by: user.id,
      approval_status: 'APPROVED',
      reason: `HQ Deductions Admin · ${payrollMonthLabel(month)}`,
    });
  }

  if (deductions.length > 0) {
    const { error: insError } = await supabase.from('payroll_deductions').insert(deductions);
    if (insError && !isMissingTableError(insError.message)) {
      console.error('❌ payroll_deductions insert:', insError.message);
    }
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Approve Deduction Entry',
    targetEntity: `Entry ${entryId} · ${payrollMonthLabel(month)}`,
    details: { entryId, uniform, meals },
  });

  revalidateDeductions();
  return { success: true };
}

export async function approveAllDraftForMonth(
  payrollMonthInput: string,
): Promise<{ success: boolean; approved: number; error?: string }> {
  const payrollMonth = payrollMonthFirstDay(payrollMonthInput);
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('payroll_monthly_deduction_entries')
    .select('id')
    .eq('payroll_month', payrollMonth)
    .eq('status', 'DRAFT');

  if (companyId) query = query.eq('company_id', companyId);

  const { data: drafts, error } = await query;
  if (error) return { success: false, approved: 0, error: error.message };

  let approved = 0;
  for (const row of drafts ?? []) {
    const result = await approveEmployeeDeductionEntry(row.id as string);
    if (result.success) approved += 1;
  }

  revalidateDeductions();
  return { success: true, approved };
}

export async function countUnapprovedDeductions(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const payrollMonth = payrollMonthFirstDay();

  let query = supabase
    .from('payroll_monthly_deduction_entries')
    .select('id', { count: 'exact', head: true })
    .eq('payroll_month', payrollMonth)
    .eq('status', 'DRAFT');

  if (companyId) query = query.eq('company_id', companyId);

  const { count, error } = await query;
  if (error) {
    if (isMissingTableError(error.message)) {
      return MEALS_DEDUCTIONS_LEDGER.length + UNIFORM_DEDUCTIONS_LEDGER.length;
    }
    return 0;
  }
  return count ?? 0;
}

// ─── Meal suppliers ───────────────────────────────────────────────────────────

export async function listMealSuppliers(
  includeArchived = false,
): Promise<{ suppliers: MealSupplierRow[]; isDemo: boolean }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('meal_suppliers')
    .select(
      'id, name, address, phone, bank_name, bank_branch, account_name, account_number, status, archived_at',
    )
    .order('name', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);
  if (!includeArchived) query = query.eq('status', 'ACTIVE');

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error.message)) {
      const names = [...new Set(MEALS_DEDUCTIONS_LEDGER.map((r) => r.supplier))];
      return {
        isDemo: true,
        suppliers: names.map((name, i) => ({
          id: `demo-supplier-${i}`,
          name,
          address: null,
          phone: null,
          bankName: null,
          bankBranch: null,
          accountName: null,
          accountNumber: null,
          status: 'ACTIVE' as const,
          archivedAt: null,
        })),
      };
    }
    return { suppliers: [], isDemo: false };
  }

  return {
    isDemo: false,
    suppliers: (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      address: (r.address as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      bankName: (r.bank_name as string | null) ?? null,
      bankBranch: (r.bank_branch as string | null) ?? null,
      accountName: (r.account_name as string | null) ?? null,
      accountNumber: (r.account_number as string | null) ?? null,
      status: (r.status as 'ACTIVE' | 'ARCHIVED') ?? 'ACTIVE',
      archivedAt: (r.archived_at as string | null) ?? null,
    })),
  };
}

export async function upsertMealSupplier(input: {
  id?: string;
  name: string;
  address?: string;
  phone?: string;
  bankName?: string;
  bankBranch?: string;
  accountName?: string;
  accountNumber?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const row = {
    company_id: companyId,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    bank_name: input.bankName?.trim() || null,
    bank_branch: input.bankBranch?.trim() || null,
    account_name: input.accountName?.trim() || null,
    account_number: input.accountNumber?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('meal_suppliers').update(row).eq('id', input.id);
    if (error) return { success: false, error: error.message };
    revalidateDeductions();
    return { success: true, id: input.id };
  }

  const { data, error } = await supabase
    .from('meal_suppliers')
    .insert(row)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true, id: data?.id as string };
}

export async function archiveMealSupplier(
  supplierId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('meal_suppliers')
    .update({
      status: 'ARCHIVED',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

export async function restoreMealSupplier(
  supplierId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('meal_suppliers')
    .update({
      status: 'ACTIVE',
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

export async function getMealSupplierMonthlyOwed(
  supplierId: string,
): Promise<MealSupplierMonthOwed[]> {
  const supabase = await createSupabaseServerClient();

  const { data: siteAssignments } = await supabase
    .from('site_meal_supplier_assignments')
    .select('site_profile_id, site_profiles ( site_name )')
    .eq('meal_supplier_id', supplierId);

  const siteNames = new Set<string>();
  for (const row of siteAssignments ?? []) {
    const sp = row.site_profiles as { site_name?: string } | { site_name?: string }[] | null;
    const name = Array.isArray(sp) ? sp[0]?.site_name : sp?.site_name;
    if (name) siteNames.add(name);
  }

  if (!siteNames.size) return [];

  const { data: employees } = await supabase
    .from('employees')
    .select('id, site')
    .in('site', [...siteNames]);

  const employeeIds = (employees ?? []).map((e) => e.id as string);
  if (!employeeIds.length) return [];

  const { data: entries } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('payroll_month, meals_amount_lkr, employee_id, status')
    .in('employee_id', employeeIds)
    .order('payroll_month', { ascending: false });

  const byMonth = new Map<string, { total: number; guards: Set<string> }>();
  for (const row of entries ?? []) {
    const month = String(row.payroll_month);
    const amount = Number(row.meals_amount_lkr ?? 0);
    if (amount <= 0) continue;
    let bucket = byMonth.get(month);
    if (!bucket) {
      bucket = { total: 0, guards: new Set() };
      byMonth.set(month, bucket);
    }
    bucket.total += amount;
    bucket.guards.add(String(row.employee_id));
  }

  return [...byMonth.entries()]
    .map(([payrollMonth, v]) => ({
      payrollMonth,
      payrollMonthLabel: payrollMonthLabel(payrollMonth),
      totalMealsLkr: v.total,
      guardCount: v.guards.size,
    }))
    .sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth));
}

// ─── Site ↔ supplier assignments ──────────────────────────────────────────────

export async function getSiteMealAssignments(): Promise<{
  rows: SiteMealAssignmentRow[];
  suppliers: MealSupplierRow[];
  isDemo: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const { suppliers, isDemo: suppliersDemo } = await listMealSuppliers();

  let siteQuery = supabase
    .from('site_profiles')
    .select('id, site_name, address')
    .order('site_name', { ascending: true });
  if (companyId) siteQuery = siteQuery.eq('company_id', companyId);

  const { data: sites, error } = await siteQuery;
  if (error || !sites?.length) {
    const demoSites = [...new Set(MEALS_DEDUCTIONS_LEDGER.map((r) => r.site))].sort();
    const supplierBySite = new Map(
      MEALS_DEDUCTIONS_LEDGER.map((r) => [r.site, r.supplier]),
    );
    return {
      isDemo: true,
      suppliers,
      rows: demoSites.map((siteName, i) => ({
        siteProfileId: `demo-site-${i}`,
        siteName,
        address: null,
        mealSupplierId: null,
        mealSupplierName: supplierBySite.get(siteName) ?? null,
        assignmentId: null,
      })),
    };
  }

  const siteIds = sites.map((s) => s.id as string);
  const { data: assignments } = await supabase
    .from('site_meal_supplier_assignments')
    .select('id, site_profile_id, meal_supplier_id, meal_suppliers ( name )')
    .in('site_profile_id', siteIds);

  const assignBySite = new Map(
    (assignments ?? []).map((a) => [
      a.site_profile_id as string,
      {
        assignmentId: a.id as string,
        mealSupplierId: a.meal_supplier_id as string,
        mealSupplierName: (() => {
          const sp = a.meal_suppliers as { name?: string } | { name?: string }[] | null;
          return Array.isArray(sp) ? (sp[0]?.name ?? null) : (sp?.name ?? null);
        })(),
      },
    ]),
  );

  return {
    isDemo: suppliersDemo,
    suppliers,
    rows: sites.map((s) => {
      const assign = assignBySite.get(s.id as string);
      return {
        siteProfileId: s.id as string,
        siteName: s.site_name as string,
        address: (s.address as string | null) ?? null,
        mealSupplierId: assign?.mealSupplierId ?? null,
        mealSupplierName: assign?.mealSupplierName ?? null,
        assignmentId: assign?.assignmentId ?? null,
      };
    }),
  };
}

export async function assignSiteMealSupplier(input: {
  siteProfileId: string;
  mealSupplierId: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  if (input.siteProfileId.startsWith('demo-')) {
    return { success: false, error: 'Preview mode — run migrations and use live sites.' };
  }

  const payload = {
    company_id: companyId,
    site_profile_id: input.siteProfileId,
    meal_supplier_id: input.mealSupplierId,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('site_meal_supplier_assignments')
    .upsert(payload, { onConflict: 'site_profile_id' });

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

export async function clearSiteMealSupplier(
  siteProfileId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('site_meal_supplier_assignments')
    .delete()
    .eq('site_profile_id', siteProfileId);

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

// ─── Uniform suppliers & stock ────────────────────────────────────────────────

async function getActiveEmployeeCount(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  companyId: string | null,
): Promise<number> {
  let query = supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE');
  if (companyId) query = query.eq('company_id', companyId);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

function mapUniformSupplierRow(r: Record<string, unknown>): UniformSupplierRow {
  return {
    id: r.id as string,
    name: r.name as string,
    address: (r.address as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    bankName: (r.bank_name as string | null) ?? null,
    bankBranch: (r.bank_branch as string | null) ?? null,
    accountName: (r.account_name as string | null) ?? null,
    accountNumber: (r.account_number as string | null) ?? null,
    status: (r.status as 'ACTIVE' | 'ARCHIVED') ?? 'ACTIVE',
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

function demoUniformStockOverview(): UniformStockOverview {
  const activeEmployeeCount = 120;
  const reorderMinQty = uniformReorderMinQty(activeEmployeeCount);
  const supplier: UniformSupplierRow = {
    id: 'demo-uniform-supplier',
    name: 'Pearzen Uniforms (Preview)',
    address: 'Colombo 03',
    phone: '+94 11 000 0000',
    email: null,
    bankName: null,
    bankBranch: null,
    accountName: null,
    accountNumber: null,
    status: 'ACTIVE',
    archivedAt: null,
  };
  const items: UniformStockItemRow[] = DEFAULT_UNIFORM_CATALOG.map((entry, i) => {
    const quantityInStock = i % 3 === 0 ? reorderMinQty - 1 : reorderMinQty + 4;
    return {
      id: `demo-item-${entry.id}`,
      itemName: entry.item,
      sku: entry.id,
      quantityInStock,
      unitCostLkr: entry.cost,
      notes: null,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone,
      supplierAddress: supplier.address,
      lowStock: quantityInStock < reorderMinQty,
    };
  });
  return {
    items,
    suppliers: [supplier],
    activeEmployeeCount,
    reorderMinQty,
    isDemo: true,
  };
}

export async function getUniformStockOverview(): Promise<UniformStockOverview> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const activeEmployeeCount = await getActiveEmployeeCount(supabase, companyId);
  const reorderMinQty = uniformReorderMinQty(activeEmployeeCount);

  const { suppliers, isDemo: suppliersDemo } = await listUniformSuppliers(true);

  let itemQuery = supabase
    .from('uniform_stock_items')
    .select(
      'id, item_name, sku, quantity_in_stock, unit_cost_lkr, notes, uniform_supplier_id, uniform_suppliers ( name, phone, address )',
    )
    .order('item_name', { ascending: true });

  if (companyId) itemQuery = itemQuery.eq('company_id', companyId);

  const { data: itemRows, error: itemError } = await itemQuery;

  if (itemError) {
    if (isMissingTableError(itemError.message)) {
      return demoUniformStockOverview();
    }
    return {
      items: [],
      suppliers,
      activeEmployeeCount,
      reorderMinQty,
      isDemo: suppliersDemo,
    };
  }

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const items: UniformStockItemRow[] = (itemRows ?? []).map((row) => {
    const supplierId = row.uniform_supplier_id as string;
    const joined = row.uniform_suppliers as
      | { name?: string; phone?: string; address?: string }
      | { name?: string; phone?: string; address?: string }[]
      | null;
    const sp = Array.isArray(joined) ? joined[0] : joined;
    const supplier = supplierById.get(supplierId);
    const quantityInStock = Number(row.quantity_in_stock ?? 0);
    return {
      id: row.id as string,
      itemName: row.item_name as string,
      sku: (row.sku as string | null) ?? null,
      quantityInStock,
      unitCostLkr: row.unit_cost_lkr != null ? Number(row.unit_cost_lkr) : null,
      notes: (row.notes as string | null) ?? null,
      supplierId,
      supplierName: sp?.name ?? supplier?.name ?? '—',
      supplierPhone: sp?.phone ?? supplier?.phone ?? null,
      supplierAddress: sp?.address ?? supplier?.address ?? null,
      lowStock: quantityInStock < reorderMinQty,
    };
  });

  return {
    items,
    suppliers,
    activeEmployeeCount,
    reorderMinQty,
    isDemo: false,
  };
}

export async function listUniformSuppliers(
  includeArchived = false,
): Promise<{ suppliers: UniformSupplierRow[]; isDemo: boolean }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('uniform_suppliers')
    .select(
      'id, name, address, phone, email, bank_name, bank_branch, account_name, account_number, status, archived_at',
    )
    .order('name', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);
  if (!includeArchived) query = query.eq('status', 'ACTIVE');

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error.message)) {
      return { isDemo: true, suppliers: demoUniformStockOverview().suppliers };
    }
    return { suppliers: [], isDemo: false };
  }

  return {
    isDemo: false,
    suppliers: (data ?? []).map((r) => mapUniformSupplierRow(r as Record<string, unknown>)),
  };
}

export async function upsertUniformSupplier(input: {
  id?: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankBranch?: string;
  accountName?: string;
  accountNumber?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const row = {
    company_id: companyId,
    name: input.name.trim(),
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    bank_name: input.bankName?.trim() || null,
    bank_branch: input.bankBranch?.trim() || null,
    account_name: input.accountName?.trim() || null,
    account_number: input.accountNumber?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('uniform_suppliers').update(row).eq('id', input.id);
    if (error) return { success: false, error: error.message };
    revalidateDeductions();
    return { success: true, id: input.id };
  }

  const { data, error } = await supabase
    .from('uniform_suppliers')
    .insert(row)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true, id: data?.id as string };
}

export async function archiveUniformSupplier(
  supplierId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('uniform_suppliers')
    .update({
      status: 'ARCHIVED',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

export async function restoreUniformSupplier(
  supplierId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('uniform_suppliers')
    .update({
      status: 'ACTIVE',
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', supplierId);

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

export async function upsertUniformStockItem(input: {
  id?: string;
  itemName: string;
  uniformSupplierId: string;
  sku?: string;
  quantityInStock: number;
  unitCostLkr?: number;
  notes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  if (input.uniformSupplierId.startsWith('demo-')) {
    return { success: false, error: 'Preview mode — run migrations first.' };
  }

  const row = {
    company_id: companyId,
    uniform_supplier_id: input.uniformSupplierId,
    item_name: input.itemName.trim(),
    sku: input.sku?.trim() || null,
    quantity_in_stock: Math.max(0, Math.floor(input.quantityInStock)),
    unit_cost_lkr:
      input.unitCostLkr != null && Number.isFinite(input.unitCostLkr)
        ? Math.max(0, input.unitCostLkr)
        : null,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase.from('uniform_stock_items').update(row).eq('id', input.id);
    if (error) return { success: false, error: error.message };
    revalidateDeductions();
    return { success: true, id: input.id };
  }

  const { data, error } = await supabase
    .from('uniform_stock_items')
    .insert(row)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true, id: data?.id as string };
}

export async function deleteUniformStockItem(
  itemId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('uniform_stock_items').delete().eq('id', itemId);
  if (error) return { success: false, error: error.message };
  revalidateDeductions();
  return { success: true };
}

const VO_HOLDER_ROLE_ORDER: UniformVoHolderRole[] = ['SM', 'TM', 'OM'];

function demoUniformVoHolders(): UniformVoHolderOption[] {
  return [
    { epf: 'SM042', fullName: 'Demo Sector Manager', role: 'SM', detail: 'Colombo North' },
    { epf: 'TM015', fullName: 'Demo Territory Manager', role: 'TM', detail: null },
    { epf: 'OM008', fullName: 'Demo Operations Manager', role: 'OM', detail: null },
  ];
}

export async function getUniformVoStockHolders(): Promise<{
  holders: UniformVoHolderOption[];
  isDemo: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const holders: UniformVoHolderOption[] = [];

  let smQuery = supabase
    .from('employees')
    .select('emp_number, full_name, site')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) smQuery = smQuery.eq('company_id', companyId);

  const { data: sectorManagers, error: smError } = await smQuery;
  if (smError && isMissingTableError(smError.message)) {
    return { holders: demoUniformVoHolders(), isDemo: true };
  }

  for (const row of sectorManagers ?? []) {
    const epf = String(row.emp_number ?? '').trim().toUpperCase();
    if (!epf) continue;
    holders.push({
      epf,
      fullName: String(row.full_name ?? epf),
      role: 'SM',
      detail: (row.site as string | null) ?? null,
    });
  }

  let usersQuery = supabase
    .from('users')
    .select('email, full_name, role')
    .in('role', ['OM', 'TM'])
    .order('full_name', { ascending: true });

  if (companyId) usersQuery = usersQuery.eq('company_id', companyId);

  const { data: portalUsers } = await usersQuery;

  const employeeNameByEpf = new Map<string, string>();
  const epfsToLookup = new Set<string>();

  for (const row of portalUsers ?? []) {
    const role = String(row.role ?? '').toUpperCase();
    if (role !== 'OM' && role !== 'TM') continue;
    const epf = String(row.email ?? '')
      .split('@')[0]
      ?.trim()
      .toUpperCase();
    if (!epf) continue;
    epfsToLookup.add(epf);
    holders.push({
      epf,
      fullName: String(row.full_name ?? epf).trim() || epf,
      role: role as UniformVoHolderRole,
      detail: null,
    });
  }

  if (epfsToLookup.size > 0) {
    let empQuery = supabase
      .from('employees')
      .select('emp_number, full_name')
      .in('emp_number', [...epfsToLookup])
      .eq('status', 'ACTIVE');
    if (companyId) empQuery = empQuery.eq('company_id', companyId);
    const { data: emps } = await empQuery;
    for (const e of emps ?? []) {
      const epf = String(e.emp_number ?? '').trim().toUpperCase();
      if (epf) employeeNameByEpf.set(epf, String(e.full_name ?? epf));
    }
  }

  const seen = new Set<string>();
  const merged = holders
    .map((h) => ({
      ...h,
      fullName: employeeNameByEpf.get(h.epf) ?? h.fullName,
    }))
    .filter((h) => {
      if (seen.has(h.epf)) return false;
      seen.add(h.epf);
      return true;
    })
    .sort((a, b) => {
      const ro = VO_HOLDER_ROLE_ORDER.indexOf(a.role) - VO_HOLDER_ROLE_ORDER.indexOf(b.role);
      if (ro !== 0) return ro;
      return a.fullName.localeCompare(b.fullName);
    });

  if (merged.length === 0) {
    return { holders: demoUniformVoHolders(), isDemo: true };
  }

  return { holders: merged, isDemo: false };
}

export async function getHolderUniformVoStock(
  holderEpf: string,
): Promise<UniformVoStockRow[]> {
  const epf = holderEpf.trim().toUpperCase();
  if (!epf) return [];

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return [];

  const db = createSupabaseServiceClient();
  try {
    const rows = await fetchUniformVoStockOnHand(db, companyId, epf);
    return rows.map((r) => ({
      itemName: r.itemName,
      quantityOnHand: r.quantityOnHand,
    }));
  } catch {
    return [];
  }
}

export async function issueUniformVoStockBatch(input: {
  holderEpf: string;
  lines: { stockItemId: string; quantity: number }[];
}): Promise<{ success: boolean; error?: string; issuedCount?: number }> {
  const holderEpf = input.holderEpf.trim().toUpperCase();
  if (!holderEpf) return { success: false, error: 'Select an SM, TM, or OM.' };

  const lines = input.lines.filter((l) => l.quantity > 0 && l.stockItemId);
  if (lines.length === 0) {
    return { success: false, error: 'Add at least one item and quantity.' };
  }

  let issued = 0;
  for (const line of lines) {
    const res = await allocateUniformStockToVo({
      holderEpf,
      stockItemId: line.stockItemId,
      quantity: line.quantity,
    });
    if (!res.success) {
      if (issued > 0) {
        return {
          success: false,
          error: `${res.error ?? 'Allocation failed'} (${issued} line(s) were already issued — refresh and verify stock.)`,
        };
      }
      return { success: false, error: res.error };
    }
    issued += 1;
  }

  revalidateDeductions();
  return { success: true, issuedCount: issued };
}

/** Move quantity from HQ warehouse stock to a VO holder (TM / SM / OM / admin EPF). */
export async function allocateUniformStockToVo(input: {
  holderEpf: string;
  stockItemId: string;
  quantity: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const holderEpf = input.holderEpf.trim().toUpperCase();
  if (!holderEpf) return { success: false, error: 'Holder EPF is required.' };

  const qty = Math.max(1, Math.floor(input.quantity));
  if (input.stockItemId.startsWith('demo-')) {
    return { success: false, error: 'Preview mode — run migrations first.' };
  }

  const { data: hqItem, error: fetchErr } = await supabase
    .from('uniform_stock_items')
    .select('id, item_name, quantity_in_stock')
    .eq('id', input.stockItemId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (fetchErr || !hqItem) return { success: false, error: 'Stock item not found.' };

  const available = Number(hqItem.quantity_in_stock ?? 0);
  if (qty > available) {
    return { success: false, error: `Only ${available} available at HQ warehouse.` };
  }

  const now = new Date().toISOString();
  const { error: hqUpdateErr } = await supabase
    .from('uniform_stock_items')
    .update({ quantity_in_stock: available - qty, updated_at: now })
    .eq('id', input.stockItemId)
    .gte('quantity_in_stock', qty);

  if (hqUpdateErr) return { success: false, error: hqUpdateErr.message };

  const db = createSupabaseServiceClient();
  const itemName = hqItem.item_name as string;

  const { data: voRow, error: voFetchErr } = await db
    .from('uniform_vo_stock')
    .select('quantity_on_hand')
    .eq('company_id', companyId)
    .eq('holder_epf', holderEpf)
    .eq('item_name', itemName)
    .maybeSingle();

  if (voFetchErr) {
    if (isMissingUniformVoStockTable(voFetchErr.message)) {
      return { success: false, error: 'Run database migrations for uniform_vo_stock.' };
    }
    return { success: false, error: voFetchErr.message };
  }

  const voQty = Number(voRow?.quantity_on_hand ?? 0) + qty;
  const { error: voUpsertErr } = await db.from('uniform_vo_stock').upsert(
    {
      company_id: companyId,
      holder_epf: holderEpf,
      item_name: itemName,
      quantity_on_hand: voQty,
      updated_at: now,
    },
    { onConflict: 'company_id,holder_epf,item_name' },
  );

  if (voUpsertErr) {
    await supabase
      .from('uniform_stock_items')
      .update({ quantity_in_stock: available, updated_at: now })
      .eq('id', input.stockItemId);
    return { success: false, error: voUpsertErr.message };
  }

  revalidateDeductions();
  revalidatePath('/tm/uniform');
  revalidatePath('/om/uniform');
  return { success: true };
}
