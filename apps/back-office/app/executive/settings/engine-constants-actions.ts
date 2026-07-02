'use server';

import { revalidatePath } from 'next/cache';
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
import {
  parseMdEngineConstants,
  sanitizeMdEngineConstants,
  type CafeMonthPreviewQty,
  type GuardMonthPreviewQty,
  type MdEngineConstants,
  type SmPayMode,
} from './engine-constants';

export async function getMdEngineConstants(): Promise<MdEngineConstants> {
  const companyId = await resolveExecutiveCompanyId();
  const envelope = await loadSettingEnvelope(getMdSettingsDb(), companyId);
  const raw = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as
    | Partial<MdEngineConstants>
    | undefined;
  return parseMdEngineConstants(raw);
}

export async function saveMdEngineConstants(settings: MdEngineConstants) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = sanitizeMdEngineConstants(settings);

  const res = await persistMdSettingEnvelopeWithAudit(
    db,
    companyId,
    { [MD_SETTINGS_ENVELOPE_KEYS.engineConstants]: sanitized },
    'UPDATE_ENGINE_CONSTANTS',
    sanitized,
  );
  if (!res.success) return res;

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  return { success: true as const };
}
