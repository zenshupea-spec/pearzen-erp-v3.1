'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_WELFARE_FUND_SETTINGS,
  parseWelfareFundSettings,
  type WelfareFundSettings,
} from '../../../../../packages/welfare-fund';
import {
  isMissingColumnError,
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../../../packages/supabase/md-settings-envelope';
import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';

export async function getWelfareFundSettings(): Promise<WelfareFundSettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('welfare_fund_settings')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parseWelfareFundSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]);
    }
    console.error('getWelfareFundSettings:', error.message);
    return DEFAULT_WELFARE_FUND_SETTINGS;
  }

  const row = data as { welfare_fund_settings?: unknown } | null;
  if (row?.welfare_fund_settings != null) {
    return parseWelfareFundSettings(row.welfare_fund_settings);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseWelfareFundSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]);
}

export async function saveWelfareFundSettings(settings: WelfareFundSettings) {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const sanitized = parseWelfareFundSettings(settings);

  let { error } = await supabase.from('md_settings').upsert(
    { company_id: companyId, welfare_fund_settings: sanitized },
    { onConflict: 'company_id' },
  );

  if (error && isMissingColumnError(error.message)) {
    return mergeSettingEnvelope(supabase, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]: sanitized,
    });
  }

  if (error) return { success: false, error: error.message };

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/fm/batch');
  return { success: true };
}
