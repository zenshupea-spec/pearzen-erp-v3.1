'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import {
  estimateSiteMonthlyTarget,
  loadLiveArMonthRevenue,
} from '../../lib/ar-invoicing/finance-revenue';
import { loadArBillingCycle } from '../../lib/ar-invoicing/billing-cycle';
import {
  asOfForCashflowGap,
  evaluateCollectionWarning,
  payrollLiabilityServiceMonth,
  proratedInvoiceTargetForDispatchDay,
} from '../../lib/ar-invoicing/cashflow-gap-math';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { normalizeCorporatePayrollGroup } from '../fm/lib/payroll-earnings-display';
import { nightsInCalendarMonth, shalomMonthRange } from '../../lib/shalom-calendar';
import { getPayrollStatutorySettings } from './settings/actions';
import { getLiveFieldRadar } from '../om/actions/field-radar';

const EXECUTIVE_RANK_META: Record<
  string,
  { label: string; accentClass: string }
> = {
  MD: { label: 'Managing Director', accentClass: 'bg-indigo-600' },
  OD: { label: 'Operations Developer', accentClass: 'bg-violet-600' },
};

export type ExecutiveSessionProfile = {
  fullName: string;
  rank: string;
  rankLabel: string;
  initials: string;
  accentClass: string;
  photoUrl: string | null;
  email: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return '?';
}

export async function fetchExecutiveSessionProfile(): Promise<ExecutiveSessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const rank = profile.role ?? 'OD';
  const meta = EXECUTIVE_RANK_META[rank] ?? {
    label: rank,
    accentClass: 'bg-slate-600',
  };

  const fullName =
    profile.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : user.email.split('@')[0] ?? 'User');

  const mnrPhoto = profile.id_photo_url?.trim() || null;

  return {
    fullName,
    rank,
    rankLabel: meta.label,
    initials: initialsFromName(fullName),
    accentClass: meta.accentClass,
    photoUrl: mnrPhoto,
    email: user.email,
  };
}

export type CompanyKey = 'security' | 'cafe' | 'bnb';

export type BreakdownItem = {
  label: string;
  value: number;
  sub?: string;
};

export type MonetaryHealth = {
  grossRevenue: number;
  grossLiabilities: number;
  netEbitda: number;
  targetInvoices: number;
  proratedTargetInvoices: number;
  actualInvoices: number;
  cashReceived: number;
  upcomingPayroll: number;
  invoiceDispatchDay: number;
  payrollTargetDay: number;
  serviceMonthKey: string;
  payrollServiceMonthKey: string;
  collectionWarningActive: boolean;
  collectionCashShortfall: number;
  collectionWarningDay: number;
  disputesSilenced: boolean;
  revenueBreakdown: BreakdownItem[];
  liabilityBreakdown: BreakdownItem[];
  ebitdaBreakdown: BreakdownItem[];
};

function zeroBreakdowns(): Pick<
  MonetaryHealth,
  'revenueBreakdown' | 'liabilityBreakdown' | 'ebitdaBreakdown'
> {
  return { revenueBreakdown: [], liabilityBreakdown: [], ebitdaBreakdown: [] };
}

