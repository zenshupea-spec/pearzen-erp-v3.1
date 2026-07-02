import { describe, expect, it } from 'vitest';

import {
  addCalendarDays,
  buildLetterReminderStates,
  emptyOffboardingLetterLines,
  hasPendingLetterReminders,
  isTrackComplete,
  letterDueDate,
  pendingReminderIndexes,
} from './schedule';
import type { OffboardingLetterTrackSnapshot } from './types';

function track(
  overrides: Partial<OffboardingLetterTrackSnapshot> = {},
): OffboardingLetterTrackSnapshot {
  return {
    status: 'ACTIVE',
    sequenceStartedAt: '2026-07-01',
    letters: emptyOffboardingLetterLines(),
    completedAt: null,
    ...overrides,
  };
}

describe('offboarding-letters schedule', () => {
  it('computes due dates at day 0, +3, and +7 from start', () => {
    const start = '2026-07-01';
    expect(letterDueDate(start, 1)).toBe('2026-07-01');
    expect(letterDueDate(start, 2)).toBe('2026-07-04');
    expect(letterDueDate(start, 3)).toBe('2026-07-08');
  });

  it('adds calendar days across month boundaries', () => {
    expect(addCalendarDays('2026-07-30', 3)).toBe('2026-08-02');
  });

  it('marks letter 1 due on start day only', () => {
    const states = buildLetterReminderStates(track(), '2026-07-01');
    expect(states[0]).toMatchObject({ index: 1, isDue: true, isOverdue: false, isSent: false });
    expect(states[1].isDue).toBe(false);
    expect(states[2].isDue).toBe(false);
  });

  it('marks letter 2 due on day 3 and overdue after', () => {
    const onDay3 = buildLetterReminderStates(track(), '2026-07-04');
    expect(onDay3[1]).toMatchObject({ index: 2, isDue: true, isOverdue: false });

    const afterDay3 = buildLetterReminderStates(track(), '2026-07-05');
    expect(afterDay3[1]).toMatchObject({ index: 2, isDue: true, isOverdue: true });
  });

  it('marks letter 3 due on day 7', () => {
    const states = buildLetterReminderStates(track(), '2026-07-08');
    expect(states[2]).toMatchObject({ index: 3, isDue: true, isOverdue: false });
  });

  it('excludes sent letters from pending reminders', () => {
    const active = track({
      letters: {
        1: { sentAt: '2026-07-01T10:00:00Z', docUrl: 'https://example.com/l1.pdf' },
        2: { sentAt: null, docUrl: null },
        3: { sentAt: null, docUrl: null },
      },
    });
    const states = buildLetterReminderStates(active, '2026-07-08');
    expect(pendingReminderIndexes(states)).toEqual([2, 3]);
    expect(states[0].isSent).toBe(true);
  });

  it('detects completed tracks and active pending reminders', () => {
    expect(isTrackComplete(track({ status: 'COMPLETED' }))).toBe(true);
    expect(isTrackComplete(track({ status: 'ACTIVE' }))).toBe(false);
    expect(hasPendingLetterReminders(track(), '2026-07-01')).toBe(true);
    expect(hasPendingLetterReminders(track({ status: 'COMPLETED' }), '2026-07-08')).toBe(false);
  });
});
