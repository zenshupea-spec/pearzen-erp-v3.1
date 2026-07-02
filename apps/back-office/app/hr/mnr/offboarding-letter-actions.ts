'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
} from '../../../lib/hr-portal-access-server';
import {
  isOffboardingLetterIndex,
  offboardingLetterFileFromFormData,
  resolveOffboardingLetterDocumentUrl,
  uploadOffboardingLetterDocument,
} from '../../../lib/offboarding-letter-upload';
import {
  isMissingOffboardingLetterTracksTable,
  mapOffboardingLetterTrackRow,
  OFFBOARDING_LETTER_TRACK_SELECT,
  type GuardOffboardingLetterTrackDbRow,
} from '../../../lib/offboarding-letters/map-track';
import {
  buildLetterReminderStates,
  normalizeSequenceStartDate,
  pendingReminderIndexes,
  todayDateOnly,
} from '../../../lib/offboarding-letters/schedule';
import type {
  LetterReminderState,
  OffboardingLetterIndex,
  OffboardingLetterTrackRow,
} from '../../../lib/offboarding-letters/types';
import { OFFBOARDING_LETTER_INDEXES } from '../../../lib/offboarding-letters/types';
import { normalizeGuardEpf } from '../../../lib/uniform-collection/issued-history';
import { auditStaffAction } from '../../../lib/staff-audit';

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);

  const name =
    profile.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email ||
    profile.role;

  return {
    supabase,
    userId: user.id,
    profile,
    editorLabel: formatHrPortalEditorLabel(name, profile.role),
  };
}

type SectionEditMeta = { at: string; by: string };

function stampOffboardingSectionEdit(
  existing: unknown,
  editorLabel: string,
): Record<string, SectionEditMeta> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, SectionEditMeta>) }
      : {};
  base.offboarding = { at: new Date().toISOString(), by: editorLabel };
  return base;
}

async function touchEmployeeOffboardingSectionEdit(
  db: ReturnType<typeof createSupabaseServiceClient>,
  employeeId: string,
  companyId: string,
  editorLabel: string,
) {
  const { data: existing } = await db
    .from('employees')
    .select('section_edits')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();

  await db
    .from('employees')
    .update({
      section_edits: stampOffboardingSectionEdit(existing?.section_edits, editorLabel),
    })
    .eq('id', employeeId)
    .eq('company_id', companyId);
}

function revalidateOffboardingLetterPaths() {
  revalidatePath('/hr/mnr');
}

type EmployeeLetterRow = {
  id: string;
  company_id: string;
  full_name?: string | null;
  emp_number?: string | null;
  epf_no?: string | number | null;
  epf_num?: string | number | null;
};

function employeeGuardEpf(employee: EmployeeLetterRow): string | null {
  if (employee.emp_number) return normalizeGuardEpf(String(employee.emp_number));
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf != null) return normalizeGuardEpf(String(epf));
  return null;
}

async function resolveEmployeeForLetterTrack(
  employeeId: string,
): Promise<{ employee: EmployeeLetterRow; companyId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return { error: 'Could not resolve company for this session.' };

  const db = createSupabaseServiceClient();
  const { data: employee, error } = await db
    .from('employees')
    .select('id, company_id, full_name, emp_number, epf_no, epf_num')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !employee) return { error: 'Employee not found.' };
  return { employee: employee as EmployeeLetterRow, companyId };
}

async function fetchLatestTrackForEmployee(
  db: ReturnType<typeof createSupabaseServiceClient>,
  employeeId: string,
): Promise<{ track: OffboardingLetterTrackRow | null; isDemo: boolean }> {
  const { data, error } = await db
    .from('guard_offboarding_letter_tracks')
    .select(OFFBOARDING_LETTER_TRACK_SELECT)
    .eq('employee_id', employeeId)
    .order('sequence_started_at', { ascending: false })
    .limit(10);

  if (error) {
    if (isMissingOffboardingLetterTracksTable(error.message)) {
      return { track: null, isDemo: true };
    }
    throw new Error(error.message);
  }

  const rows = (data ?? []) as GuardOffboardingLetterTrackDbRow[];
  const active = rows.find((row) => row.status === 'ACTIVE');
  const chosen = active ?? rows[0];
  return {
    track: chosen ? mapOffboardingLetterTrackRow(chosen) : null,
    isDemo: false,
  };
}

