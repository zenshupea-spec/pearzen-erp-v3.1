import 'server-only';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  canPerformFmPortfolioRead,
  canPerformFmPortfolioWrite,
} from './fm-portfolio-access';

export async function getAuthorizedFmPortfolioContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) throw new Error('No company context');

  return { supabase, user, profile, companyId };
}

export async function requireFmPortfolioWrite() {
  const ctx = await getAuthorizedFmPortfolioContext();
  if (!canPerformFmPortfolioWrite(ctx.profile)) throw new Error('Forbidden');
  return ctx;
}

export async function requireFmPortfolioRead() {
  const ctx = await getAuthorizedFmPortfolioContext();
  if (!canPerformFmPortfolioRead(ctx.profile)) throw new Error('Forbidden');
  return ctx;
}

export async function assertEmployeeBelongsToCompany(
  employeeId: string,
  companyId: string,
): Promise<void> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Employee not found for this tenant.');
  }
}
