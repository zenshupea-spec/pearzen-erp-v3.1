'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_HR_SECTOR_NAMES,
  mergeHrSectorNames,
  normalizeHrSectorName,
  parseHrSectorNamesFromStorage,
} from '../../lib/hr-sectors';
import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { getMdSettingsDb } from '../executive/settings/lib/executive-md-settings-db';
import { persistMdSettingEnvelopeWithAudit } from '../executive/settings/settings-audit';

const HR_SECTOR_APPEND_ROLES = new Set(['HR', 'MD', 'OD', 'FM']);

export async function getHrSectorNames(): Promise<string[]> {
  const session = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(session);
  if (!companyId) return [...DEFAULT_HR_SECTOR_NAMES];

  const db = getMdSettingsDb();
  const envelope = await loadSettingEnvelope(db, companyId);
  const saved = parseHrSectorNamesFromStorage(envelope[MD_SETTINGS_ENVELOPE_KEYS.hrSectorNames]);
  return mergeHrSectorNames(DEFAULT_HR_SECTOR_NAMES, saved);
}

export async function appendHrSectorName(input: {
  sectorName: string;
}): Promise<
  | { success: true; sectorName: string; sectorNames: string[] }
  | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'You must be signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (!role || !HR_SECTOR_APPEND_ROLES.has(role)) {
    return { success: false, error: 'Only HR, FM, MD, or OD can add sector names.' };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return { success: false, error: 'Tenant context required.' };
  }

  const sectorName = normalizeHrSectorName(input.sectorName);
  if (!sectorName) {
    return { success: false, error: 'Sector name is required.' };
  }

  const db = getMdSettingsDb();
  const envelope = await loadSettingEnvelope(db, companyId);
  const saved = parseHrSectorNamesFromStorage(envelope[MD_SETTINGS_ENVELOPE_KEYS.hrSectorNames]);
  const sectorNames = mergeHrSectorNames(DEFAULT_HR_SECTOR_NAMES, saved);

  if (sectorNames.includes(sectorName)) {
    return { success: true, sectorName, sectorNames };
  }

  const nextSaved = [...saved, sectorName];
  const res = await persistMdSettingEnvelopeWithAudit(
    db,
    companyId,
    { [MD_SETTINGS_ENVELOPE_KEYS.hrSectorNames]: nextSaved },
    'APPEND_HR_SECTOR_NAME',
    { sectorName },
  );
  if (!res.success) return res;

  const nextSectorNames = mergeHrSectorNames(DEFAULT_HR_SECTOR_NAMES, nextSaved);
  revalidatePath('/hr/onboarding');
  revalidatePath('/hr/mnr');
  return { success: true, sectorName, sectorNames: nextSectorNames };
}
