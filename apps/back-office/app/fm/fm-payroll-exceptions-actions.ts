'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { canAccessPathViaPortalRbac } from '../../../../packages/portal-rbac';

export type SalaryOverrideRecord = {
  id: string;
  name: string;
  rank: string;
  company: string;
  defaultPay: number;
  overridePay: number;
  requestedBy: string;
  reason: string;
  date: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export type ResignationDebtRecord = {
  id: string;
  empNo: string;
  name: string;
  rank: string;
  company: string;
  inactiveDate: string;
  category: 'AWOL' | 'RESIGNED';
  uniformDebt: number;
  advanceDebt: number;
  fmConfirmed: boolean;
  status: 'LOCKED' | 'PENDING_WRITEOFF' | 'WRITTEN_OFF';
};

const PENDING_SALARY_STATUSES = ['PENDING_FM', 'PENDING_MD'] as const;

function canPerformFmExceptionWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm/exceptions', profile.portalRbac ?? undefined, {
      writeRequired: true,
    });
  }
  return false;
}

async function resolveFmCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function requireFmExceptionActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canPerformFmExceptionWrite(profile)) {
    return { error: 'Forbidden — FM action required.' as const };
  }

  return { user, profile };
}

function revalidateExceptionPaths() {
  revalidatePath('/fm/exceptions');
  revalidatePath('/fm');
  revalidatePath('/executive/finance');
  revalidatePath('/executive/matrix');
}

export async function fetchFmHrPayrollExceptions(): Promise<{
  overrides: SalaryOverrideRecord[];
  debts: ResignationDebtRecord[];
}> {
  noStore();
  const companyId = await resolveFmCompanyId();
  if (!companyId) return { overrides: [], debts: [] };

  const db = createSupabaseServiceClient();

  const { data: overrideRows } = await db
    .from('employees')
    .select(
      'id, full_name, rank, group, custom_salary, base_salary, basic_salary, salary_approval_status, updated_at',
    )
    .eq('company_id', companyId)
    .in('salary_approval_status', [...PENDING_SALARY_STATUSES]);

  const overrides: SalaryOverrideRecord[] = (overrideRows ?? []).map((row) => {
    const defaultPay = Number(row.base_salary ?? row.basic_salary ?? 0);
    const overridePay = Number(row.custom_salary ?? defaultPay);
    const group = String(row.group ?? '').toUpperCase();
    const company =
      group.includes('CAFE') ? 'Café' : group.includes('BNB') ? 'BnB' : 'Security';
    return {
      id: String(row.id),
      name: String(row.full_name ?? 'Unknown'),
      rank: String(row.rank ?? ''),
      company,
      defaultPay,
      overridePay,
      requestedBy: 'HR Admin',
      reason: 'Custom salary pending FM approval',
      date: String(row.updated_at ?? new Date().toISOString()).slice(0, 10),
      status: 'PENDING',
    };
  });

  const { data: debtRows } = await db
    .from('employees')
    .select(
      'id, full_name, emp_number, rank, group, status, uniform_balance, accom_balance, hr_offboarding_sent_to_fm_at, fm_offboarding_payment_confirmed_at, updated_at',
    )
    .eq('company_id', companyId)
    .not('hr_offboarding_sent_to_fm_at', 'is', null);

  const debts: ResignationDebtRecord[] = (debtRows ?? [])
    .filter((row) => {
      const uniform = Number(row.uniform_balance ?? 0);
      const advance = Number(row.accom_balance ?? 0);
      return uniform + advance > 0;
    })
    .map((row) => {
      const statusRaw = String(row.status ?? '').toUpperCase();
      const category: 'AWOL' | 'RESIGNED' =
        statusRaw.includes('AWOL') || statusRaw.includes('INACTIVE') ? 'AWOL' : 'RESIGNED';
      const fmConfirmed = Boolean(row.fm_offboarding_payment_confirmed_at);
      return {
        id: String(row.id),
        empNo: String(row.emp_number ?? ''),
        name: String(row.full_name ?? ''),
        rank: String(row.rank ?? ''),
        company: 'Security',
        inactiveDate: String(row.updated_at ?? new Date().toISOString()).slice(0, 10),
        category,
        uniformDebt: Number(row.uniform_balance ?? 0),
        advanceDebt: Number(row.accom_balance ?? 0),
        fmConfirmed,
        status: fmConfirmed ? 'PENDING_WRITEOFF' : 'LOCKED',
      };
    });

  return { overrides, debts };
}

export async function approveFmSalaryOverride(
  employeeId: string,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireFmExceptionActor();
  if ('error' in actor) return { success: false, error: actor.error };

  const db = createSupabaseServiceClient();
  const { error } = await db
    .from('employees')
    .update({
      salary_approval_status: 'APPROVED',
      requires_md_approval: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };
  revalidateExceptionPaths();
  return { success: true };
}

export async function rejectFmSalaryOverride(
  employeeId: string,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireFmExceptionActor();
  if ('error' in actor) return { success: false, error: actor.error };

  const db = createSupabaseServiceClient();
  const { error } = await db
    .from('employees')
    .update({
      salary_approval_status: 'REJECTED',
      custom_salary: null,
      requires_md_approval: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };
  revalidateExceptionPaths();
  return { success: true };
}

export async function writeOffFmResignationDebt(
  employeeId: string,
): Promise<{ success: boolean; error?: string }> {
  const actor = await requireFmExceptionActor();
  if ('error' in actor) return { success: false, error: actor.error };

  const db = createSupabaseServiceClient();
  const { data: row, error: fetchError } = await db
    .from('employees')
    .select('fm_offboarding_payment_confirmed_at, uniform_balance, accom_balance')
    .eq('id', employeeId)
    .maybeSingle();

  if (fetchError) return { success: false, error: fetchError.message };
  if (!row?.fm_offboarding_payment_confirmed_at) {
    return {
      success: false,
      error: 'Confirm recovery in Payroll before writing off this debt.',
    };
  }

  const { error } = await db
    .from('employees')
    .update({
      uniform_balance: 0,
      accom_balance: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (error) return { success: false, error: error.message };
  revalidateExceptionPaths();
  return { success: true };
}