export type OffboardingLetterTrackView = {
  track: OffboardingLetterTrackRow | null;
  reminderStates: LetterReminderState[];
  isDemo: boolean;
};

async function resolveTrackDocumentUrls(
  db: ReturnType<typeof createSupabaseServiceClient>,
  track: OffboardingLetterTrackRow | null,
): Promise<OffboardingLetterTrackRow | null> {
  if (!track) return null;

  const letters = { ...track.letters };
  for (const index of OFFBOARDING_LETTER_INDEXES) {
    const line = letters[index];
    if (!line.docUrl) continue;
    const resolvedUrl = await resolveOffboardingLetterDocumentUrl(db, line.docUrl);
    letters[index] = {
      ...line,
      docUrl: resolvedUrl ?? line.docUrl,
    };
  }

  return { ...track, letters };
}

export async function getOffboardingLetterTrackForEmployee(
  employeeId: string,
): Promise<OffboardingLetterTrackView> {
  noStore();

  const resolved = await resolveEmployeeForLetterTrack(employeeId);
  if ('error' in resolved) {
    return { track: null, reminderStates: [], isDemo: false };
  }

  const db = createSupabaseServiceClient();
  const { track, isDemo } = await fetchLatestTrackForEmployee(db, employeeId);
  const resolvedTrack = await resolveTrackDocumentUrls(db, track);
  const reminderStates = resolvedTrack ? buildLetterReminderStates(resolvedTrack) : [];

  return { track: resolvedTrack, reminderStates, isDemo };
}

export type OffboardingLetterReminderQueueRow = {
  trackId: string;
  employeeId: string;
  employeeName: string;
  guardEpf: string;
  sequenceStartedAt: string;
  pendingIndexes: OffboardingLetterIndex[];
  reminderStates: LetterReminderState[];
};

export async function fetchOffboardingLetterRemindersForCompany(): Promise<{
  rows: OffboardingLetterReminderQueueRow[];
  isDemo: boolean;
}> {
  noStore();

  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return { rows: [], isDemo: false };

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('guard_offboarding_letter_tracks')
    .select(OFFBOARDING_LETTER_TRACK_SELECT)
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .order('sequence_started_at', { ascending: false });

  if (error) {
    if (isMissingOffboardingLetterTracksTable(error.message)) {
      return { rows: [], isDemo: true };
    }
    throw new Error(error.message);
  }

  const tracks = ((data ?? []) as GuardOffboardingLetterTrackDbRow[]).map(mapOffboardingLetterTrackRow);
  const today = todayDateOnly();
  const pendingTracks = tracks
    .map((track) => {
      const reminderStates = buildLetterReminderStates(track, today);
      const pendingIndexes = pendingReminderIndexes(reminderStates);
      return { track, reminderStates, pendingIndexes };
    })
    .filter((entry) => entry.pendingIndexes.length > 0);

  if (!pendingTracks.length) {
    return { rows: [], isDemo: false };
  }

  const employeeIds = pendingTracks.map((entry) => entry.track.employeeId);
  const { data: employees } = await db
    .from('employees')
    .select('id, full_name')
    .in('id', employeeIds);

  const nameById = new Map(
    (employees ?? []).map((row) => [String(row.id), String(row.full_name ?? '—')]),
  );

  return {
    rows: pendingTracks.map(({ track, reminderStates, pendingIndexes }) => ({
      trackId: track.id,
      employeeId: track.employeeId,
      employeeName: nameById.get(track.employeeId) ?? '—',
      guardEpf: track.guardEpf,
      sequenceStartedAt: track.sequenceStartedAt,
      pendingIndexes,
      reminderStates,
    })),
    isDemo: false,
  };
}

