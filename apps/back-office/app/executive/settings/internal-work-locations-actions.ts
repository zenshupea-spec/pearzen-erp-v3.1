'use server';

import { revalidatePath } from 'next/cache';

import {
  parseInternalWorkLocations,
  sanitizeInternalWorkLocations,
  type InternalWorkLocationsSettings,
} from '../../../lib/internal-work-locations';
import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { writeSettingsAuditLog } from './settings-audit';

export async function getInternalWorkLocations(): Promise<InternalWorkLocationsSettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();
  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseInternalWorkLocations(envelope[MD_SETTINGS_ENVELOPE_KEYS.internalWorkLocations]);
}

export async function saveInternalWorkLocations(settings: InternalWorkLocationsSettings) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = sanitizeInternalWorkLocations(settings);

  const res = await mergeSettingEnvelope(db, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.internalWorkLocations]: sanitized,
  });
  if (!res.success) return res;

  await writeSettingsAuditLog(session, companyId, 'UPDATE_INTERNAL_WORK_LOCATIONS', {
    headOfficeCount: sanitized.headOffice.length,
    cafeCount: sanitized.cafe.length,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/hr/mnr');
  revalidatePath('/hr/cafe-roster');
  revalidatePath('/cafe-front');

  return { success: true as const };
}

export async function getInternalWorkLocationsForMnr(): Promise<InternalWorkLocationsSettings> {
  return getInternalWorkLocations();
}
