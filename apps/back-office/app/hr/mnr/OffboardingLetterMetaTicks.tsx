'use client';

import { CheckCircle2, Circle } from 'lucide-react';

import type { LetterReminderState } from '../../../lib/offboarding-letters/types';

type Props = {
  reminderStates: LetterReminderState[];
};

function formatDueLabel(value: string): string {
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function OffboardingLetterMetaTicks({ reminderStates }: Props) {
  const dueLines = reminderStates.filter((state) => state.isDue && !state.isSent);

  return (
    <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-2">
      <div className="flex items-center gap-3">
        {reminderStates.map((state) => {
          const sent = state.isSent;
          const urgent = !sent && state.isDue;
          return (
            <div
              key={state.index}
              className="flex items-center gap-1.5"
              title={
                sent
                  ? `Warning letter ${state.index} sent`
                  : urgent
                    ? `Warning letter ${state.index} due ${formatDueLabel(state.dueDate)}`
                    : `Warning letter ${state.index} due ${formatDueLabel(state.dueDate)}`
              }
            >
              {sent ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden />
              ) : (
                <span className="relative inline-flex shrink-0">
                  <Circle
                    className={`w-3.5 h-3.5 ${
                      urgent ? 'text-amber-500' : 'text-slate-300'
                    }`}
                    aria-hidden
                  />
                  {urgent ? (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  ) : null}
                </span>
              )}
              <span
                className={`text-[10px] font-black uppercase tracking-wide ${
                  sent ? 'text-emerald-700' : urgent ? 'text-amber-700' : 'text-slate-400'
                }`}
              >
                L{state.index}
              </span>
            </div>
          );
        })}
      </div>
      {dueLines.length > 0 ? (
        <p className="text-[10px] font-bold text-amber-800">
          {dueLines
            .map((state) => `Warning letter ${state.index} due ${formatDueLabel(state.dueDate)}`)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
