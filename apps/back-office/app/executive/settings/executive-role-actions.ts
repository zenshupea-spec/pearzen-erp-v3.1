'use server';

import { revalidatePath } from 'next/cache';

import {
  isSingletonHrAssignablePortalRank,
  isRankValidForHrAssignment,
  ranksForHrAssignmentSelect,
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
  type RankPayEntry,
} from '../../../../../packages/rank-pay-matrix';
import {
  assertCanAssignRank,
  assertMnrEditAllowed,
} from '../../../lib/executive-rank-guard';
import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import {
  fetchHeadOfficeCorporateStaffForCompany,
  isHeadOfficeCorporateGroup,
  isHeadOfficeWorkforceStatus,
  normalizeCorporateGroup,
} from '../../../lib/head-office-corporate-staff';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  assertSingletonPortalRankAvailable,
  getOccupiedSingletonPortalRanks,
} from '../../../lib/singleton-portal-rank-guard';
import { auditStaffAction } from '../../../lib/staff-audit';
import { isExecutiveRank, normalizePortalRole } from '../../../lib/portal-role-utils';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { getRankPayMatrix } from './rank-matrix-actions';
import { getMdSettingsDb, resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

export type ExecutiveRoleHolder = {
  id: string;
  fullName: string;
  email: string | null;
  rank: string;
  portalProvisioned: boolean;
};

export type ExecutiveRoleSlot = {
  rankCode: (typeof SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS)[number];
  title: string;
  holder: ExecutiveRoleHolder | null;
};

export type ExecutiveRoleCandidate = {
  id: string;
  fullName: string;
  email: string | null;
  rank: string | null;
};

export type ExecutiveRolesPayload = {
  slots: ExecutiveRoleSlot[];
  candidates: ExecutiveRoleCandidate[];
  replacementRanks: RankPayEntry[];
  occupiedSingletonRanks: string[];
  sessionEmployeeId: string | null;
  sessionRole: string | null;
};

const ROLE_TITLES: Record<(typeof SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS)[number], string> = {
  MD: 'Managing Director',
  OD: 'Operations Director',
  FM: 'Finance Manager',
};

async function assertExecutiveRoleActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: 'Only MD or OD can manage executive roles.' as const };
  }

  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { error: portalGate.error as const };

  return {
    supabase,
    profile,
    user,
    editorLabel:
      profile.full_name?.trim() ||
      user.email?.split('@')[0] ||
      'Executive',
    editorRole: profile.role,
    sessionEmployeeId: profile.employeeId ?? null,
  };
}

async function fetchActiveHoEmployee(companyId: string, employeeId: string) {
  const db = getMdSettingsDb();
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, group, status, rank, company_id')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle();

  if (error || !data) return { error: 'Employee not found.' as const };
  if (!isHeadOfficeCorporateGroup(data.group)) {
    return { error: 'Executive roles apply to Head Office staff only.' as const };
  }
  if (!isHeadOfficeWorkforceStatus(data.status)) {
    return { error: 'Employee is not active.' as const };
  }

  return {
    employee: {
      id: String(data.id),
      fullName:
        typeof data.full_name === 'string' && data.full_name.trim()
          ? data.full_name.trim()
          : 'Unnamed staff',
      email: typeof data.email === 'string' ? data.email.trim() : null,
      rank: normalizePortalRole(data.rank as string | undefined),
      group: normalizeCorporateGroup(data.group),
    },
  };
}

async function findOtherActiveHoRankHolder(
  companyId: string,
  rankCode: string,
  excludeEmployeeId: string,
): Promise<boolean> {
  const db = getMdSettingsDb();
  const { data, error } = await db
    .from('employees')
    .select('id, rank, status, group')
    .eq('company_id', companyId);

  if (error) return false;

  return (data ?? []).some((row) => {
    if (String(row.id) === excludeEmployeeId) return false;
    if (!isHeadOfficeCorporateGroup(row.group)) return false;
    if (!isHeadOfficeWorkforceStatus(row.status)) return false;
    return String(row.rank ?? '').trim().toUpperCase() === rankCode;
  });
}

function revalidateExecutiveRoleConsumers() {
  revalidatePath('/executive/access');
  revalidatePath('/executive/settings');
  revalidatePath('/hr/mnr');
  revalidatePath('/hr/onboarding');
  revalidatePath('/fm');
  revalidatePath('/hq');
}

export async function getExecutiveRolesPayload(): Promise<
  ExecutiveRolesPayload | { error: string }
> {
  const actor = await assertExecutiveRoleActor();
  if ('error' in actor) return { error: actor.error };

  const companyId = await resolveExecutiveCompanyId(actor.supabase);
  const staff = await fetchHeadOfficeCorporateStaffForCompany(companyId);
  const matrix = await getRankPayMatrix();
  const occupiedSingletonRanks = await getOccupiedSingletonPortalRanks(companyId);

  const { getHeadOfficePortalAuthStatusesForEmployees } = await import(
    '../../../lib/head-office-portal-auth'
  );
  const portalAuth = await getHeadOfficePortalAuthStatusesForEmployees(
    staff.map((person) => person.id),
  );

  const slots: ExecutiveRoleSlot[] = SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS.map(
    (rankCode) => {
      const match = staff.find(
        (person) => (person.rank ?? '').trim().toUpperCase() === rankCode,
      );
      const holder = match
        ? {
            id: match.id,
            fullName: match.fullName,
            email: match.email,
            rank: match.rank ?? rankCode,
            portalProvisioned: Boolean(
              portalAuth[match.id]?.isProvisioned && portalAuth[match.id]?.isActive,
            ),
          }
        : null;
      return { rankCode, title: ROLE_TITLES[rankCode], holder };
    },
  );

  return {
    slots,
    candidates: staff.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      email: person.email,
      rank: person.rank,
    })),
    replacementRanks: ranksForHrAssignmentSelect(matrix, 'HEAD_OFFICE'),
    occupiedSingletonRanks,
    sessionEmployeeId: actor.sessionEmployeeId,
    sessionRole: actor.editorRole,
  };
}

