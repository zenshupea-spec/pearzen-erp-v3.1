'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_ADVANCE_SALARY_SETTINGS,
  parseAdvanceSalarySettings,
  type AdvanceSalarySettings,
} from '../../../../../packages/advance-salary';
import {
  isMissingColumnError,
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

export async function getAdvanceSalarySettings(): Promise<AdvanceSalarySettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('advance_salary_settings')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parseAdvanceSalarySettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.advanceSalarySettings]);
    }
    console.error('getAdvanceSalarySettings:', error.message);
    return DEFAULT_ADVANCE_SALARY_SETTINGS;
  }

  const row = data as { advance_salary_settings?: unknown } | null;
  if (row?.advance_salary_settings != null) {
    return parseAdvanceSalarySettings(row.advance_salary_settings);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseAdvanceSalarySettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.advanceSalarySettings]);
}

export async function saveAdvanceSalarySettings(settings: AdvanceSalarySettings) {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const sanitized = parseAdvanceSalarySettings(settings);

  let { error } = await supabase.from('md_settings').upsert(
    { company_id: companyId, advance_salary_settings: sanitized },
    { onConflict: 'company_id' },
  );

  if (error && isMissingColumnError(error.message)) {
    return mergeSettingEnvelope(supabase, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.advanceSalarySettings]: sanitized,
    });
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  await writeSettingsAuditLog(session, auditCompanyId, 'UPDATE_ADVANCE_SALARY_SETTINGS', sanitized);

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/fm/advance');
  revalidatePath('/executive/advance');
  return { success: true };
}
