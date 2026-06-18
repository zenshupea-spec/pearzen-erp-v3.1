'use server';

import { revalidatePath } from 'next/cache';

import {
  lockedPortalRbacRowForRank,
  mergeStaffWithPortalRbac,
  sanitizePortalRbacMatrix,
  type HeadOfficeRbacStaffRow,
  type PortalRbacMatrix,
} from '../../../../../packages/portal-rbac';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { fetchHeadOfficeCorporateStaffForCompany } from '../../../lib/head-office-corporate-staff';
import {
  getHeadOfficePortalAuthStatusesForEmployees,
  type HeadOfficePortalAuthStatus,
} from '../../../lib/head-office-portal-auth';
import { readPortalRbacMatrixForCompany } from '../../../lib/portal-rbac-store';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog } from './settings-audit';

export type RbacMatrixPayload = {
  staff: HeadOfficeRbacStaffRow[];
  matrix: PortalRbacMatrix;
  portalAuthByEmployeeId: Record<string, HeadOfficePortalAuthStatus>;
};

async function loadHeadOfficeStaffBundle(): Promise<{
  companyId: string;
  staff: HeadOfficeRbacStaffRow[];
}> {
  const session = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(session);
  const companyId =
    rosterCompanyId(sessionCompanyId) ?? (await resolveExecutiveCompanyId(session));

  let staff = await fetchWithRosterCompanyFallback(
    fetchHeadOfficeCorporateStaffForCompany,
    sessionCompanyId,
  );

  if (!staff.length) {
    staff = await fetchHeadOfficeCorporateStaffForCompany(companyId);
  }
  if (!staff.length) {
    staff = await fetchHeadOfficeCorporateStaffForCompany(null);
  }

  return { companyId, staff };
}

export async function getRbacMatrixPayload(): Promise<RbacMatrixPayload> {
  const { companyId, staff } = await loadHeadOfficeStaffBundle();
  const saved = await readPortalRbacMatrixForCompany(companyId);
  const matrix = mergeStaffWithPortalRbac(staff, saved);

  for (const person of staff) {
    const locked = lockedPortalRbacRowForRank(person.rank);
    if (locked) {
      matrix[person.id] = locked;
    }
  }

  const portalAuthByEmployeeId = await getHeadOfficePortalAuthStatusesForEmployees(
    staff.map((person) => person.id),
  );

  return { staff, matrix, portalAuthByEmployeeId };
}

export async function savePortalRbacMatrix(matrix: PortalRbacMatrix) {
  const { companyId, staff } = await loadHeadOfficeStaffBundle();
  const supabase = getMdSettingsDb();
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
