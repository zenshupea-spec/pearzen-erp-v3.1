'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_GRATUITY_SETTINGS,
  parseGratuitySettings,
  type GratuitySettings,
} from '../../../../../packages/gratuity';
import {
  isMissingColumnError,
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getExecutiveMdSettingsContext,
  getMdSettingsDb,
  resolveExecutiveCompanyId,
  assertExecutiveMdSettingsWrite,
  upsertMdSettings,
} from './lib/executive-md-settings-db';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';
import { writeSettingsAuditLog, persistMdSettingEnvelopeWithAudit } from './settings-audit';

export async function getGratuitySettings(): Promise<GratuitySettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('gratuity_settings')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parseGratuitySettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.gratuitySettings]);
    }
    console.error('getGratuitySettings:', error.message);
    return DEFAULT_GRATUITY_SETTINGS;
  }

  const row = data as { gratuity_settings?: unknown; setting_value?: unknown } | null;
  if (row?.gratuity_settings != null) {
    return parseGratuitySettings(row.gratuity_settings);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseGratuitySettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.gratuitySettings]);
}

export async function saveGratuitySettings(settings: GratuitySettings) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const sanitized = parseGratuitySettings(settings);

  let { error } = await upsertMdSettings(supabase, companyId, { gratuity_settings: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      supabase,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.gratuitySettings]: sanitized },
      'UPDATE_GRATUITY_SETTINGS',
      sanitized,
    );
    if (!res.success) return res;
    revalidateMdSettingsConsumers();
    revalidatePath('/fm/settings');
    revalidatePath('/hr/mnr');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  const audit = await writeSettingsAuditLog(
    session,
    auditCompanyId,
    'UPDATE_GRATUITY_SETTINGS',
    sanitized,
  );
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  revalidatePath('/hr/mnr');
  return { success: true };
}
