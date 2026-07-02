'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
} from 'lucide-react';

import {
  completeOffboardingLetterTrack,
  getOffboardingLetterTrackForEmployee,
  markOffboardingLetterSentFromForm,
  startOffboardingLetterTrack,
} from './offboarding-letter-actions';
import { todayDateOnly } from '../../../lib/offboarding-letters/schedule';
import type {
  LetterReminderState,
  OffboardingLetterTrackRow,
} from '../../../lib/offboarding-letters/types';

type Props = {
  employeeId: string;
  employeeName?: string | null;
  canEdit?: boolean;
  onChanged?: () => void;
};

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function letterStatusIcon(state: LetterReminderState) {
  if (state.isSent) {
    return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />;
  }
  if (state.isOverdue) {
    return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />;
  }
  if (state.isDue) {
    return <Mail className="w-4 h-4 text-rose-600 shrink-0" aria-hidden />;
  }
  return <Circle className="w-4 h-4 text-slate-300 shrink-0" aria-hidden />;
}

function letterStatusLabel(state: LetterReminderState): string {
  if (state.isSent) return 'Sent';
  if (state.isOverdue) return 'Overdue';
  if (state.isDue) return 'Due now';
  return 'Scheduled';
}

export default function OffboardingLettersPanel({
  employeeId,
  employeeName,
  canEdit = false,
  onChanged,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [track, setTrack] = useState<OffboardingLetterTrackRow | null>(null);
  const [reminderStates, setReminderStates] = useState<LetterReminderState[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [startDate, setStartDate] = useState(() => todayDateOnly());
  const [completionNotes, setCompletionNotes] = useState('');
  const [busy, setBusy] = useState('');
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const view = await getOffboardingLetterTrackForEmployee(employeeId);
      setTrack(view.track);
      setReminderStates(view.reminderStates);
      setIsDemo(view.isDemo);
      if (view.track?.status === 'ACTIVE' && view.track.sequenceStartedAt) {
        setStartDate(view.track.sequenceStartedAt);
      } else {
        setStartDate(todayDateOnly());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load warning letters.');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleStart = async () => {
    setBusy('start');
    setError('');
    try {
      const result = await startOffboardingLetterTrack(employeeId, startDate);
      if (!result.success) {
        setError(result.error ?? 'Failed to start warning letter sequence.');
        return;
      }
      await reload();
      onChanged?.();
    } finally {
      setBusy('');
    }
  };

  const handleMarkSent = async (letterIndex: number) => {
    setBusy(`mark-${letterIndex}`);
    setError('');
    try {
      const input = fileRefs.current[letterIndex];
      const file = input?.files?.[0];
      const fd = new FormData();
      fd.set('employeeId', employeeId);
      fd.set('letterIndex', String(letterIndex));
      if (file && file.size > 0) fd.set('file', file);
      const result = await markOffboardingLetterSentFromForm(fd);
      if (!result.success) {
        setError(result.error ?? 'Failed to mark warning letter sent.');
        return;
      }
      if (input) input.value = '';
      await reload();
      onChanged?.();
    } finally {
      setBusy('');
    }
  };

  const handleComplete = async () => {
    setBusy('complete');
    setError('');
    try {
      const result = await completeOffboardingLetterTrack(
        employeeId,
        completionNotes.trim() || undefined,
      );
      if (!result.success) {
        setError(result.error ?? 'Failed to complete letter track.');
        return;
      }
      setCompletionNotes('');
      await reload();
      onChanged?.();
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm font-bold">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading warning letters…
      </div>
    );
  }

  if (isDemo) {
    return (
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
        Offboarding warning letter tracking is not set up yet. Apply the guard_offboarding_letter_tracks
        migration on this tenant.
      </div>
    );
  }

  const isActive = track?.status === 'ACTIVE';
  const isCompleted = track?.status === 'COMPLETED';
  const showStart = !track || (!isActive && !isCompleted);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
        <p className="text-xs font-black text-violet-800 uppercase tracking-widest mb-0.5">
          Warning letters
        </p>
        <p className="text-slate-600 text-xs font-bold">
          Statutory / reminder warning letters on day 0, +3, and +7 from the sequence start date for{' '}
          {employeeName ?? 'this employee'}.
        </p>
      </div>

      {error ? (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
          {error}
        </div>
      ) : null}

      {showStart ? (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
            No active warning letter sequence
          </p>
          {canEdit ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Start date (day 0)
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </label>
              <button
                type="button"
                disabled={busy === 'start'}
                onClick={() => void handleStart()}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {busy === 'start' ? 'Starting…' : 'Start warning letters'}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-500 font-bold">
              HR editors can start the warning letter sequence from this tab.
            </p>
          )}
        </div>
      ) : null}

      {track && (isActive || isCompleted) ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
            <span>
              Start date:{' '}
              <span className="text-slate-900">{formatDateLabel(track.sequenceStartedAt)}</span>
            </span>
            <span className="text-slate-300">·</span>
            <span
              className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border ${
                isCompleted
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {track.status}
            </span>
          </div>

          {reminderStates.map((state) => {
            const line = track.letters[state.index];
            const markBusy = busy === `mark-${state.index}`;
            return (
              <div
                key={state.index}
                className={`rounded-xl border p-4 space-y-2 ${
                  state.isOverdue && !state.isSent
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    {letterStatusIcon(state)}
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 uppercase tracking-wide">
                        Warning letter {state.index}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        {letterStatusLabel(state)} · Due {formatDateLabel(state.dueDate)}
                      </p>
                    </div>
                  </div>
                  {state.isSent ? (
                    <span className="text-[10px] font-black uppercase tracking-wide text-emerald-700 shrink-0">
                      Sent
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-600">
                  <p>
                    Sent:{' '}
                    <span className="text-slate-900">{formatDateTimeLabel(line.sentAt)}</span>
                  </p>
                </div>

                {line.docUrl ? (
                  <a
                    href={line.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-violet-700 hover:text-violet-900"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    View uploaded document
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}

                {isActive && canEdit && !state.isSent ? (
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Upload letter scan (optional)
                      </span>
                      <input
                        ref={(el) => {
                          fileRefs.current[state.index] = el;
                        }}
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        className="text-xs font-bold text-slate-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-800"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void handleMarkSent(state.index)}
                      className="w-full py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 disabled:opacity-50"
                    >
                      {markBusy ? 'Saving…' : `Mark warning letter ${state.index} sent`}
                    </button>
                  </div>
                ) : null}

                {canEdit && state.isSent && !line.docUrl && (isActive || isCompleted) ? (
                  <div className="pt-2 space-y-2 border-t border-slate-100">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Attach scan
                      </span>
                      <input
                        ref={(el) => {
                          fileRefs.current[state.index] = el;
                        }}
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp"
                        className="text-xs font-bold text-slate-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-800"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void handleMarkSent(state.index)}
                      className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
                    >
                      {markBusy ? 'Uploading…' : 'Upload document'}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {isActive && canEdit ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <p className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                Guard responded
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Completion notes (optional)
                </span>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none resize-y"
                  placeholder="Guard acknowledged final warning letter…"
                />
              </label>
              <button
                type="button"
                disabled={busy === 'complete'}
                onClick={() => void handleComplete()}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {busy === 'complete' ? 'Completing…' : 'Mark complete — guard responded'}
              </button>
            </div>
          ) : null}

          {isCompleted ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-700 uppercase tracking-wide">
                  Sequence completed
                </p>
                <p className="text-[10px] font-bold text-slate-600">
                  Completed: {formatDateTimeLabel(track.completedAt)}
                </p>
                {track.completionNotes ? (
                  <p className="text-[10px] font-bold text-slate-600">
                    Notes: {track.completionNotes}
                  </p>
                ) : null}
              </div>

              {canEdit ? (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <p className="text-xs font-black text-rose-900 uppercase tracking-wide">
                    Start new warning letter sequence
                  </p>
                  <p className="text-[10px] font-bold text-slate-600">
                    The completed sequence stays on record. Choose a new day-0 date to begin
                    sending warning letters 1–3 again.
                  </p>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      New start date (day 0)
                    </span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none bg-white"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy === 'start'}
                    onClick={() => void handleStart()}
                    className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {busy === 'start' ? 'Starting…' : 'Start new warning letter sequence'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
