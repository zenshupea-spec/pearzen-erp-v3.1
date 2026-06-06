'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CameraOff,
  Clock,
  LogOut,
  PauseCircle,
} from 'lucide-react';
import { clearShiftTimingHold, type ShiftVerificationRecord } from './actions';
import { getOnHoldReason, type OnHoldReason } from './shift-verification-utils';

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const REASON_META: Record<
  OnHoldReason,
  { label: string; icon: typeof CameraOff; hint: string }
> = {
  missing_photo: {
    label: 'Missing field photo',
    icon: CameraOff,
    hint: 'Waiting for guard check-in/out selfies from the field portal.',
  },
  late_start: {
    label: 'Late start (15+ min)',
    icon: Clock,
    hint: 'Blocked from payroll until OM clears the timing exception.',
  },
  early_checkout: {
    label: 'Early checkout (15+ min)',
    icon: LogOut,
    hint: 'Blocked from payroll until OM clears the timing exception.',
  },
};

function HoldCard({
  shift,
  onClearTiming,
  clearing,
}: {
  shift: ShiftVerificationRecord;
  onClearTiming?: () => void;
  clearing: boolean;
}) {
  const reason = getOnHoldReason(shift);
  const Icon = REASON_META[reason].icon;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">
            {shift.guardName ?? shift.empNumber}
          </p>
          <p className="font-mono text-xs text-slate-500">EPF {shift.empNumber}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {formatShiftDate(shift.shiftDate)}
          </p>
          {reason === 'late_start' && shift.lateMinutes != null && (
            <p className="mt-2 text-xs font-semibold text-sky-800">
              +{shift.lateMinutes} min after MD {shift.shiftType === 'NIGHT' ? 'night' : 'day'}{' '}
              start
            </p>
          )}
          {reason === 'early_checkout' && shift.earlyMinutes != null && (
            <p className="mt-2 text-xs font-semibold text-amber-800">
              {shift.earlyMinutes} min before MD {shift.shiftType === 'NIGHT' ? 'night' : 'day'} end
            </p>
          )}
          {reason === 'missing_photo' && (
            <p className="mt-2 text-xs text-slate-600">
              {!shift.checkIn?.photo_url && 'Missing check-in · '}
              {!shift.checkOut?.photo_url && 'Missing check-out'}
            </p>
          )}
        </div>
      </div>
      {onClearTiming && (
        <button
          type="button"
          disabled={clearing}
          onClick={onClearTiming}
          className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          {clearing ? 'Clearing…' : 'Clear timing hold → send to verification'}
        </button>
      )}
    </div>
  );
}

export default function GuardHoldPanel({
  shifts,
  onRefresh,
}: {
  shifts: ShiftVerificationRecord[];
  onRefresh: () => void;
}) {
  const [clearingKey, setClearingKey] = useState<string | null>(null);

  const missing = shifts.filter((s) => getOnHoldReason(s) === 'missing_photo');
  const late = shifts.filter((s) => getOnHoldReason(s) === 'late_start');
  const early = shifts.filter((s) => getOnHoldReason(s) === 'early_checkout');

  const handleClearTiming = async (shift: ShiftVerificationRecord) => {
    const logIds = [shift.checkIn?.id, shift.checkOut?.id].filter(
      (id): id is string => Boolean(id),
    );
    if (!logIds.length) return;

    setClearingKey(shift.shiftKey);
    try {
      const result = await clearShiftTimingHold(logIds);
      if (result.success) onRefresh();
      else alert(result.error ?? 'Could not clear timing hold.');
    } finally {
      setClearingKey(null);
    }
  };

  if (!shifts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-8 py-16 text-center">
        <PauseCircle className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-4 text-sm font-bold text-slate-600">No shifts on hold</p>
        <p className="mt-1 text-xs text-slate-500">
          Missing photos and timing exceptions appear here until resolved.
        </p>
      </div>
    );
  }

  const sections: {
    key: OnHoldReason;
    items: ShiftVerificationRecord[];
    clearable: boolean;
  }[] = [
    { key: 'missing_photo', items: missing, clearable: false },
    { key: 'late_start', items: late, clearable: true },
    { key: 'early_checkout', items: early, clearable: true },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/40 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="text-xs leading-relaxed text-amber-950">
          On-hold shifts are <strong>not released to payroll</strong> and do not appear in the
          3-point verification grid. Clear timing holds after review, or wait for field photos to
          sync.
        </p>
      </div>

      {sections.map(
        ({ key, items, clearable }) =>
          items.length > 0 && (
            <section key={key}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
                  {REASON_META[key].label}
                </h3>
                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-black text-slate-700">
                  {items.length}
                </span>
              </div>
              <p className="mb-4 text-xs text-slate-500">{REASON_META[key].hint}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((shift) => (
                  <HoldCard
                    key={shift.shiftKey}
                    shift={shift}
                    clearing={clearingKey === shift.shiftKey}
                    onClearTiming={
                      clearable ? () => handleClearTiming(shift) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
