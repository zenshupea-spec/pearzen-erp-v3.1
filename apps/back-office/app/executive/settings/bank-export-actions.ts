'use server';

import { revalidatePath } from 'next/cache';

import {
  parseBankExportSettings,
  type BankExportSettings,
} from '../../../../../packages/bank-export-settings';
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

export async function getBankExportSettings(): Promise<BankExportSettings> {
  const companyId = await resolveExecutiveCompanyId();
  const supabase = getMdSettingsDb();

  const { data, error } = await supabase
    .from('md_settings')
    .select('bank_export_settings')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message)) {
      const envelope = await loadSettingEnvelope(supabase, companyId);
      return parseBankExportSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.bankExport]);
    }
    console.error('getBankExportSettings:', error.message);
    return parseBankExportSettings(null);
  }

  const row = data as { bank_export_settings?: unknown } | null;
  if (row?.bank_export_settings != null) {
    return parseBankExportSettings(row.bank_export_settings);
  }

  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseBankExportSettings(envelope[MD_SETTINGS_ENVELOPE_KEYS.bankExport]);
}

export async function saveBankExportSettings(settings: BankExportSettings) {
  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = parseBankExportSettings(settings);

  let { error } = await db.from('md_settings').upsert(
    { company_id: companyId, bank_export_settings: sanitized },
    { onConflict: 'company_id' },
  );

  if (error && isMissingColumnError(error.message)) {
    return mergeSettingEnvelope(db, companyId, {
      [MD_SETTINGS_ENVELOPE_KEYS.bankExport]: sanitized,
    });
  }

  if (error) return { success: false as const, error: error.message };

  await writeSettingsAuditLog(session, companyId, 'UPDATE_BANK_EXPORT_SETTINGS', sanitized);

  revalidatePath('/executive/settings');
  revalidatePath('/fm/settings');
  revalidatePath('/executive/payroll');
  return { success: true as const };
}
