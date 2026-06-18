'use server';

import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  CLASSIC_VENTURE_COMPANY_ID,
  resolveCompanyIdForSession,
} from '../../lib/company-context-server';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export type HqHubKpis = {
  activePersonnel: number;
  inactivePersonnel: number;
  activeSites: number;
  pendingVerification: number;
};

export type HqHubProfile = {
  role: string;
  fullName: string | null;
};

async function countEmployees(
  filter: 'active' | 'inactive',
  companyId: string | null,
): Promise<number> {
  const service = createSupabaseServiceClient();
  let query = service.from('employees').select('id', { count: 'exact', head: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  if (filter === 'active') {
    query = query.ilike('status', 'active');
  } else {
    query = query.not('status', 'ilike', 'active');
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

const EMPTY_KPIS: HqHubKpis = {
  activePersonnel: 0,
  inactivePersonnel: 0,
  activeSites: 0,
  pendingVerification: 0,
};

export async function fetchHqHubKpis(): Promise<HqHubKpis> {
  try {
    const supabase = await createSupabaseServerClient();
    let companyId = await resolveCompanyIdForSession(supabase);
    if (!companyId) companyId = CLASSIC_VENTURE_COMPANY_ID;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return EMPTY_KPIS;
    }

    const service = createSupabaseServiceClient();

    const [activePersonnel, inactivePersonnel] = await Promise.all([
      countEmployees('active', companyId),
      countEmployees('inactive', companyId),
    ]);

    let activeSites = 0;
    const { count: siteCount } = await service
      .from('site_profiles')
      .select('id', { count: 'exact', head: true });
    activeSites = siteCount ?? 0;

    let pendingVerification = 0;
    const { count: pendingCount } = await service
      .from('attendance_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    pendingVerification = pendingCount ?? 0;

    return {
      activePersonnel,
      inactivePersonnel,
      activeSites,
      pendingVerification,
    };
  } catch {
    return EMPTY_KPIS;
  }
}