export async function startOffboardingLetterTrack(
  employeeId: string,
  startDateIso?: string,
): Promise<{ success: boolean; error?: string; trackId?: string }> {
  try {
    const { supabase, editorLabel } = await requireHrEditor();
    const resolved = await resolveEmployeeForLetterTrack(employeeId);
    if ('error' in resolved) return { success: false, error: resolved.error };

    const { employee, companyId } = resolved;
    const guardEpf = employeeGuardEpf(employee);
    if (!guardEpf) {
      return { success: false, error: 'Employee has no EPF number on file.' };
    }

    const db = createSupabaseServiceClient();
    const { track: existing, isDemo } = await fetchLatestTrackForEmployee(db, employeeId);
    if (isDemo) {
      return {
        success: false,
        error: 'Offboarding letters are not set up yet. Run database migrations first.',
      };
    }
    if (existing?.status === 'ACTIVE') {
      return { success: true, trackId: existing.id };
    }

    const sequenceStartedAt = normalizeSequenceStartDate(startDateIso ?? todayDateOnly());
    const now = new Date().toISOString();
    const { data, error } = await db
      .from('guard_offboarding_letter_tracks')
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        guard_epf: guardEpf,
        status: 'ACTIVE',
        sequence_started_at: sequenceStartedAt,
        updated_at: now,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { track: activeTrack } = await fetchLatestTrackForEmployee(db, employeeId);
        return { success: true, trackId: activeTrack?.id };
      }
      return { success: false, error: error.message };
    }

    await touchEmployeeOffboardingSectionEdit(db, employeeId, companyId, editorLabel);

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: 'Start Offboarding Letter Track',
      targetEntity: `${employee.full_name ?? employeeId} (${guardEpf})`,
      details: { employeeId, guardEpf, sequenceStartedAt },
    });

    revalidateOffboardingLetterPaths();
    return { success: true, trackId: String(data.id) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to start offboarding letter track.',
    };
  }
}

function letterSentColumn(index: OffboardingLetterIndex, field: 'sent_at' | 'doc_url' | 'sent_by') {
  return `letter_${index}_${field}` as const;
}

/** Preferred client entry — file uploads must travel inside FormData (Next.js server actions). */
export async function markOffboardingLetterSentFromForm(
  formData: FormData,
): Promise<{ success: boolean; error?: string; docUrl?: string }> {
  const employeeId = String(formData.get('employeeId') ?? '').trim();
  const letterIndex = Number(formData.get('letterIndex'));
  if (!employeeId) {
    return { success: false, error: 'Employee id is required.' };
  }
  return markOffboardingLetterSent(employeeId, letterIndex, formData);
}

