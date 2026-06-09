'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access';

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

export type MonetaryHealth = {
  grossRevenue: number;
  grossLiabilities: number;
  netEbitda: number;
  targetInvoices: number;
  actualInvoices: number;
  cashReceived: number;
  upcomingPayroll: number;
};

function zero(): MonetaryHealth {
  return {
    grossRevenue: 0,
    grossLiabilities: 0,
    netEbitda: 0,
    targetInvoices: 0,
    actualInvoices: 0,
    cashReceived: 0,
    upcomingPayroll: 0,
  };
}

export async function fetchMonetaryHealth(
  companyKey: CompanyKey,
  year: number,
  month: number,
): Promise<MonetaryHealth> {
  try {
    const supabase = await createSupabaseServerClient();

    // Resolve company_id by slug convention (graceful fallback if table differs)
    const slugMap: Record<CompanyKey, string> = {
      security: 'security',
      cafe: 'cafe',
      bnb: 'bnb',
    };

    const { data: companies } = await supabase
      .from('companies')
      .select('id')
      .ilike('slug', `%${slugMap[companyKey]}%`)
      .limit(1);

    const companyId = companies?.[0]?.id;
    if (!companyId) return zero();

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // --- Revenue: sum of issued invoices ---
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, status, cash_received')
      .eq('company_id', companyId)
      .gte('issued_date', monthStart)
      .lt('issued_date', monthEnd);

    const actualInvoices = invoices?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0;
    const cashReceived = invoices?.reduce((s, r) => s + (r.cash_received ?? 0), 0) ?? 0;

    // --- Target invoices: sum of active contracts ---
    const { data: contracts } = await supabase
      .from('contracts')
      .select('monthly_value')
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE');

    const targetInvoices = contracts?.reduce((s, r) => s + (r.monthly_value ?? 0), 0) ?? 0;

    // --- Payroll liability ---
    const { data: payrollRows } = await supabase
      .from('payroll_batches')
      .select('net_payroll')
      .eq('company_id', companyId)
      .gte('payroll_month', monthStart)
      .lt('payroll_month', monthEnd);

    const upcomingPayroll = payrollRows?.reduce((s, r) => s + (r.net_payroll ?? 0), 0) ?? 0;

    // --- OPEX bills (liabilities) ---
    const { data: bills } = await supabase
      .from('expense_bills')
      .select('amount')
      .eq('company_id', companyId)
      .gte('bill_date', monthStart)
      .lt('bill_date', monthEnd);

    const opex = bills?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0;

    const grossRevenue = actualInvoices;
    const grossLiabilities = upcomingPayroll + opex;
    const netEbitda = grossRevenue - grossLiabilities;

    return {
      grossRevenue,
      grossLiabilities,
      netEbitda,
      targetInvoices,
      actualInvoices,
      cashReceived,
      upcomingPayroll,
    };
  } catch (err) {
    console.error('fetchMonetaryHealth error:', err);
    return zero();
  }
}
