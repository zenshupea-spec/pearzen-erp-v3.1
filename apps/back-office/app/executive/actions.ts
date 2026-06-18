'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
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
  actualInvoices: number;
  cashReceived: number;
  upcomingPayroll: number;
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
    actualInvoices: 0,
    cashReceived: 0,
    upcomingPayroll: 0,
    ...zeroBreakdowns(),
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function estimateSiteMonthlyTarget(rateMatrix: unknown, requiredGuards: number): number {
  const matrix = (rateMatrix ?? {}) as Record<string, { invoiceRate?: number; qty?: number } | number>;
  let total = 0;
  for (const [key, entry] of Object.entries(matrix)) {
    if (typeof entry === 'number') {
      total += entry * 26;
      continue;
    }
    const rate = Number(entry?.invoiceRate ?? entry ?? 0);
    const qty = Number(entry?.qty ?? requiredGuards ?? 1);
    total += rate * qty * 26;
  }
  return total;
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

    if (companyKey === 'security' || companyKey === 'cafe' || companyKey === 'bnb') {
      const { data: arRows } = await db
        .from('ar_invoices')
        .select('total_amount_lkr, month_key, payload')
        .eq('company_id', companyId)
        .eq('month_key', mk);

      securityInvoicing = (arRows ?? []).reduce((s, r) => s + Number(r.total_amount_lkr ?? 0), 0);

      const { data: snapshot } = await db
        .from('ar_ledger_snapshots')
        .select('clients')
        .eq('company_id', companyId)
        .maybeSingle();

      if (snapshot?.clients && typeof snapshot.clients === 'object') {
        for (const client of Object.values(snapshot.clients as Record<string, { invoices?: Record<string, { amountReceived?: number; totalAmount?: number; patrols?: { charge?: number }[] }> }>)) {
          const cell = client.invoices?.[mk];
          if (!cell) continue;
          cashReceived += Number(cell.amountReceived ?? 0);
          visitCharges += (cell.patrols ?? []).reduce((s, p) => s + Number(p.charge ?? 0), 0);
        }
      }

      const { data: sites } = await db
        .from('site_profiles')
        .select('rate_matrix, required_guards, site_status')
        .eq('company_id', companyId)
        .neq('site_status', 'ARCHIVED');

      targetInvoices = (sites ?? []).reduce(
        (s, site) => s + estimateSiteMonthlyTarget(site.rate_matrix, Number(site.required_guards ?? 1)),
        0,
      );
    }

    if (companyKey === 'cafe') {
      const { data: cafeSnaps } = await db
        .from('cafe_dashboard_snapshots')
        .select('payload')
        .eq('company_id', companyId);

      cafePosSales = (cafeSnaps ?? []).reduce((s, row) => {
        const payload = row.payload as Record<string, unknown> | null;
        const mtd =
          Number(payload?.mtdSales ?? payload?.mtd_sales ?? payload?.posTotal ?? 0);
        return s + mtd;
      }, 0);
      securityInvoicing = 0;
      targetInvoices = cafePosSales > 0 ? Math.round(cafePosSales * 1.05) : targetInvoices;
    }

    if (companyKey === 'bnb') {
      const { data: bookings } = await db
        .from('shalom_bookings')
        .select('total_revenue, check_in')
        .eq('company_id', companyId)
        .gte('check_in', monthStart)
        .lt('check_in', monthEnd);

      residenceRental = (bookings ?? []).reduce((s, b) => s + Number(b.total_revenue ?? 0), 0);
      securityInvoicing = 0;
      visitCharges = 0;
      cafePosSales = 0;
      targetInvoices = residenceRental > 0 ? Math.round(residenceRental * 1.1) : 0;
    }

    const payrollGroup = companyKey === 'cafe' ? 'cafe' : 'security';
    const { data: payrollRun } = await db
      .from('payroll_runs')
      .select('gross_total, net_total')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', payrollGroup)
      .maybeSingle();

    guardPayroll = Number(payrollRun?.net_total ?? payrollRun?.gross_total ?? 0);
    statutoryEmployer = Number(payrollRun?.gross_total ?? 0) * 0.15;

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
        ? securityInvoicing + visitCharges
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

    const liabilityBreakdown: BreakdownItem[] = [
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
      actualInvoices,
      cashReceived,
      upcomingPayroll,
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
