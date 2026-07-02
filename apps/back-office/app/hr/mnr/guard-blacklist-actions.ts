'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
} from '../../../lib/hr-portal-access-server';
import { auditStaffAction } from '../../../lib/staff-audit';

const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

function isFieldGuardGroup(group: unknown): boolean {
  return GUARD_GROUPS.has(String(group ?? '').trim().toUpperCase());
}

function resolveEmpNumber(employee: {
  emp_number?: string | null;
  epf_no?: string | number | null;
  epf_num?: string | number | null;
}): string | null {
  if (employee.emp_number) return String(employee.emp_number).trim().toUpperCase();
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf != null) return String(epf).trim().toUpperCase();
  return null;
}

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  const name =
    profile.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email ||
    profile.role;

  return {
    supabase,
    userId: user.id,
    editorLabel: formatHrPortalEditorLabel(name, profile.role),
  };
}

function revalidateGuardBlacklistPaths() {
  revalidatePath('/hr/mnr');
  revalidatePath('/om/guard-cards');
  revalidatePath('/om/guard-cards/blacklisted');
}

export type HrGuardBlacklistEntry = {
  id: string;
  reason: string;
  blacklistedAt: string;
  blacklistedByName: string;
};

export async function getHrGuardBlacklistForEmployee(
  employeeId: string,
): Promise<HrGuardBlacklistEntry | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return null;

  const db = createSupabaseServiceClient();
  const { data } = await db
    .from('guard_blacklist_vault')
    .select('id, reason, blacklisted_at, blacklisted_by_name')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!data) return null;

  return {
    id: String(data.id),
    reason: String(data.reason ?? ''),
    blacklistedAt: String(data.blacklisted_at ?? ''),
    blacklistedByName: String(data.blacklisted_by_name ?? '—'),
  };
}

export async function hrBlacklistGuard(
  employeeId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      return { success: false, error: 'A reason is required for blacklist.' };
    }

    const { supabase, userId, editorLabel } = await requireHrEditor();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) {
      return { success: false, error: 'Could not resolve company for this session.' };
    }

    const db = createSupabaseServiceClient();
    const { data: employee, error: empError } = await db
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, full_name, rank, group, status, site')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (empError || !employee) {
      return { success: false, error: 'Guard not found.' };
    }
    if (!isFieldGuardGroup(employee.group)) {
      return { success: false, error: 'Only field guards can be blacklisted.' };
    }

    const empNumber = resolveEmpNumber(employee);
    if (!empNumber) {
      return { success: false, error: 'Guard has no EPF number on file.' };
    }

    const { data: existing } = await db
      .from('guard_blacklist_vault')
      .select('id')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'This guard is already blacklisted.' };
    }

    const { error } = await db.from('guard_blacklist_vault').insert({
      company_id: companyId,
      employee_id: employee.id,
      emp_number: empNumber,
      guard_name: employee.full_name,
      guard_rank: employee.rank,
      reason: trimmedReason,
      blacklisted_by: userId,
      blacklisted_by_name: editorLabel,
      status: 'ACTIVE',
    });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'This guard is already blacklisted.' };
      }
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: 'Blacklist Guard',
      targetEntity: `${employee.full_name ?? empNumber} (${empNumber})`,
      details: { employeeId, reason: trimmedReason },
    });

    revalidateGuardBlacklistPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to blacklist guard.',
    };
  }
}
