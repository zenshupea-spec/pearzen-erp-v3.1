import {
  OFFBOARDING_LETTER_INDEXES,
  OFFBOARDING_LETTER_OFFSET_DAYS,
  type LetterReminderState,
  type OffboardingLetterIndex,
  type OffboardingLetterTrackSnapshot,
} from './types';

/** Normalize to YYYY-MM-DD (date-only anchor). */
export function normalizeSequenceStartDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed.slice(0, 10);
  return formatDateOnly(d);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayDateOnly(now = new Date()): string {
  return formatDateOnly(now);
}

/** Parse date-only strings at local noon to avoid UTC day shifts. */
export function parseLocalDateOnly(isoDate: string): Date {
  return new Date(`${normalizeSequenceStartDate(isoDate)}T12:00:00`);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const d = parseLocalDateOnly(isoDate);
  d.setDate(d.getDate() + days);
  return formatDateOnly(d);
}

export function compareDateOnly(a: string, b: string): number {
  return normalizeSequenceStartDate(a).localeCompare(normalizeSequenceStartDate(b));
}

export function letterDueDate(
  startIso: string,
  index: OffboardingLetterIndex,
): string {
  return addCalendarDays(
    normalizeSequenceStartDate(startIso),
    OFFBOARDING_LETTER_OFFSET_DAYS[index],
  );
}

export function buildLetterReminderStates(
  track: OffboardingLetterTrackSnapshot,
  today?: string,
): LetterReminderState[] {
  const todayIso = today ?? todayDateOnly();
  const start = normalizeSequenceStartDate(track.sequenceStartedAt);

  return OFFBOARDING_LETTER_INDEXES.map((index) => {
    const dueDate = letterDueDate(start, index);
    const line = track.letters[index];
    const isSent = Boolean(line.sentAt);
    const cmp = compareDateOnly(todayIso, dueDate);
    const isDue = !isSent && cmp >= 0;
    const isOverdue = !isSent && cmp > 0;

    return {
      index,
      dueDate,
      isDue,
      isOverdue,
      isSent,
      sentAt: line.sentAt,
      docUrl: line.docUrl,
    };
  });
}

export function pendingReminderIndexes(
  states: LetterReminderState[],
): OffboardingLetterIndex[] {
  return states.filter((state) => state.isDue && !state.isSent).map((state) => state.index);
}

export function isTrackComplete(track: OffboardingLetterTrackSnapshot): boolean {
  return track.status === 'COMPLETED';
}

export function hasPendingLetterReminders(
  track: OffboardingLetterTrackSnapshot,
  today?: string,
): boolean {
  if (track.status !== 'ACTIVE') return false;
  return pendingReminderIndexes(buildLetterReminderStates(track, today)).length > 0;
}

export function emptyOffboardingLetterLines(): OffboardingLetterTrackSnapshot['letters'] {
  return {
    1: { sentAt: null, docUrl: null },
    2: { sentAt: null, docUrl: null },
    3: { sentAt: null, docUrl: null },
  };
}