function zero(): MonetaryHealth {
  return {
    grossRevenue: 0,
    grossLiabilities: 0,
    netEbitda: 0,
    targetInvoices: 0,
    proratedTargetInvoices: 0,
    actualInvoices: 0,
    cashReceived: 0,
    upcomingPayroll: 0,
    invoiceDispatchDay: 1,
    payrollTargetDay: 10,
    serviceMonthKey: '',
    payrollServiceMonthKey: '',
    collectionWarningActive: false,
    collectionCashShortfall: 0,
    collectionWarningDay: 6,
    disputesSilenced: false,
    ...zeroBreakdowns(),
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isCurrentCalendarMonth(year: number, month: number) {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() + 1 === month;
}

function employeeMatchesPayrollCohort(
  group: string | null | undefined,
  rank: string | null | undefined,
  cohort: 'security' | 'bnb',
) {
  const rawGroup = String(group ?? '').trim().toUpperCase();
  const normalizedGroup = normalizeCorporatePayrollGroup(group);
  const normalizedRank = String(rank ?? '').trim().toUpperCase();
  if (cohort === 'bnb') {
    return (
      rawGroup === 'SHALOM' ||
      normalizedRank === 'CARETAKER' ||
      normalizedRank === 'SHALOM_CARETAKER'
    );
  }
  if (rawGroup === 'CAFE' || rawGroup === 'SHALOM' || normalizedGroup === 'CAFE') return false;
  return true;
}

async function loadCafePosSalesForPeriod(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  monthStart: string,
  monthEnd: string,
  year: number,
  month: number,
) {
  if (isCurrentCalendarMonth(year, month)) {
    const { data: cafeSnaps } = await db
      .from('cafe_dashboard_snapshots')
      .select('payload')
      .eq('company_id', companyId);

    return (cafeSnaps ?? []).reduce((sum, row) => {
      const payload = row.payload as Record<string, unknown> | null;
      const mtd = Number(payload?.mtdSales ?? payload?.mtd_sales ?? payload?.posTotal ?? 0);
      return sum + (Number.isFinite(mtd) ? mtd : 0);
    }, 0);
  }

  const { data: orders } = await db
    .from('cafe_customer_orders')
    .select('total_lkr')
    .eq('company_id', companyId)
    .eq('status', 'COMPLETED')
    .gte('completed_at', `${monthStart}T00:00:00.000Z`)
    .lt('completed_at', `${monthEnd}T00:00:00.000Z`);

  return (orders ?? []).reduce((sum, row) => sum + Number(row.total_lkr ?? 0), 0);
}

async function loadShalomRentalRevenueForPeriod(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  year: number,
  month: number,
) {
  const { monthStart, monthEndExclusive } = shalomMonthRange(year, month);
  const { data: bookings } = await db
    .from('shalom_bookings')
    .select('total_revenue, channel, check_in, check_out, nights')
    .eq('company_id', companyId)
    .lt('check_in', monthEndExclusive)
    .gt('check_out', monthStart);

  return (bookings ?? []).reduce((sum, row) => {
    const channel = String(row.channel ?? '');
    if (channel === 'BLOCKED' || channel === 'AUTO_BLOCK') return sum;
    const checkIn = String(row.check_in).slice(0, 10);
    const checkOut = String(row.check_out).slice(0, 10);
    const totalRevenue = Number(row.total_revenue ?? 0);
    const nightsInMonth = nightsInCalendarMonth(checkIn, checkOut, year, month);
    if (nightsInMonth <= 0) return sum;
    const totalNights = Math.max(Number(row.nights ?? 0), 1);
    return sum + Math.round((totalRevenue * nightsInMonth) / totalNights);
  }, 0);
}

async function fetchPayrollLiabilities(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  year: number,
  month: number,
  cohort: 'security' | 'bnb',
) {
  const { data: payrollRun } = await db
    .from('payroll_runs')
    .select('gross_total, net_total')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', cohort)
    .maybeSingle();

  const payrollGrossFallback = Number(payrollRun?.gross_total ?? 0);
  const payrollNetFallback = Number(payrollRun?.net_total ?? payrollRun?.gross_total ?? 0);

  const { data: payslips } = await db
    .from('payslips')
    .select('net_pay, gross_pay, epf_employer, etf, profile_id')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (!payslips?.length) {
    const statutorySettings = await getPayrollStatutorySettings();
    const statutoryEmployer =
      payrollGrossFallback *
      ((statutorySettings.epfEmployerRate + statutorySettings.etfRate) / 100);
    return {
      guardPayroll: payrollNetFallback,
      hqPayroll: 0,
      statutoryEmployer,
    };
  }

  const profileIds = payslips
    .map((row) => row.profile_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const { data: employees } = profileIds.length
    ? await db.from('employees').select('id, group, rank').in('id', profileIds)
    : { data: [] as { id: string; group: string | null; rank: string | null }[] };

  const groupById = new Map((employees ?? []).map((row) => [row.id, row.group]));
  const rankById = new Map((employees ?? []).map((row) => [row.id, row.rank]));
  let guardPayroll = 0;
  let hqPayroll = 0;
  let statutoryEmployer = 0;

  for (const slip of payslips) {
    const profileId = String(slip.profile_id ?? '');
    const group = groupById.get(profileId);
    const rank = rankById.get(profileId);
    if (!employeeMatchesPayrollCohort(group, rank, cohort)) continue;

    const normalizedGroup = normalizeCorporatePayrollGroup(group);
    const netPay = Number(slip.net_pay ?? 0);
    if (normalizedGroup === 'HEAD_OFFICE') hqPayroll += netPay;
    else guardPayroll += netPay;
    statutoryEmployer += Number(slip.epf_employer ?? 0) + Number(slip.etf ?? 0);
  }

  if (statutoryEmployer <= 0 && payrollGrossFallback > 0) {
    const statutorySettings = await getPayrollStatutorySettings();
    statutoryEmployer =
      payrollGrossFallback *
      ((statutorySettings.epfEmployerRate + statutorySettings.etfRate) / 100);
  }

  return { guardPayroll, hqPayroll, statutoryEmployer };
}

async function resolveExecutiveCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

export async function fetchMonetaryHealth(
  companyKey: CompanyKey,
  year: number,
  month: number,
): Promise<MonetaryHealth> {
  noStore();
  try {
    const companyId = await resolveExecutiveCompanyId();
    if (!companyId) return zero();

    const db = createSupabaseServiceClient();
    const mk = monthKey(year, month);
    const monthStart = `${mk}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    let securityInvoicing = 0;
    let visitCharges = 0;
    let cafePosSales = 0;
    let residenceRental = 0;
    let cashReceived = 0;
    let targetInvoices = 0;
    let guardPayroll = 0;
    let hqPayroll = 0;
    let statutoryEmployer = 0;
    let opex = 0;
    let securityTotalInvoiced = 0;
    let proratedTargetInvoices = 0;
    let collectionWarningActive = false;
    let collectionCashShortfall = 0;
    let disputesSilenced = false;

    const billingCycle = await loadArBillingCycle(companyId);
    const invoiceDispatchDay = billingCycle.invoiceDispatchDay;
    const payrollTargetDay = billingCycle.payrollTargetDay;
    const collectionWarningDay = billingCycle.collectionWarningDay;
    const payrollPeriod =
      companyKey === 'security'
        ? payrollLiabilityServiceMonth(year, month)
        : { year, month, monthKey: mk };

    if (companyKey === 'security') {
      const liveAr = await loadLiveArMonthRevenue(db, companyId, mk);
      securityInvoicing = liveAr.rankInvoicing;
      visitCharges = liveAr.visitCharges;
      cashReceived = liveAr.cashReceived;
      securityTotalInvoiced = liveAr.totalInvoiced;

      const { data: sites } = await db
        .from('site_profiles')
        .select('rate_matrix, required_guards, site_status')
        .eq('company_id', companyId)
        .neq('site_status', 'ARCHIVED');

      targetInvoices = (sites ?? []).reduce(
        (sum, site) =>
          sum + estimateSiteMonthlyTarget(site.rate_matrix, Number(site.required_guards ?? 1)),
        0,
      );

      proratedTargetInvoices = proratedInvoiceTargetForDispatchDay(
        targetInvoices,
        mk,
        invoiceDispatchDay,
        asOfForCashflowGap(mk),
      );

      const warning = evaluateCollectionWarning({
        gapTarget: proratedTargetInvoices > 0 ? proratedTargetInvoices : targetInvoices,
        cashReceived,
        serviceMonthKey: mk,
        collectionWarningDay,
        silencedByDisputes: liveAr.disputedInMonth,
        asOf: asOfForCashflowGap(mk),
      });
      collectionWarningActive = warning.active;
      collectionCashShortfall = warning.shortfall;
      disputesSilenced = liveAr.disputedInMonth;
    }

    if (companyKey === 'cafe') {
      cafePosSales = await loadCafePosSalesForPeriod(
        db,
        companyId,
        monthStart,
        monthEnd,
        year,
        month,
      );
      securityInvoicing = 0;
      targetInvoices = cafePosSales > 0 ? Math.round(cafePosSales * 1.05) : 0;
    }

    if (companyKey === 'bnb') {
      residenceRental = await loadShalomRentalRevenueForPeriod(
        db,
        companyId,
        year,
        month,
      );
      securityInvoicing = 0;
      visitCharges = 0;
      cafePosSales = 0;
      targetInvoices = residenceRental > 0 ? Math.round(residenceRental * 1.1) : 0;
    }

    if (companyKey === 'cafe') {
      const { getCafePayrollCostForPeriod } = await import('./cafe/actions');
      const cafePayroll = await getCafePayrollCostForPeriod(`${mk}-01`, companyId);
      guardPayroll = cafePayroll.totalGrossLkr;
    } else {
      const payrollLiabilities = await fetchPayrollLiabilities(
        db,
        companyId,
        payrollPeriod.year,
        payrollPeriod.month,
        companyKey === 'bnb' ? 'bnb' : 'security',
      );
      guardPayroll = payrollLiabilities.guardPayroll;
      hqPayroll = payrollLiabilities.hqPayroll;
      statutoryEmployer = payrollLiabilities.statutoryEmployer;
    }

    const costCenter =
      companyKey === 'security' ? 'Security' : companyKey === 'cafe' ? 'Café' : 'BnB';
    const { data: bills } = await db
      .from('expense_bills')
      .select('amount, status')
      .eq('company_id', companyId)
      .eq('cost_center', costCenter)
      .gte('bill_date', monthStart)
      .lt('bill_date', monthEnd)
      .in('status', ['PENDING_APPROVAL', 'APPROVED']);

    opex = (bills ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const actualInvoices =
      companyKey === 'security'
        ? securityTotalInvoiced
        : companyKey === 'cafe'
          ? cafePosSales
          : residenceRental;

    const grossRevenue = actualInvoices;
    const upcomingPayroll = guardPayroll + hqPayroll;
    const grossLiabilities = upcomingPayroll + statutoryEmployer + opex;
    const netEbitda = grossRevenue - grossLiabilities;

    const revenueBreakdown: BreakdownItem[] =
      companyKey === 'security'
        ? [
            { label: 'Security Invoicing', value: securityInvoicing },
            { label: 'Client Visit Charges', value: visitCharges },
            { label: 'Café POS Sales', value: 0 },
            { label: 'Residence Rental Income', value: 0 },
          ]
        : companyKey === 'cafe'
          ? [
              { label: 'Security Invoicing', value: 0 },
              { label: 'Client Visit Charges', value: 0 },
              { label: 'Café POS Sales', value: cafePosSales },
              { label: 'Residence Rental Income', value: 0 },
            ]
          : [
              { label: 'Security Invoicing', value: 0 },
              { label: 'Client Visit Charges', value: 0 },
              { label: 'Café POS Sales', value: 0 },
              { label: 'Residence Rental Income', value: residenceRental },
            ];

    const liabilityBreakdown: BreakdownItem[] =
      companyKey === 'cafe'
        ? [
            { label: 'Café Labor (gross)', value: guardPayroll },
            {
              label: 'Statutory EPF (12%) & ETF (3%)',
              sub: 'Employer contribution liability',
              value: statutoryEmployer,
            },
            { label: 'HQ & Executive Payroll', value: hqPayroll },
            { label: 'Cleared OPEX & Vendor Bills', value: opex },
          ]
        : companyKey === 'bnb'
          ? [
              { label: 'Caretaker & Shalom Staff Payroll', value: guardPayroll },
              {
                label: 'Statutory EPF (12%) & ETF (3%)',
                sub: 'Employer contribution liability',
                value: statutoryEmployer,
              },
              { label: 'HQ & Executive Payroll', value: hqPayroll },
              { label: 'Cleared OPEX & Vendor Bills', value: opex },
            ]
          : [
              { label: 'Guard Base Payroll', value: guardPayroll },
              {
                label: 'Statutory EPF (12%) & ETF (3%)',
                sub: 'Employer contribution liability',
                value: statutoryEmployer,
              },
              { label: 'HQ & Executive Payroll', value: hqPayroll },
              { label: 'Cleared OPEX & Vendor Bills', value: opex },
            ];

    const ebitdaBreakdown: BreakdownItem[] =
      companyKey === 'security'
        ? [
            { label: 'Security Division Margin', value: netEbitda },
            { label: 'Café Division Margin', value: 0 },
            { label: 'Real Estate Margin', value: 0 },
          ]
        : companyKey === 'cafe'
          ? [
              { label: 'Security Division Margin', value: 0 },
              { label: 'Café Division Margin', value: netEbitda },
              { label: 'Real Estate Margin', value: 0 },
            ]
          : [
              { label: 'Security Division Margin', value: 0 },
              { label: 'Café Division Margin', value: 0 },
              { label: 'Real Estate Margin', value: netEbitda },
            ];

    return {
      grossRevenue,
      grossLiabilities,
      netEbitda,
      targetInvoices,
      proratedTargetInvoices,
      actualInvoices,
      cashReceived,
      upcomingPayroll,
      invoiceDispatchDay,
      payrollTargetDay,
      serviceMonthKey: mk,
      payrollServiceMonthKey: payrollPeriod.monthKey,
      collectionWarningActive,
      collectionCashShortfall,
      collectionWarningDay,
      disputesSilenced,
      revenueBreakdown,
      liabilityBreakdown,
      ebitdaBreakdown,
    };
  } catch (err) {
    console.error('fetchMonetaryHealth error:', err);
    return zero();
  }
}

export type NearbyOffDutyGuard = {
  name: string;
  empNo: string;
  distanceKm: number;
  phone: string;
  status: 'Off Duty' | 'On Leave';
};

export async function fetchOffDutyGuardsForSector(
  sectorName: string,
): Promise<NearbyOffDutyGuard[]> {
  noStore();
  const companyId = await resolveExecutiveCompanyId();
  if (!companyId) return [];

  const allocation = await getLiveFieldRadar();
  const onShift = new Set<string>();
  for (const sector of allocation.sectors) {
    for (const site of [...(sector.dayShiftShorts ?? []), ...(sector.nightShiftShorts ?? [])]) {
      for (const guard of site.missingGuards ?? []) {
        onShift.add(guard.toLowerCase());
      }
    }
  }

  const db = createSupabaseServiceClient();
  const { data: guards } = await db
    .from('employees')
    .select('emp_number, full_name, phone, site, status, group')
    .eq('company_id', companyId)
    .in('group', ['GUARD', 'GUARD_FIELD'])
    .ilike('status', 'active')
    .order('full_name', { ascending: true })
    .limit(40);

  const sectorNeedle = sectorName.trim().toLowerCase();
  return (guards ?? [])
    .filter((g) => {
      const name = String(g.full_name ?? '').toLowerCase();
      if (onShift.has(name)) return false;
      const site = String(g.site ?? '').toLowerCase();
      return !sectorNeedle || site.includes(sectorNeedle.slice(0, 6)) || sectorNeedle.includes(site.slice(0, 6));
    })
    .slice(0, 8)
    .map((g, index) => ({
      name: String(g.full_name ?? 'Guard'),
      empNo: String(g.emp_number ?? ''),
      distanceKm: Number((index + 1) * 1.8),
      phone: String(g.phone ?? ''),
      status: 'Off Duty' as const,
    }));
}