export async function markOffboardingLetterSent(
  employeeId: string,
  letterIndex: number,
  formData?: FormData,
  sentAtIso?: string,
): Promise<{ success: boolean; error?: string; docUrl?: string }> {
  try {
    if (!isOffboardingLetterIndex(letterIndex)) {
      return { success: false, error: 'Letter index must be 1, 2, or 3.' };
    }

    const { supabase, userId, editorLabel } = await requireHrEditor();
    const resolved = await resolveEmployeeForLetterTrack(employeeId);
    if ('error' in resolved) return { success: false, error: resolved.error };

    const { employee, companyId } = resolved;
    const db = createSupabaseServiceClient();
    const { track, isDemo } = await fetchLatestTrackForEmployee(db, employeeId);
    if (isDemo) {
      return {
        success: false,
        error: 'Offboarding letters are not set up yet. Run database migrations first.',
      };
    }
    if (!track || (track.status !== 'ACTIVE' && track.status !== 'COMPLETED')) {
      return { success: false, error: 'No offboarding warning letter track for this employee.' };
    }

    const uploadFile = offboardingLetterFileFromFormData(formData);
    const existingLine = track.letters[letterIndex];
    const isDocOnlyUpload =
      track.status === 'COMPLETED' &&
      Boolean(existingLine.sentAt) &&
      Boolean(uploadFile);

    if (track.status === 'COMPLETED' && !isDocOnlyUpload) {
      return {
        success: false,
        error: 'This warning letter sequence is completed. Start a new sequence to mark letters sent.',
      };
    }

    let docUrl = existingLine.docUrl;
    if (uploadFile) {
      const upload = await uploadOffboardingLetterDocument(db, {
        companyId,
        employeeId,
        letterIndex,
        file: uploadFile,
      });
      if (!upload.success || !upload.url) {
        return { success: false, error: upload.error ?? 'Upload failed.' };
      }
      docUrl = upload.url;
    }

    const sentAt = isDocOnlyUpload
      ? existingLine.sentAt
      : sentAtIso ?? new Date().toISOString();
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      [letterSentColumn(letterIndex, 'doc_url')]: docUrl,
      updated_at: now,
    };

    if (!isDocOnlyUpload) {
      updatePayload[letterSentColumn(letterIndex, 'sent_at')] = sentAt;
      updatePayload[letterSentColumn(letterIndex, 'sent_by')] = userId;
    }

    const { error } = await db
      .from('guard_offboarding_letter_tracks')
      .update(updatePayload)
      .eq('id', track.id)
      .in('status', isDocOnlyUpload ? ['COMPLETED'] : ['ACTIVE']);

    if (error) {
      return { success: false, error: error.message };
    }

    await touchEmployeeOffboardingSectionEdit(db, employeeId, companyId, editorLabel);

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: `Mark Offboarding Letter ${letterIndex} Sent`,
      targetEntity: `${employee.full_name ?? employeeId}`,
      details: {
        employeeId,
        letterIndex,
        sentAt,
        docUrl,
      },
    });

    revalidateOffboardingLetterPaths();
    const resolvedDocUrl =
      (await resolveOffboardingLetterDocumentUrl(db, docUrl ?? null)) ?? docUrl ?? undefined;
    return { success: true, docUrl: resolvedDocUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mark letter sent.',
    };
  }
}

export async function completeOffboardingLetterTrack(
  employeeId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, userId, editorLabel } = await requireHrEditor();
    const resolved = await resolveEmployeeForLetterTrack(employeeId);
    if ('error' in resolved) return { success: false, error: resolved.error };

    const { employee, companyId } = resolved;
    const db = createSupabaseServiceClient();
    const { track, isDemo } = await fetchLatestTrackForEmployee(db, employeeId);
    if (isDemo) {
      return {
        success: false,
        error: 'Offboarding letters are not set up yet. Run database migrations first.',
      };
    }
    if (!track || track.status !== 'ACTIVE') {
      return { success: false, error: 'No active offboarding letter track for this employee.' };
    }

    const now = new Date().toISOString();
    const { error } = await db
      .from('guard_offboarding_letter_tracks')
      .update({
        status: 'COMPLETED',
        completed_at: now,
        completed_by: userId,
        completion_notes: notes?.trim() || null,
        updated_at: now,
      })
      .eq('id', track.id)
      .eq('status', 'ACTIVE');

    if (error) {
      return { success: false, error: error.message };
    }

    await touchEmployeeOffboardingSectionEdit(db, employeeId, companyId, editorLabel);

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: 'Complete Offboarding Letter Track',
      targetEntity: `${employee.full_name ?? employeeId}`,
      details: {
        employeeId,
        trackId: track.id,
        completionNotes: notes?.trim() || null,
      },
    });

    revalidateOffboardingLetterPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to complete offboarding letter track.',
    };
  }
}
