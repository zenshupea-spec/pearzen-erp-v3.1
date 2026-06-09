'use server';

import { revalidatePath } from 'next/cache';

import {
  parsePayFormulasSettings,
  type PayFormulasSettings,
} from '../../../../../packages/pay-formulas';
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

export async function getPayFormulasSettings(): Promise<PayFormulasSettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('pay_formulas')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parsePayFormulasSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.payFormulas]);
    }
    console.error('getPayFormulasSettings:', error.message);
    return parsePayFormulasSettings(null);
  }

  const row = data as { pay_formulas?: unknown } | null;
  if (row?.pay_formulas != null) {
    return parsePayFormulasSettings(row.pay_formulas);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parsePayFormulasSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.payFormulas]);
}

export async function savePayFormulasSettings(settings: PayFormulasSettings) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = parsePayFormulasSettings(settings);

  let { error } = await db.from('md_settings').upsert(
    { company_id: companyId, pay_formulas: sanitized },
    { onConflict: 'company_id' },
  );

  if (error && isMissingColumnError(error.message)) {
    return mergeSettingEnvelope(db, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.payFormulas]: sanitized,
    });
  }

  if (error) return { success: false as const, error: error.message };

  await writeSettingsAuditLog(session, companyId, 'UPDATE_PAY_FORMULAS', {
    guard: sanitized.guard,
    cafe: sanitized.cafe,
  });

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/fm/batch');
  return { success: true as const };
}
