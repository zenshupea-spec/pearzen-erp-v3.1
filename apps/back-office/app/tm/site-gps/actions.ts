'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  formatSiteGpsCoords,
  promoteSiteGpsSubmission,
  type SiteGpsSubmissionRow,
} from '../../../../../packages/supabase/site-gps-submission';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';

export type TmSiteGpsQueueRow = SiteGpsSubmissionRow & {
  smDisplayName: string;
};

async function assertTmReviewer() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new Error('You must be signed in.');
  }

  return { supabase, reviewerEmail: user.email.trim().toLowerCase() };
}

export async function getTmSiteGpsQueue(): Promise<{ rows: TmSiteGpsQueueRow[]; error?: string }> {
  try {
    const { supabase } = await assertTmReviewer();
    const companyId = await resolveCompanyIdForSession(supabase);
    const db = createSupabaseServiceClient();

    let query = db
      .from('site_gps_submissions')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[TM site GPS] queue:', error.message);
      return { rows: [], error: 'Could not load GPS submission queue.' };
    }

    const rows = (data ?? []) as SiteGpsSubmissionRow[];
    return {
      rows: rows.map((row) => ({
        ...row,
        smDisplayName: row.sm_name?.trim() || row.sm_epf,
      })),
    };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : 'Could not load GPS submission queue.',
    };
  }
}

export async function approveSiteGpsSubmissionAction(submissionId: string) {
  if (!submissionId?.trim()) return { error: 'Submission is required.' };

  try {
    const { reviewerEmail } = await assertTmReviewer();
    const db = createSupabaseServiceClient();

    const { data: submission, error: fetchError } = await db
      .from('site_gps_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (fetchError || !submission) {
      return { error: 'Submission not found or already reviewed.' };
    }

    const promote = await promoteSiteGpsSubmission(
      db,
      submission.site_profile_id as string,
      Number(submission.latitude),
      Number(submission.longitude),
      reviewerEmail,
    );

    if (!promote.success) {
      return { error: promote.error ?? 'Failed to update site GPS.' };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await db
      .from('site_gps_submissions')
      .update({
        status: 'APPROVED',
        reviewed_by_email: reviewerEmail,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('[TM site GPS] approve update:', updateError.message);
      return { error: 'Site GPS was saved but queue update failed.' };
    }

    revalidatePath('/tm/site-gps');
    revalidatePath('/tm');
    revalidatePath('/om/sites/location');
    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Approval failed.' };
  }
}

export async function requestSiteGpsResubmitAction(submissionId: string, note?: string) {
  if (!submissionId?.trim()) return { error: 'Submission is required.' };

  const reviewNote =
    (note ?? '').trim() || 'GPS not accurate enough — recapture at the site entrance.';

  try {
    const { reviewerEmail } = await assertTmReviewer();
    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await db
      .from('site_gps_submissions')
      .update({
        status: 'RESUBMIT_REQUESTED',
        review_note: reviewNote,
        reviewed_by_email: reviewerEmail,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', submissionId)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();

    if (error || !data) {
      return { error: 'Submission not found or already reviewed.' };
    }

    revalidatePath('/tm/site-gps');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not request resubmit.' };
  }
}

export { formatSiteGpsCoords };
