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
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { readPortalRbacMatrixForCompany } from '../../../lib/portal-rbac-store';
import {
  isMissingColumnError,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
  assertExecutiveMdSettingsWrite,
  upsertMdSettings,
} from './lib/executive-md-settings-db';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';
import { writeSettingsAuditLog, persistMdSettingEnvelopeWithAudit } from './settings-audit';

export type RbacMatrixPayload = {
  staff: HeadOfficeRbacStaffRow[];
  matrix: PortalRbacMatrix;
  portalAuthByEmployeeId: Record<string, HeadOfficePortalAuthStatus>;
  sessionEmployeeId: string | null;
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

  const session = await createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  const profile = user ? await fetchBackOfficeUserProfile(session, user) : null;

  return {
    staff,
    matrix,
    portalAuthByEmployeeId,
    sessionEmployeeId: profile?.employeeId ?? null,
  };
}

export async function savePortalRbacMatrix(matrix: PortalRbacMatrix) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

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

  let { error } = await upsertMdSettings(supabase, companyId, { portal_rbac_matrix: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      supabase,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.portalRbacMatrix]: sanitized },
      'UPDATE_PORTAL_RBAC_MATRIX',
      {
        staffCount: staff.length,
        configuredCount: Object.values(sanitized).filter((row) =>
          Object.values(row).some((level) => level !== 'NONE'),
        ).length,
      },
    );
    if (!res.success) return res;
    revalidateMdSettingsConsumers();
    revalidatePath('/fm/settings');
    revalidatePath('/executive/audit');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  const audit = await writeSettingsAuditLog(session, auditCompanyId, 'UPDATE_PORTAL_RBAC_MATRIX', {
    staffCount: staff.length,
    configuredCount: Object.values(sanitized).filter((row) =>
      Object.values(row).some((level) => level !== 'NONE'),
    ).length,
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  return { success: true };
}
