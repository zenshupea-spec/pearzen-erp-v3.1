'use server';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/server';
import { uploadGuardJobApplicationImage } from '../../../lib/guard-job-application-storage';
import { resolveSecurityWebsiteCompanyId } from '../../../lib/security-website-data';

export type GuardJobApplicationInput = {
  siteProfileId: string;
  siteLabel: string;
  phonePrimary: string;
  phoneSecondary?: string;
  weightKg: number;
  heightFt: number;
  idDocFrontBase64: string;
  servicemenCertBase64: string;
  selfieBase64: string;
};

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function validateApplicationInput(input: GuardJobApplicationInput): string | null {
  if (!input.siteProfileId.trim()) return 'Vacancy site is required.';
  if (!input.siteLabel.trim()) return 'Vacancy location is required.';

  const phonePrimary = normalizePhone(input.phonePrimary);
  if (phonePrimary.length < 9) return 'Enter a valid primary phone number.';

  const phoneSecondary = input.phoneSecondary?.trim()
    ? normalizePhone(input.phoneSecondary)
    : '';
  if (phoneSecondary && phoneSecondary.length < 9) {
    return 'Secondary phone number must be valid when provided.';
  }

  if (!Number.isFinite(input.weightKg) || input.weightKg < 30 || input.weightKg > 250) {
    return 'Enter a valid weight (30–250 kg).';
  }
  if (!Number.isFinite(input.heightFt) || input.heightFt < 4 || input.heightFt > 8.5) {
    return 'Enter a valid height (4–8.5 ft).';
  }

  if (!input.idDocFrontBase64.trim()) return 'NIC or passport photo is required.';
  if (!input.servicemenCertBase64.trim()) return 'Servicemen certificate photo is required.';
  if (!input.selfieBase64.trim()) return 'Live selfie is required.';

  return null;
}

export async function submitGuardJobApplication(
  input: GuardJobApplicationInput,
): Promise<{ success: boolean; applicationId?: string; error?: string }> {
  const validationError = validateApplicationInput(input);
  if (validationError) return { success: false, error: validationError };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return { success: false, error: 'Applications are temporarily unavailable.' };
  }

  const companyId = await resolveSecurityWebsiteCompanyId();
  const db = createSupabaseServiceClient();
  const phonePrimary = normalizePhone(input.phonePrimary);
  const phoneSecondary = input.phoneSecondary?.trim()
    ? normalizePhone(input.phoneSecondary)
    : null;
  const applicationId = crypto.randomUUID();

  const [idDocFrontUrl, servicemenCertUrl, selfieUrl] = await Promise.all([
    uploadGuardJobApplicationImage(db, companyId, applicationId, 'id-front', input.idDocFrontBase64),
    uploadGuardJobApplicationImage(
      db,
      companyId,
      applicationId,
      'servicemen-cert',
      input.servicemenCertBase64,
    ),
    uploadGuardJobApplicationImage(db, companyId, applicationId, 'selfie', input.selfieBase64),
  ]);

  if (!idDocFrontUrl || !servicemenCertUrl || !selfieUrl) {
    return { success: false, error: 'Could not upload your documents. Please try again.' };
  }

  const { data: inserted, error: insertError } = await db
    .from('guard_job_applications')
    .insert({
      id: applicationId,
      company_id: companyId,
      site_profile_id: input.siteProfileId,
      site_label: input.siteLabel.trim(),
      phone_primary: phonePrimary,
      phone_secondary: phoneSecondary,
      weight_kg: input.weightKg,
      height_ft: input.heightFt,
      id_doc_front_url: idDocFrontUrl,
      id_doc_back_url: null,
      servicemen_cert_url: servicemenCertUrl,
      selfie_url: selfieUrl,
      status: 'new',
    })
    .select('id')
    .single();

  if (insertError || !inserted?.id) {
    console.error('[guard-job-application] insert:', insertError?.message);
    return { success: false, error: 'Could not save your application. Please try again.' };
  }

  return { success: true, applicationId: String(inserted.id) };
}
