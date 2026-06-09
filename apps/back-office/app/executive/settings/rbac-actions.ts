'use server';

import { revalidatePath } from 'next/cache';

import {
  lockedPortalRbacRowForRank,
  mergeStaffWithPortalRbac,
  sanitizePortalRbacMatrix,
  type HeadOfficeRbacStaffRow,
  type PortalRbacMatrix,
} from '../../../../../packages/portal-rbac';
import { readPortalRbacMatrixForCompany } from '../../../lib/portal-rbac-store';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog } from './settings-audit';

export type RbacMatrixPayload = {
  staff: HeadOfficeRbacStaffRow[];
  matrix: PortalRbacMatrix;
};

async function fetchHeadOfficeStaff(companyId: string): Promise<HeadOfficeRbacStaffRow[]> {
  const supabase = getMdSettingsDb();
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, rank, email, status, group')
    .eq('company_id', companyId)
    .eq('group', 'HEAD_OFFICE')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('fetchHeadOfficeStaff:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    fullName: typeof row.full_name === 'string' ? row.full_name.trim() : 'Unnamed staff',
    rank: typeof row.rank === 'string' ? row.rank.trim().toUpperCase() : null,
    email: typeof row.email === 'string' ? row.email.trim() : null,
    status: typeof row.status === 'string' ? row.status.trim().toUpperCase() : 'ACTIVE',
  }));
}

export async function getRbacMatrixPayload(): Promise<RbacMatrixPayload> {
  const companyId = await resolveExecutiveCompanyId();
  const staff = await fetchHeadOfficeStaff(companyId);
  const saved = await readPortalRbacMatrixForCompany(companyId);
  const matrix = mergeStaffWithPortalRbac(staff, saved);

  for (const person of staff) {
    const locked = lockedPortalRbacRowForRank(person.rank);
    if (locked) {
      matrix[person.id] = locked;
    }
  }

  return { staff, matrix };
}

export async function savePortalRbacMatrix(matrix: PortalRbacMatrix) {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();
  const staff = await fetchHeadOfficeStaff(companyId);
  const staffIds = new Set(staff.map((s) => s.id));

  const sanitized: PortalRbacMatrix = {};
  for (const person of staff) {
    const locked = lockedPortalRbacRowForRank(person.rank);
    if (locked) {
      sanitized[person.id] = locked;
      continue;
    }
    const row = matrix[person.id];
    if (!row) {
      sanitized[person.id] = mergeStaffWithPortalRbac([person], {})[person.id];
      continue;
    }
    sanitized[person.id] = sanitizePortalRbacMatrix({ [person.id]: row })[person.id];
  }

  for (const employeeId of Object.keys(sanitized)) {
    if (!staffIds.has(employeeId)) {
      delete sanitized[employeeId];
    }
  }

  let { error } = await supabase
    .from('md_settings')
    .upsert({ company_id: companyId, portal_rbac_matrix: sanitized }, { onConflict: 'company_id' });

  if (error && isMissingColumnError(error.message)) {
    const res = await mergeSettingEnvelope(supabase, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.portalRbacMatrix]: sanitized,
    });
    if (!res.success) return res;
    revalidatePath('/executive/settings');
    revalidatePath('/fm/settings');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  await writeSettingsAuditLog(session, auditCompanyId, 'UPDATE_PORTAL_RBAC_MATRIX', {
    staffCount: staff.length,
    configuredCount: Object.values(sanitized).filter((row) =>
      Object.values(row).some((level) => level !== 'NONE'),
    ).length,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  return { success: true };
}

