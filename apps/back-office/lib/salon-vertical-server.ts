import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { resolveCompanyIdForSession } from './company-context-server';
import { verticalIsEnabled, isTenantVerticalStatus, type TenantVerticalStatus } from './tenant-verticals';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

export const SALON_HUB_PATH = '/salon';

export function canAccessSalonDesk(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  if (!normalized) return false;
  if (isExecutiveRank(normalized)) return true;
  return normalized === 'HR' || normalized === 'FM';
}

export async function isSalonVerticalEnabled(companyId: string): Promise<boolean> {
  if (!companyId?.trim()) return false;

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('tenant_vertical_subscriptions')
    .select('status')
    .eq('company_id', companyId.trim())
    .eq('vertical', 'salon')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return false;
    console.warn('salon-vertical: subscription read failed', error.message);
    return false;
  }

  const rawStatus = data?.status;
  const status: TenantVerticalStatus = isTenantVerticalStatus(String(rawStatus ?? ''))
    ? (rawStatus as TenantVerticalStatus)
    : 'inactive';

  return verticalIsEnabled(status);
}

export async function isSalonVerticalEnabledForSession(): Promise<boolean> {
  const { createSupabaseServerClient } = await import('../../../packages/supabase/server');
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return false;
  return isSalonVerticalEnabled(companyId);
}

export async function assertSalonVerticalAccessForSession(
  role: string | null | undefined,
): Promise<{ companyId: string } | { error: string }> {
  if (!canAccessSalonDesk(role)) {
    return { error: 'You are not authorised to access the salon desk.' };
  }

  const { createSupabaseServerClient } = await import('../../../packages/supabase/server');
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return { error: 'Could not resolve tenant company for this session.' };
  }

  const enabled = await isSalonVerticalEnabled(companyId);
  if (!enabled) {
    return {
      error:
        'Salon vertical is not active for this tenant. Enable it in Forge → Module Provisioning.',
    };
  }

  return { companyId };
}
