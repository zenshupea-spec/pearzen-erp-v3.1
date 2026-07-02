'use server';

import {
  getCompanyLogoUrl,
  removeCompanyLogo,
  saveCompanyLogo,
} from '../../../../../packages/supabase/company-branding';
import { revalidatePath } from 'next/cache';
import {
  assertExecutiveMdSettingsWrite,
  resolveExecutiveCompanyId,
} from './lib/executive-md-settings-db';
import { revalidateMdSettingsConsumers } from './lib/revalidate-md-settings-consumers';
import { writeSettingsAuditLogForAction } from './settings-audit';

export async function fetchCompanyLogo() {
  const companyId = await resolveExecutiveCompanyId();
  const url = await getCompanyLogoUrl(companyId);
  return { url };
}

export async function persistCompanyLogo(dataUrl: string) {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const companyId = await resolveExecutiveCompanyId();
  const result = await saveCompanyLogo(dataUrl, companyId);
  if (!result.success) return result;

  const audit = await writeSettingsAuditLogForAction('UPDATE_COMPANY_LOGO', {
    action: 'persist',
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/', 'layout');
  revalidatePath('/executive', 'layout');
  revalidatePath('/executive/audit');
  return result;
}

export async function clearCompanyLogo() {
  const vaultGate = await assertExecutiveMdSettingsWrite();
  if (!vaultGate.ok) return { success: false, error: vaultGate.error };

  const companyId = await resolveExecutiveCompanyId();
  const result = await removeCompanyLogo(companyId);
  if (!result.success) return result;

  const audit = await writeSettingsAuditLogForAction('UPDATE_COMPANY_LOGO', {
    action: 'clear',
  });
  if (!audit.ok) return { success: false, error: audit.error };

  revalidateMdSettingsConsumers();
  revalidatePath('/', 'layout');
  revalidatePath('/executive', 'layout');
  revalidatePath('/executive/audit');
  return result;
}
