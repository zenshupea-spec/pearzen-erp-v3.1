'use server';

import { revalidatePath } from 'next/cache';

import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import { getOmServiceDb } from '../../../lib/om-service-db';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export type GuardJobApplicantStatus = 'new' | 'reviewed' | 'contacted' | 'hired' | 'rejected';

export type GuardJobApplicantRecord = {
  id: string;
  siteLabel: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  weightKg: number;
  heightFt: number;
  idDocFrontUrl: string;
  idDocBackUrl: string | null;
  servicemenCertUrl: string;
  selfieUrl: string;
  status: GuardJobApplicantStatus;
  createdAt: string;
};

function mapApplicantRow(row: Record<string, unknown>): GuardJobApplicantRecord {
  return {
    id: String(row.id),
    siteLabel: String(row.site_label),
    phonePrimary: String(row.phone_primary),
    phoneSecondary: row.phone_secondary == null ? null : String(row.phone_secondary),
    weightKg: Number(row.weight_kg),
    heightFt: Number(row.height_ft),
    idDocFrontUrl: String(row.id_doc_front_url),
    idDocBackUrl: row.id_doc_back_url == null ? null : String(row.id_doc_back_url),
    servicemenCertUrl: String(row.servicemen_cert_url),
    selfieUrl: String(row.selfie_url),
    status: String(row.status) as GuardJobApplicantStatus,
    createdAt: String(row.created_at),
  };
}

async function fetchApplicantsForCompany(companyId: string | null): Promise<GuardJobApplicantRecord[]> {
  const db = getOmServiceDb();
  let query = db
    .from('guard_job_applications')
    .select(
      'id, site_label, phone_primary, phone_secondary, weight_kg, height_ft, id_doc_front_url, id_doc_back_url, servicemen_cert_url, selfie_url, status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM applicants] list:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapApplicantRow(row as Record<string, unknown>));
}

export async function getGuardJobApplicants(): Promise<{
  applicants: GuardJobApplicantRecord[];
  error?: string;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(supabase);
    const applicants = await fetchWithRosterCompanyFallback(fetchApplicantsForCompany, companyId);
    return { applicants };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load applicants.';
    console.error('[OM applicants] getGuardJobApplicants:', message);
    return { applicants: [], error: 'Failed to load applicants.' };
  }
}

export async function updateGuardJobApplicantStatus(input: {
  applicationId: string;
  status: GuardJobApplicantStatus;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Please sign in again.' };

    const reviewer =
      user.email?.split('@')[0]?.trim().toUpperCase() ||
      user.user_metadata?.epf_no ||
      user.id.slice(0, 8);

    const db = getOmServiceDb();
    const { error } = await db
      .from('guard_job_applications')
      .update({
        status: input.status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: String(reviewer),
      })
      .eq('id', input.applicationId);

    if (error) {
      console.error('[OM applicants] status update:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/om/applicants');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Update failed.';
    return { success: false, error: message };
  }
}