export async function assignExecutiveRoleAction(
  employeeId: string,
  targetRank: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await assertExecutiveRoleActor();
    if ('error' in actor) return { success: false, error: actor.error };

    const rankCode = targetRank.trim().toUpperCase();
    if (!isSingletonHrAssignablePortalRank(rankCode)) {
      return { success: false, error: 'Choose MD, OD, or FM.' };
    }

    assertCanAssignRank(actor.editorRole, rankCode);

    const companyId = await resolveExecutiveCompanyId(actor.supabase);
    const employeeResult = await fetchActiveHoEmployee(companyId, employeeId);
    if ('error' in employeeResult) {
      return { success: false, error: employeeResult.error };
    }

    const { employee } = employeeResult;

    assertMnrEditAllowed({
      editorRole: actor.editorRole,
      employeeRank: employee.rank,
      newRank: rankCode,
    });

    if (!employee.email) {
      return {
        success: false,
        error: 'Set a work email on the MNR record before assigning this role.',
      };
    }

    const staff = await fetchHeadOfficeCorporateStaffForCompany(companyId);
    const existingHolder = staff.find(
      (person) =>
        person.id !== employeeId &&
        (person.rank ?? '').trim().toUpperCase() === rankCode,
    );
    if (existingHolder) {
      return {
        success: false,
        error: `${rankCode} is currently held by ${existingHolder.fullName}. Remove their role first, then assign the new holder.`,
      };
    }

    await assertSingletonPortalRankAvailable(rankCode, companyId, employeeId);

    const db = getMdSettingsDb();
    const { error } = await db
      .from('employees')
      .update({
        rank: rankCode,
        group: 'HEAD_OFFICE',
      })
      .eq('id', employeeId)
      .eq('company_id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase: actor.supabase,
      portal: 'hq',
      action: 'Executive Role Assigned',
      targetEntity: `${employee.fullName} (${employeeId})`,
      actorName: actor.editorLabel,
      actorRole: actor.editorRole ?? 'MD',
      details: {
        previousRank: employee.rank,
        newRank: rankCode,
        workEmail: employee.email,
      },
    });

    revalidateExecutiveRoleConsumers();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not assign executive role.',
    };
  }
}

export async function clearExecutiveRoleAction(
  employeeId: string,
  replacementRank: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await assertExecutiveRoleActor();
    if ('error' in actor) return { success: false, error: actor.error };

    const nextRank = replacementRank.trim().toUpperCase();
    if (!nextRank) {
      return { success: false, error: 'Choose a replacement rank.' };
    }
    if (isSingletonHrAssignablePortalRank(nextRank)) {
      return {
        success: false,
        error: 'Use Assign to swap MD, OD, or FM — pick a non-executive replacement rank here.',
      };
    }

    const companyId = await resolveExecutiveCompanyId(actor.supabase);
    const employeeResult = await fetchActiveHoEmployee(companyId, employeeId);
    if ('error' in employeeResult) {
      return { success: false, error: employeeResult.error };
    }

    const { employee } = employeeResult;
    const currentRank = employee.rank;
    if (!currentRank || !isSingletonHrAssignablePortalRank(currentRank)) {
      return {
        success: false,
        error: 'This employee does not hold an MD, OD, or FM role.',
      };
    }

    assertMnrEditAllowed({
      editorRole: actor.editorRole,
      employeeRank: currentRank,
      newRank: nextRank,
    });

    const matrix = await getRankPayMatrix();
    if (!isRankValidForHrAssignment(matrix, 'HEAD_OFFICE', nextRank)) {
      return {
        success: false,
        error: `Rank "${nextRank}" is not valid for Head Office. Add it in MD Settings → Rank Pay Matrix first.`,
      };
    }

    if (
      actor.sessionEmployeeId === employeeId &&
      currentRank === 'MD' &&
      nextRank !== 'MD'
    ) {
      const hasOtherMd = await findOtherActiveHoRankHolder(
        companyId,
        'MD',
        employeeId,
      );
      if (!hasOtherMd) {
        return {
          success: false,
          error: 'Assign another MD before removing your own MD rank.',
        };
      }
    }

    const db = getMdSettingsDb();
    const { error } = await db
      .from('employees')
      .update({
        rank: nextRank,
        group: 'HEAD_OFFICE',
      })
      .eq('id', employeeId)
      .eq('company_id', companyId);

    if (error) {
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase: actor.supabase,
      portal: 'hq',
      action: 'Executive Role Cleared',
      targetEntity: `${employee.fullName} (${employeeId})`,
      actorName: actor.editorLabel,
      actorRole: actor.editorRole ?? 'MD',
      details: {
        previousRank: currentRank,
        newRank: nextRank,
      },
    });

    revalidateExecutiveRoleConsumers();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not clear executive role.',
    };
  }
}
