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
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const sanitized = parseWelfareFundSettings(settings);

  let { error } = await upsertMdSettings(supabase, companyId, { welfare_fund_settings: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      supabase,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.welfareFundSettings]: sanitized },
      'UPDATE_WELFARE_FUND_SETTINGS',
      sanitized,
    );
    if (!res.success) return res;
    revalidateMdSettingsConsumers();
    revalidatePath('/fm/settings');
    return { success: true };
  }

  if (error) return { success: false, error: error.message };

  const { session, companyId: auditCompanyId } = await getExecutiveMdSettingsContext();
  const audit = await writeSettingsAuditLog(
    session,
    auditCompanyId,
    'UPDATE_WELFARE_FUND_SETTINGS',
    sanitized,
  );
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  return { success: true };
}
