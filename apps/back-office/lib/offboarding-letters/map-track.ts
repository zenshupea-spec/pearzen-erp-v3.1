import { emptyOffboardingLetterLines } from './schedule';
import type {
  OffboardingLetterTrackRow,
  OffboardingLetterTrackStatus,
} from './types';

export const OFFBOARDING_LETTER_TRACK_SELECT =
  'id, company_id, employee_id, guard_epf, status, sequence_started_at, letter_1_sent_at, letter_1_doc_url, letter_1_sent_by, letter_2_sent_at, letter_2_doc_url, letter_2_sent_by, letter_3_sent_at, letter_3_doc_url, letter_3_sent_by, completed_at, completed_by, completion_notes, created_at, updated_at';

export type GuardOffboardingLetterTrackDbRow = {
  id: string;
  company_id: string;
  employee_id: string;
  guard_epf: string;
  status: string;
  sequence_started_at: string;
  letter_1_sent_at: string | null;
  letter_1_doc_url: string | null;
  letter_1_sent_by: string | null;
  letter_2_sent_at: string | null;
  letter_2_doc_url: string | null;
  letter_2_sent_by: string | null;
  letter_3_sent_at: string | null;
  letter_3_doc_url: string | null;
  letter_3_sent_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
};

export function isMissingOffboardingLetterTracksTable(message: string): boolean {
  return (
    message.includes('42P01') ||
    message.includes('guard_offboarding_letter_tracks') ||
    message.toLowerCase().includes('does not exist')
  );
}

export function mapOffboardingLetterTrackRow(
  row: GuardOffboardingLetterTrackDbRow,
): OffboardingLetterTrackRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    guardEpf: String(row.guard_epf ?? ''),
    status: String(row.status) as OffboardingLetterTrackStatus,
    sequenceStartedAt: String(row.sequence_started_at).slice(0, 10),
    letters: {
      1: {
        sentAt: row.letter_1_sent_at,
        docUrl: row.letter_1_doc_url,
      },
      2: {
        sentAt: row.letter_2_sent_at,
        docUrl: row.letter_2_doc_url,
      },
      3: {
        sentAt: row.letter_3_sent_at,
        docUrl: row.letter_3_doc_url,
      },
    },
    completedAt: row.completed_at,
    completionNotes: row.completion_notes,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function emptyOffboardingLetterTrackRow(
  partial: Pick<OffboardingLetterTrackRow, 'id' | 'companyId' | 'employeeId' | 'guardEpf' | 'sequenceStartedAt'>,
): OffboardingLetterTrackRow {
  const now = new Date().toISOString();
  return {
    ...partial,
    status: 'ACTIVE',
    letters: emptyOffboardingLetterLines(),
    completedAt: null,
    completionNotes: null,
    createdAt: now,
    updatedAt: now,
  };
}
