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
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
  assertExecutiveMdSettingsWrite,
} from './lib/executive-md-settings-db';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';
import { persistMdSettingEnvelopeWithAudit } from './settings-audit';

export async function getInternalWorkLocations(): Promise<InternalWorkLocationsSettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();
  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseInternalWorkLocations(envelope[MD_SETTINGS_ENVELOPE_KEYS.internalWorkLocations]);
}

export async function saveInternalWorkLocations(settings: InternalWorkLocationsSettings) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = sanitizeInternalWorkLocations(settings);

  const res = await persistMdSettingEnvelopeWithAudit(
    db,
    companyId,
    { [MD_SETTINGS_ENVELOPE_KEYS.internalWorkLocations]: sanitized },
    'UPDATE_INTERNAL_WORK_LOCATIONS',
    {
      headOfficeCount: sanitized.headOffice.length,
      cafeCount: sanitized.cafe.length,
    },
  );
  if (!res.success) return res;

  revalidateMdSettingsConsumers();
  revalidatePath('/hr/mnr');
  revalidatePath('/hr/cafe-roster');
  revalidatePath('/cafe-front');

  return { success: true as const };
}

export async function getInternalWorkLocationsForMnr(): Promise<InternalWorkLocationsSettings> {
  return getInternalWorkLocations();
}
