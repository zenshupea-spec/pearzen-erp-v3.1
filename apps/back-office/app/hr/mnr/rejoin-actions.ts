'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { assertCanChangeEmployeeStatus } from '../../../lib/executive-rank-guard';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { auditStaffAction } from '../../../lib/staff-audit';
import { getGuardRatingMapByEmployeeId } from '../../om/guard-cards/actions';

export type MnrRejoinDeskMeta = {
  blacklistedByEmployeeId: Record<
    string,
    { reason: string; blacklistedAt: string; blacklistedByName: string }
  >;
  guardRatingByEmployeeId: Record<string, { rating: number; tier: string }>;
};

function isResignedStatus(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'resigned';
}

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);
  return { supabase, profile };
}

export async function getMnrRejoinDeskMeta(
  employeeIds: string[],
): Promise<MnrRejoinDeskMeta> {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return { blacklistedByEmployeeId: {}, guardRatingByEmployeeId: {} };
  }

  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) {
    return { blacklistedByEmployeeId: {}, guardRatingByEmployeeId: {} };
  }

  const db = createSupabaseServiceClient();
  const { data: blacklistRows } = await db
    .from('guard_blacklist_vault')
    .select('employee_id, reason, blacklisted_at, blacklisted_by_name')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .in('employee_id', uniqueIds);

  const blacklistedByEmployeeId: MnrRejoinDeskMeta['blacklistedByEmployeeId'] = {};
  for (const row of blacklistRows ?? []) {
    blacklistedByEmployeeId[String(row.employee_id)] = {
      reason: String(row.reason ?? ''),
      blacklistedAt: String(row.blacklisted_at ?? ''),
      blacklistedByName: String(row.blacklisted_by_name ?? '—'),
    };
  }

  const guardRatingByEmployeeId = await getGuardRatingMapByEmployeeId(uniqueIds);

  return { blacklistedByEmployeeId, guardRatingByEmployeeId };
}

export async function rejoinEmployee(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, profile } = await requireHrEditor();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
    const { data: employee, error: fetchError } = await db
      .from('employees')
      .select('id, full_name, rank, status, group')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError || !employee) {
      return { ok: false, error: 'Employee not found.' };
    }
    if (!isResignedStatus(employee.status)) {
      return { ok: false, error: 'Only resigned employees can be rejoined from this desk.' };
    }

    assertCanChangeEmployeeStatus(profile.role, employee.rank);

    const { data: blacklistRow } = await db
      .from('guard_blacklist_vault')
      .select('id, reason')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (blacklistRow) {
      return {
        ok: false,
        error:
          'This guard is blacklisted and cannot be rejoined until MD or OD approves removal from the blacklist vault.',
      };
    }

    const { error: updateError } = await db
      .from('employees')
      .update({ status: 'ACTIVE' })
      .eq('id', employeeId)
      .eq('company_id', companyId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: 'Rejoin Employee',
      targetEntity: `${employee.full_name ?? employeeId}`,
      details: { employeeId },
    });

    revalidatePath('/hr/mnr');
    revalidatePath('/hr');
    revalidatePath('/om/guard-cards');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to rejoin employee.' };
  }
}
