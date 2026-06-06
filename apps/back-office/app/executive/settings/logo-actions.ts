'use server';

import {
  getCompanyLogoUrl,
  removeCompanyLogo,
  saveCompanyLogo,
} from '../../../../../packages/supabase/company-branding';
import { revalidatePath } from 'next/cache';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

export async function fetchCompanyLogo() {
  const companyId = await resolveExecutiveCompanyId();
  const url = await getCompanyLogoUrl(companyId);
  return { url };
}

export async function persistCompanyLogo(dataUrl: string) {
  const companyId = await resolveExecutiveCompanyId();
  const result = await saveCompanyLogo(dataUrl, companyId);
  if (result.success) {
    revalidatePath('/executive/settings');
    revalidatePath('/executive', 'layout');
    revalidatePath('/invoice-desk');
  }
  return result;
}

export async function clearCompanyLogo() {
  const companyId = await resolveExecutiveCompanyId();
  const result = await removeCompanyLogo(companyId);
  if (result.success) {
    revalidatePath('/executive/settings');
    revalidatePath('/executive', 'layout');
    revalidatePath('/invoice-desk');
  }
  return result;
}
