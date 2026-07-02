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
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = parsePayFormulasSettings(settings);

  let { error } = await upsertMdSettings(db, companyId, { pay_formulas: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      db,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.payFormulas]: sanitized },
      'UPDATE_PAY_FORMULAS',
      { guard: sanitized.guard, cafe: sanitized.cafe },
    );
    if (!res.success) return res;
    revalidateMdSettingsConsumers();
    revalidatePath('/fm/settings');
    return { success: true as const };
  }

  if (error) return { success: false as const, error: error.message };

  const audit = await writeSettingsAuditLog(session, companyId, 'UPDATE_PAY_FORMULAS', {
    guard: sanitized.guard,
    cafe: sanitized.cafe,
  });
  if (!audit.ok) return { success: false as const, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  return { success: true as const };
}
