'use server';

import { unstable_noStore as noStore } from 'next/cache';

import { collectSmEpfAliasKeys, normalizeSmEpf, sectorManagerEpfKey } from '../../../../../../packages/supabase/sm-epf';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/service';
import { fetchActiveSectorManagerRecordsForCompany } from '../../../../lib/sector-manager-roster';
import { CVS_GUARD_OPS_ENABLED } from '../../../../lib/cvs-workforce-phase';
import { parseSiteRateMatrix } from '../../../../lib/guard-site-pay';
import {
  fetchMonthlySiteShiftRollup,
  type GuardEmpRow,
} from '../../../hq/deductions/lib/monthly-site-shifts';
import { payrollMonthFromFmPeriod } from '../../../../lib/deduction-month-lock-storage';
import { getPayrollWorkingDaysSettings } from '../../../executive/settings/actions';
import { requireFmPortfolioRead } from '../../lib/fm-portfolio-auth-server';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  type PayrollPeriod,
} from '../../lib/payroll-period';

export type SmTimesheetRollup = {
  smKey: string;
  sm: string;
  sector: string;
  guards: number;
  totalShifts: number;
  avgShifts: number;
};

export type SiteTimesheetRollup = {
  siteId: string;
  site: string;
  location: string;
  guards: number;
  shiftsProvided: number;
  shiftsClientRequested: number;
};

export type FmBatchTimesheetPayload = {
  periodLabel: string;
  payrollPeriod: PayrollPeriod;
  smRollups: SmTimesheetRollup[];
  siteRollups: SiteTimesheetRollup[];
  guardOpsEnabled: boolean;
  error?: string;
};

const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

function siteKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

function isClientGuardSite(row: {
  client_name?: unknown;
  site_name?: unknown;
  site_type?: unknown;
}): boolean {
  const clientName = String(row.client_name ?? '').trim();
  const siteName = String(row.site_name ?? '').trim();
  const siteType = String(row.site_type ?? '').trim().toUpperCase();

  if (
    clientName === 'Head Office' ||
    siteName === 'Head Office' ||
    siteType === 'OFFICE'
  ) {
    return false;
  }

  if (
    clientName.startsWith('Café') ||
    clientName.startsWith('Cafe') ||
    siteName.startsWith('Café') ||
    siteName.startsWith('Cafe')
  ) {
    return false;
  }

  return true;
}

function siteStaffingRequirement(requiredGuards: number, rateMatrix: unknown): number {
  const matrix = parseSiteRateMatrix(rateMatrix);
  const matrixTotal = Object.values(matrix).reduce((sum, entry) => sum + (entry?.qty ?? 0), 0);
  return Math.max(Number(requiredGuards) || 0, matrixTotal);
}

