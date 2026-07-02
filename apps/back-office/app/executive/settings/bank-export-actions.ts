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
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const { session, db, companyId } = await getExecutiveMdSettingsContext();
  const sanitized = parseBankExportSettings(settings);

  let { error } = await upsertMdSettings(db, companyId, { bank_export_settings: sanitized });

  if (error && isMissingColumnError(error.message)) {
    const res = await persistMdSettingEnvelopeWithAudit(
      db,
      companyId,
      { [MD_SETTINGS_ENVELOPE_KEYS.bankExport]: sanitized },
      'UPDATE_BANK_EXPORT_SETTINGS',
      sanitized,
    );
    if (!res.success) return res;
    revalidateMdSettingsConsumers();
    revalidatePath('/fm/settings');
    revalidatePath('/executive/payroll');
    revalidatePath('/executive/advance');
    return { success: true as const };
  }

  if (error) return { success: false as const, error: error.message };

  const audit = await writeSettingsAuditLog(
    session,
    companyId,
    'UPDATE_BANK_EXPORT_SETTINGS',
    sanitized,
  );
  if (!audit.ok) return { success: false as const, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/fm/settings');
  revalidatePath('/executive/payroll');
  revalidatePath('/executive/advance');
  return { success: true as const };
}
