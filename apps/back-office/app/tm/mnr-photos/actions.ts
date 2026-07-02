'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  promoteSubmissionToEmployeeIdPhoto,
  type GuardMnrPhotoSubmissionRow,
} from '../../../../../packages/supabase/guard-mnr-photo-submission';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';

export type TmMnrPhotoQueueRow = GuardMnrPhotoSubmissionRow & {
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

export async function getTmMnrPhotoQueue(): Promise<{ rows: TmMnrPhotoQueueRow[]; error?: string }> {
  try {
    const { supabase } = await assertTmReviewer();
    const companyId = await resolveCompanyIdForSession(supabase);
    const db = createSupabaseServiceClient();

    let query = db
      .from('guard_mnr_photo_submissions')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[TM MNR photo] queue:', error.message);
      return { rows: [], error: 'Could not load submission queue.' };
    }

    const rows = (data ?? []) as GuardMnrPhotoSubmissionRow[];

    return {
      rows: rows.map((row) => ({
        ...row,
        smDisplayName: row.sm_name?.trim() || row.sm_epf,
      })),
    };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : 'Could not load submission queue.',
    };
  }
}

export async function approveMnrPhotoSubmissionAction(submissionId: string) {
  if (!submissionId?.trim()) return { error: 'Submission is required.' };

  try {
    const { reviewerEmail } = await assertTmReviewer();
    const db = createSupabaseServiceClient();

    const { data: submission, error: fetchError } = await db
      .from('guard_mnr_photo_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('status', 'PENDING')
      .maybeSingle();

    if (fetchError || !submission) {
      return { error: 'Submission not found or already reviewed.' };
    }

    const promote = await promoteSubmissionToEmployeeIdPhoto(
      db,
      submission.guard_employee_id as string,
      submission.photo_url as string,
    );

    if (!promote.success) {
      return { error: promote.error ?? 'Failed to publish MNR photo.' };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await db
      .from('guard_mnr_photo_submissions')
      .update({
        status: 'APPROVED',
        reviewed_by_email: reviewerEmail,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('[TM MNR photo] approve update:', updateError.message);
      return { error: 'Photo was saved but queue update failed.' };
    }

    revalidatePath('/tm/mnr-photos');
    revalidatePath('/tm');
    revalidatePath('/om');
    revalidatePath('/hr/mnr');

    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Approval failed.' };
  }
}

export async function requestMnrPhotoResubmitAction(submissionId: string, note?: string) {
  if (!submissionId?.trim()) return { error: 'Submission is required.' };

  const reviewNote = (note ?? '').trim() || 'Photo not clear enough — please recapture facing the guard.';

  try {
    const { reviewerEmail } = await assertTmReviewer();
    const db = createSupabaseServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await db
      .from('guard_mnr_photo_submissions')
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

    revalidatePath('/tm/mnr-photos');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not request resubmit.' };
  }
}
