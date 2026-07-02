import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { isExecutiveRank } from './portal-role-utils';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';
import { createSupabaseServerClient } from '../../../packages/supabase/server';

export type PearsWebsiteClientAccessRole = 'buyer' | 'executive';

export type PearsWebsiteClientAccess = {
  companyId: string;
  companyName: string;
  companySlug: string | null;
  accessRole: PearsWebsiteClientAccessRole;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function websiteBuildCompanyIds(companyIds: string[]): Promise<Set<string>> {
  if (companyIds.length === 0) return new Set();

  const supabase = createSupabaseServiceClient();
  const eligible = new Set<string>();

  const [portfolioResult, purchaseResult] = await Promise.all([
    supabase
      .from('forge_partner_portfolios')
      .select('company_id')
      .in('company_id', companyIds)
      .eq('deal_type', 'website_build'),
    supabase
      .from('forge_product_purchases')
      .select('company_id, forge_product_catalog!inner(code)')
      .in('company_id', companyIds)
      .eq('forge_product_catalog.code', 'website_build'),
  ]);

  for (const row of portfolioResult.data ?? []) {
    eligible.add(String(row.company_id));
  }
  for (const row of purchaseResult.data ?? []) {
    if (row.company_id != null) eligible.add(String(row.company_id));
  }

  return eligible;
}

export async function listPearsWebsiteClientAccess(
  email: string | null | undefined,
): Promise<PearsWebsiteClientAccess[]> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return [];

  const supabase = createSupabaseServiceClient();
  const accessByCompany = new Map<string, PearsWebsiteClientAccess>();

  const { data: purchases, error: purchasesError } = await supabase
    .from('forge_product_purchases')
    .select('company_id, buyer_email, companies(id, name, slug), forge_product_catalog!inner(code)')
    .eq('forge_product_catalog.code', 'website_build')
    .ilike('buyer_email', normalized);

  if (purchasesError && purchasesError.code !== '42P01') {
    throw new Error(purchasesError.message);
  }

  for (const row of purchases ?? []) {
    const company = row.companies as Record<string, unknown> | null;
    const companyId = row.company_id != null ? String(row.company_id) : null;
    if (!companyId || !company) continue;

    accessByCompany.set(companyId, {
      companyId,
      companyName: String(company.name ?? 'Website client'),
      companySlug: company.slug != null ? String(company.slug) : null,
      accessRole: 'buyer',
    });
  }

  const { data: employees, error: employeesError } = await supabase
    .from('employees')
    .select('company_id, rank, companies(id, name, slug)')
    .ilike('email', normalized)
    .ilike('status', 'active');

  if (employeesError && employeesError.code !== '42P01') {
    throw new Error(employeesError.message);
  }

  const executiveCompanyIds: string[] = [];
  for (const row of employees ?? []) {
    const rank = String(row.rank ?? '');
    if (!isExecutiveRank(rank)) continue;
    const companyId = row.company_id != null ? String(row.company_id) : null;
    if (companyId) executiveCompanyIds.push(companyId);
  }

  const eligibleExecutive = await websiteBuildCompanyIds(executiveCompanyIds);
  for (const row of employees ?? []) {
    const companyId = row.company_id != null ? String(row.company_id) : null;
    if (!companyId || !eligibleExecutive.has(companyId)) continue;
    const rank = String(row.rank ?? '');
    if (!isExecutiveRank(rank)) continue;

    const company = row.companies as Record<string, unknown> | null;
    if (!company) continue;

    const existing = accessByCompany.get(companyId);
    accessByCompany.set(companyId, {
      companyId,
      companyName: String(company.name ?? 'Website client'),
      companySlug: company.slug != null ? String(company.slug) : null,
      accessRole: existing?.accessRole === 'buyer' ? 'buyer' : 'executive',
    });
  }

  return [...accessByCompany.values()].sort((a, b) =>
    a.companyName.localeCompare(b.companyName),
  );
}

export type PearsWebsiteClientSignInGate =
  | { ok: true }
  | { ok: false; reason: 'missing_email' | 'not_provisioned' | 'inactive' };

export async function assertPearsWebsiteClientCanSignIn(
  email: string | null | undefined,
): Promise<PearsWebsiteClientSignInGate> {
  if (!email?.trim()) return { ok: false, reason: 'missing_email' };
  const access = await listPearsWebsiteClientAccess(email);
  if (access.length === 0) return { ok: false, reason: 'not_provisioned' };
  return { ok: true };
}

export function pearsLoginErrorCode(
  reason: 'missing_email' | 'not_provisioned' | 'inactive',
): string {
  switch (reason) {
    case 'missing_email':
      return 'missing_email';
    case 'not_provisioned':
      return 'pears_denied';
    default:
      return 'pears_denied';
  }
}

export async function resolvePearsProfileEntryPath(email: string | null | undefined): Promise<string> {
  const access = await listPearsWebsiteClientAccess(email);
  if (access.length === 0) return '/login/pears';
  if (access.length === 1) {
    return `/pears/profile?company=${encodeURIComponent(access[0].companyId)}`;
  }
  return '/pears/profile';
}

export async function requirePearsWebsiteClientSession(companyId?: string | null) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error('Please sign in to manage your PEARS shop.');
  }

  const accessList = await listPearsWebsiteClientAccess(user.email);
  if (accessList.length === 0) {
    throw new Error('This Google account is not linked to a website client shop.');
  }

  const scopedCompanyId = companyId?.trim();
  const access = scopedCompanyId
    ? accessList.find((row) => row.companyId === scopedCompanyId) ?? null
    : accessList.length === 1
      ? accessList[0]
      : null;

  if (!access) {
    if (accessList.length > 1) {
      throw new Error('Select which shop profile to edit.');
    }
    throw new Error('Website client access not found.');
  }

  return {
    email: normalizeEmail(user.email),
    userId: user.id,
    access,
    accessList,
  };
}

export async function assertPearsWebsiteClientCompanyAccess(
  email: string | null | undefined,
  companyId: string,
): Promise<PearsWebsiteClientAccess | null> {
  const accessList = await listPearsWebsiteClientAccess(email);
  return accessList.find((row) => row.companyId === companyId) ?? null;
}

// validate executive via profile for buyer-only paths if needed later
export async function fetchPearsSessionProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  return { user, profile };
}
