export type OffboardingLetterIndex = 1 | 2 | 3;

export type OffboardingLetterTrackStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type OffboardingLetterLine = {
  sentAt: string | null;
  docUrl: string | null;
};

export type OffboardingLetterTrackSnapshot = {
  id?: string;
  employeeId?: string;
  guardEpf?: string;
  status: OffboardingLetterTrackStatus;
  /** YYYY-MM-DD — HR anchor for day 0 */
  sequenceStartedAt: string;
  letters: Record<OffboardingLetterIndex, OffboardingLetterLine>;
  completedAt: string | null;
};

export type OffboardingLetterTrackRow = OffboardingLetterTrackSnapshot & {
  id: string;
  companyId: string;
  employeeId: string;
  guardEpf: string;
  completionNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LetterReminderState = {
  index: OffboardingLetterIndex;
  dueDate: string;
  isDue: boolean;
  isOverdue: boolean;
  isSent: boolean;
  sentAt: string | null;
  docUrl: string | null;
};

export const OFFBOARDING_LETTER_INDEXES: OffboardingLetterIndex[] = [1, 2, 3];

export const OFFBOARDING_LETTER_OFFSET_DAYS: Record<OffboardingLetterIndex, number> = {
  1: 0,
  2: 3,
  3: 7,
};
