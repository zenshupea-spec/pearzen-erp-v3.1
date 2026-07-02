'use server';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { getHeadOfficePortalAuthByEmployeeId } from '../../../lib/head-office-portal-auth';
import { staffPortalIdForRole } from '../../../lib/portal-isolation';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';

export type HeadOfficePortalStaffRow = {
  id: string;
  fullName: string;
  rank: string | null;
  email: string | null;
  epfNo: string | null;
  isUsernameLocked: boolean;
  loginUsername: string | null;
  lastOtpProvisionedAt: string | null;
};

function isHrDeskPortalCandidate(rank: string | null | undefined): boolean {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return false;
  if (isExecutiveRank(normalized)) return false;
  if (normalized === 'HR') return false;
  return staffPortalIdForRole(normalized) !== null;
}

export async function getHeadOfficePortalStaff(): Promise<HeadOfficePortalStaffRow[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  try {
    assertHrPortalEditor(profile.role);
  } catch {
    return [];
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  const service = createSupabaseServiceClient();

  let query = service
    .from('employees')
    .select('id, full_name, rank, email, epf_no, status, group')
    .ilike('group', 'HEAD_OFFICE')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);

  const { data: rows } = await query;
  if (!rows?.length) return [];

  const staff = rows
    .map((row) => {
      const rank = normalizePortalRole(row.rank as string | undefined);
      const email = typeof row.email === 'string' ? row.email.trim() : '';
      if (!email || !isHrDeskPortalCandidate(rank)) return null;

      return {
        id: String(row.id),
        fullName: typeof row.full_name === 'string' ? row.full_name : 'Staff',
        rank,
        email,
        epfNo:
          row.epf_no != null && String(row.epf_no).trim()
            ? String(row.epf_no).trim().toUpperCase()
            : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const enriched = await Promise.all(
    staff.map(async (person) => {
      const auth = await getHeadOfficePortalAuthByEmployeeId(person.id);
      return {
        ...person,
        isUsernameLocked: Boolean(auth?.is_username_locked),
        loginUsername: auth?.login_username ?? null,
        lastOtpProvisionedAt: auth?.last_otp_provisioned_at ?? null,
      };
    }),
  );

  return enriched;
}
