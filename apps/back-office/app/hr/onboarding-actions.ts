'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import type { OnboardingGuardSite } from './onboarding-types';

export async function getOnboardingGuardSites(): Promise<OnboardingGuardSite[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  let query = supabase
    .from('site_profiles')
    .select('id, site_name, site_status')
    .neq('site_status', 'ARCHIVED')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[HR onboarding] site_profiles:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      id: String(row.id),
      siteName: String(row.site_name ?? '').trim(),
    }))
    .filter((row) => row.siteName.length > 0);
}
