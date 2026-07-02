'use server';

import { unstable_noStore as noStore } from 'next/cache';
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
} from '../../../lib/hr-portal-access-server';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  fetchIssuedUniformHistory,
  hasIssuedUniforms,
  isMissingUniformCollectionTable,
  normalizeGuardEpf,
  parseUniformItemsFromJsonb,
} from '../../../lib/uniform-collection/issued-history';
import type {
  UniformCollectionCaseRow,
  UniformCollectionCaseStatus,
  UniformCollectionItemLine,
} from '../../../lib/uniform-collection/types';

async function requireHrRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  return { supabase, userId: user.id };
}

function revalidateUniformCollectionPaths() {
  revalidatePath('/hr/mnr');
  revalidatePath('/hq/deductions/uniform-collecting');
}

type EmployeeUniformRow = {
  id: string;
  company_id: string;
  emp_number?: string | null;
  epf_no?: string | number | null;
  epf_num?: string | number | null;
  full_name?: string | null;
};

function employeeGuardEpf(emp: EmployeeUniformRow): string | null {
  if (emp.emp_number) return normalizeGuardEpf(String(emp.emp_number));
  const epf = emp.epf_no ?? emp.epf_num;
  if (epf != null) return normalizeGuardEpf(String(epf));
  return null;
}

function mapUniformCollectionCase(row: Record<string, unknown>): UniformCollectionCaseRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    guardEpf: normalizeGuardEpf(String(row.guard_epf ?? '')),
    status: String(row.status) as UniformCollectionCaseStatus,
    issuedItems: parseUniformItemsFromJsonb(row.issued_items),
    returnedItems: parseUniformItemsFromJsonb(row.returned_items),
    adminNotes: (row.admin_notes as string | null) ?? null,
    requestedAt: String(row.requested_at),
    requestedBy: (row.requested_by as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type UniformCollectionStatus = {
  required: boolean;
  issuedLines: UniformCollectionItemLine[];
  case: UniformCollectionCaseRow | null;
  isCollected: boolean;
  isPending: boolean;
  isDemo: boolean;
};

async function resolveEmployeeForUniformCollection(
  employeeId: string,
): Promise<{ employee: EmployeeUniformRow; companyId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return { error: 'Could not resolve company for this session.' };

  const db = createSupabaseServiceClient();
  const { data: employee, error } = await db
    .from('employees')
    .select('id, company_id, emp_number, epf_no, epf_num, full_name')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !employee) return { error: 'Employee not found.' };
  return { employee: employee as EmployeeUniformRow, companyId };
}

async function fetchLatestUniformCollectionCase(
  db: ReturnType<typeof createSupabaseServiceClient>,
  employeeId: string,
): Promise<{ pending: UniformCollectionCaseRow | null; confirmed: UniformCollectionCaseRow | null; isDemo: boolean }> {
  const { data, error } = await db
    .from('uniform_collection_cases')
    .select(
      'id, company_id, employee_id, guard_epf, status, issued_items, returned_items, admin_notes, requested_at, requested_by, confirmed_at, confirmed_by, created_at, updated_at',
    )
    .eq('employee_id', employeeId)
    .in('status', ['PENDING', 'CONFIRMED'])
    .order('requested_at', { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingUniformCollectionTable(error.message)) {
      return { pending: null, confirmed: null, isDemo: true };
    }
    throw new Error(error.message);
  }

  let pending: UniformCollectionCaseRow | null = null;
  let confirmed: UniformCollectionCaseRow | null = null;
  for (const row of data ?? []) {
    const mapped = mapUniformCollectionCase(row as Record<string, unknown>);
    if (mapped.status === 'PENDING' && !pending) pending = mapped;
    if (mapped.status === 'CONFIRMED' && !confirmed) confirmed = mapped;
    if (pending && confirmed) break;
  }

  return { pending, confirmed, isDemo: false };
}

export async function getUniformCollectionStatusForEmployee(
  employeeId: string,
): Promise<UniformCollectionStatus> {
  noStore();

  const resolved = await resolveEmployeeForUniformCollection(employeeId);
  if ('error' in resolved) {
    return {
      required: false,
      issuedLines: [],
      case: null,
      isCollected: false,
      isPending: false,
      isDemo: false,
    };
  }

  const { employee, companyId } = resolved;
  const guardEpf = employeeGuardEpf(employee);
  const db = createSupabaseServiceClient();

  const issuedLines = guardEpf
    ? await fetchIssuedUniformHistory(db, companyId, guardEpf)
    : [];
  const required = hasIssuedUniforms(issuedLines);

  const { pending, confirmed, isDemo } = await fetchLatestUniformCollectionCase(db, employeeId);
  const activeCase = pending ?? confirmed;

  return {
    required,
    issuedLines,
    case: activeCase,
    isCollected: Boolean(confirmed),
    isPending: Boolean(pending),
    isDemo,
  };
}

export async function requestUniformCollection(
  employeeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId } = await requireHrRole();
    const resolved = await resolveEmployeeForUniformCollection(employeeId);
    if ('error' in resolved) return { success: false, error: resolved.error };

    const { employee, companyId } = resolved;
    const guardEpf = employeeGuardEpf(employee);
    if (!guardEpf) {
      return { success: false, error: 'Employee has no EPF number on file.' };
    }

    const db = createSupabaseServiceClient();
    const issuedLines = await fetchIssuedUniformHistory(db, companyId, guardEpf);
    if (!hasIssuedUniforms(issuedLines)) {
      return { success: false, error: 'No issued uniforms on file for this employee.' };
    }

    const { pending, confirmed, isDemo } = await fetchLatestUniformCollectionCase(db, employeeId);
    if (isDemo) {
      return {
        success: false,
        error: 'Uniform collection is not set up yet. Run database migrations first.',
      };
    }
    if (confirmed) return { success: true };
    if (pending) return { success: true };

    const now = new Date().toISOString();
    const { error } = await db.from('uniform_collection_cases').insert({
      company_id: companyId,
      employee_id: employeeId,
      guard_epf: guardEpf,
      status: 'PENDING',
      issued_items: issuedLines,
      returned_items: [],
      requested_at: now,
      requested_by: userId,
      updated_at: now,
    });

    if (error) {
      if (error.code === '23505') {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: 'Request Uniform Collection',
      targetEntity: `${employee.full_name ?? employeeId} (${guardEpf})`,
      details: {
        employeeId,
        guardEpf,
        issuedItemCount: issuedLines.length,
        issuedQty: issuedLines.reduce((sum, line) => sum + line.qty, 0),
      },
    });

    revalidateUniformCollectionPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to request uniform collection.',
    };
  }
}
