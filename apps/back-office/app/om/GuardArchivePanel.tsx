'use client';

import { useMemo } from 'react';
import {
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  ImageOff,
  RotateCcw,
} from 'lucide-react';
import {
  revertRejectedShift,
  type ShiftVerificationRecord,
} from './actions';
import {
  isVerificationPhotoExpired,
  VERIFICATION_PHOTO_RETENTION_DAYS,
} from './shift-verification-utils';
import VerificationDatePicker from './VerificationDatePicker';

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function GuardArchivePanel({
  mode,
  shifts,
  selectedDate,
  onSelectDate,
  markedDates,
  onSelectShift,
  onRefresh,
  revertingKey,
  onRevertingKeyChange,
}: {
  mode: 'approved' | 'rejected';
  shifts: ShiftVerificationRecord[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDates: Set<string>;
  onSelectShift: (shift: ShiftVerificationRecord) => void;
  onRefresh: () => void;
  revertingKey: string | null;
  onRevertingKeyChange: (key: string | null) => void;
}) {
  const isRejected = mode === 'rejected';
  const dateStr = selectedDate.toISOString().slice(0, 10);

  const header = isRejected
    ? {
        title: 'Rejected archive',
        desc: 'Excluded from payroll until OM reverts and re-approves in the verification grid.',
        icon: Ban,
        accent: 'rose' as const,
      }
    : {
        title: 'Approved archive',
        desc: 'Released to payroll. Browse prior dates to audit past verifications.',
        icon: CheckCircle2,
        accent: 'emerald' as const,
      };

  const Icon = header.icon;
  const accentBorder =
    header.accent === 'rose' ? 'border-rose-200 bg-rose-50/30' : 'border-emerald-200 bg-emerald-50/30';
  const accentText = header.accent === 'rose' ? 'text-rose-800' : 'text-emerald-800';

  const handleRevert = async (shift: ShiftVerificationRecord) => {
    const logIds = [shift.checkIn?.id, shift.checkOut?.id].filter(
      (id): id is string => Boolean(id),
    );
    if (!logIds.length) return;
    if (!confirm('Revert this shift to pending review? It will leave payroll until re-approved.')) {
      return;
    }

    onRevertingKeyChange(shift.shiftKey);
    try {
      const result = await revertRejectedShift(logIds);
      if (result.success) onRefresh();
      else alert(result.error ?? 'Revert failed.');
    } finally {
      onRevertingKeyChange(null);
    }
  };

  const expiredNote = useMemo(
    () => isVerificationPhotoExpired(dateStr),
    [dateStr],
  );

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-start justify-between gap-4 rounded-2xl border px-5 py-4 ${accentBorder}`}>
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${accentText}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className={`text-sm font-black uppercase tracking-widest ${accentText}`}>
              {header.title}
            </h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">{header.desc}</p>
          </div>
        </div>
        <div className="w-full min-w-[200px] sm:w-56">
          <VerificationDatePicker
            label="Shift date"
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            markedDates={markedDates}
            lookbackDays={VERIFICATION_PHOTO_RETENTION_DAYS}
          />
        </div>
      </div>

      {expiredNote && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Field verification photos for this date may have been purged under the{' '}
            {VERIFICATION_PHOTO_RETENTION_DAYS}-day rolling retention policy. Attendance records
            remain; only selfies are removed.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <Archive className="h-4 w-4 text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            {formatShiftDate(dateStr)}
          </p>
          <span className="ml-auto rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-black text-slate-700">
            {shifts.length}
          </span>
        </div>

        {shifts.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-slate-500">
            No {isRejected ? 'rejected' : 'approved'} shifts on this date.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shifts.map((shift) => {
              const photosGone = isVerificationPhotoExpired(shift.shiftDate);
              return (
                <li
                  key={shift.shiftKey}
                  className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80"
                >
                  <button
                    type="button"
                    onClick={() => onSelectShift(shift)}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {shift.checkIn?.photo_url && !photosGone ? (
                        <img
                          src={shift.checkIn.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageOff className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {shift.guardName ?? shift.empNumber}
                      </p>
                      <p className="font-mono text-xs text-slate-500">EPF {shift.empNumber}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {shift.checkIn?.device_time &&
                          `In ${formatTime(shift.checkIn.device_time)}`}
                        {shift.checkOut?.device_time &&
                          ` · Out ${formatTime(shift.checkOut.device_time)}`}
                      </p>
                    </div>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                  {isRejected && (
                    <button
                      type="button"
                      disabled={revertingKey === shift.shiftKey}
                      onClick={() => handleRevert(shift)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {revertingKey === shift.shiftKey ? 'Reverting…' : 'Revert to review'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