export async function getFmBatchTimesheetRollups(
  payrollPeriod: PayrollPeriod = FM_LIVE_PAYROLL_PERIOD,
): Promise<FmBatchTimesheetPayload> {
  noStore();

  const periodLabel = formatPayrollPeriodLabel(payrollPeriod, 'long');
  const base: FmBatchTimesheetPayload = {
    periodLabel,
    payrollPeriod,
    smRollups: [],
    siteRollups: [],
    guardOpsEnabled: CVS_GUARD_OPS_ENABLED,
  };

  if (!CVS_GUARD_OPS_ENABLED) {
    return base;
  }

  let companyId: string;
  try {
    ({ companyId } = await requireFmPortfolioRead());
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'Forbidden',
    };
  }

  const db = createSupabaseServiceClient();
  const payrollMonth = payrollMonthFromFmPeriod(payrollPeriod);
  const payrollMonthIso = `${payrollMonth}-01`;
  const workingDays = await getPayrollWorkingDaysSettings();
  const contractDays = Math.max(1, workingDays.soWorkingDays);

  const { data: guardData, error: guardError } = await db
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, site, group, status')
    .eq('company_id', companyId)
    .in('group', [...GUARD_GROUPS])
    .ilike('status', 'active')
    .order('full_name', { ascending: true });

  if (guardError) {
    return { ...base, error: guardError.message };
  }

  const guards = (guardData ?? []) as GuardEmpRow[];

  const [siteResult, shiftRollup, adjustmentResult] = await Promise.all([
    db
      .from('site_profiles')
      .select(
        'id, site_name, address, client_name, site_type, required_guards, rate_matrix, assigned_sm_epf, site_status',
      )
      .eq('company_id', companyId)
      .neq('site_status', 'ARCHIVED')
      .order('site_name', { ascending: true }),
    fetchMonthlySiteShiftRollup(db, guards, payrollMonthIso, companyId),
    db
      .from('fm_shift_adjustments')
      .select('site_key, employee_id, delta_shifts')
      .eq('company_id', companyId)
      .eq('payroll_month', payrollMonth),
  ]);

  if (siteResult.error) {
    return { ...base, error: siteResult.error.message };
  }

  const clientSites = (siteResult.data ?? []).filter(isClientGuardSite);
  const siteIdByKey = new Map(
    clientSites.map((site) => [String(site.id), siteKeyFromName(String(site.site_name))]),
  );

  const adjustmentDeltaBySiteEmployee = new Map<string, number>();
  for (const row of adjustmentResult.data ?? []) {
    const siteKey = siteIdByKey.get(String(row.site_key));
    if (!siteKey) continue;
    const adjKey = `${siteKey}:${row.employee_id}`;
    adjustmentDeltaBySiteEmployee.set(
      adjKey,
      (adjustmentDeltaBySiteEmployee.get(adjKey) ?? 0) + Number(row.delta_shifts ?? 0),
    );
  }

  const siteRollups: SiteTimesheetRollup[] = clientSites.map((site) => {
    const siteId = String(site.id);
    const siteName = String(site.site_name);
    const siteKey = siteKeyFromName(siteName);
    const byEmployee = shiftRollup.shiftCountBySite.get(siteKey);

    let shiftsProvided = 0;
    let guardCount = 0;

    if (byEmployee) {
      for (const [employeeId, count] of byEmployee) {
        const adjusted =
          count + (adjustmentDeltaBySiteEmployee.get(`${siteKey}:${employeeId}`) ?? 0);
        if (adjusted <= 0) continue;
        guardCount += 1;
        shiftsProvided += adjusted;
      }
    }

    const staffing = siteStaffingRequirement(
      Number(site.required_guards ?? 0),
      site.rate_matrix,
    );
    const shiftsClientRequested = staffing * contractDays;

    return {
      siteId,
      site: siteName,
      location: String(site.address ?? '').trim() || 'Address not on file',
      guards: guardCount,
      shiftsProvided,
      shiftsClientRequested,
    };
  });

  siteRollups.sort((a, b) => b.shiftsProvided - a.shiftsProvided || a.site.localeCompare(b.site));

  const smData = await fetchActiveSectorManagerRecordsForCompany(
    db,
    companyId,
    'emp_number, epf_no, epf_num, full_name, site, group, status',
  );

  const smNameByKey = new Map<string, { name: string; sector: string }>();
  for (const row of smData) {
    const meta = {
      name: String(row.full_name ?? sectorManagerEpfKey(row) ?? 'Sector Manager').trim(),
      sector: String(row.site ?? '').trim() || 'Sector not on file',
    };
    for (const key of collectSmEpfAliasKeys(row)) {
      smNameByKey.set(key, meta);
    }
    const canonical = sectorManagerEpfKey(row);
    if (canonical) smNameByKey.set(canonical, meta);
  }

  const smTotals = new Map<
    string,
    { name: string; sector: string; guards: Set<string>; totalShifts: number }
  >();

  for (const site of clientSites) {
    const smKey = normalizeSmEpf(site.assigned_sm_epf);
    if (!smKey) continue;

    const meta = smNameByKey.get(smKey) ?? {
      name: smKey,
      sector: 'Unassigned sector label',
    };

    let bucket = smTotals.get(smKey);
    if (!bucket) {
      bucket = { name: meta.name, sector: meta.sector, guards: new Set(), totalShifts: 0 };
      smTotals.set(smKey, bucket);
    }

    const siteKey = siteKeyFromName(String(site.site_name));
    const byEmployee = shiftRollup.shiftCountBySite.get(siteKey);
    if (!byEmployee) continue;

    for (const [employeeId, count] of byEmployee) {
      const adjusted =
        count + (adjustmentDeltaBySiteEmployee.get(`${siteKey}:${employeeId}`) ?? 0);
      if (adjusted <= 0) continue;
      bucket.guards.add(employeeId);
      bucket.totalShifts += adjusted;
    }
  }

  const smRollups: SmTimesheetRollup[] = [...smTotals.entries()]
    .map(([smKey, row]) => ({
      smKey,
      sm: row.name,
      sector: row.sector,
      guards: row.guards.size,
      totalShifts: row.totalShifts,
      avgShifts: row.guards.size > 0 ? row.totalShifts / row.guards.size : 0,
    }))
    .sort((a, b) => b.totalShifts - a.totalShifts || a.sm.localeCompare(b.sm));

  return {
    ...base,
    smRollups,
    siteRollups,
  };
}
