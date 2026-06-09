'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';

import {
  getCafeFrontRollingSchedule,
  type CafeFrontRollingSchedule,
} from '../../app/cafe-front/actions';
import { formatCafeShiftWindowLabel } from '../../lib/cafe-shift-hours';
import {
  cafeShiftShortLabel,
  normalizeCafeShiftType,
  ROLLING_DAYS,
  type CafeShiftType,
} from '../../app/hr/cafe-roster/utils';

function formatDayChip(date: string): {
  weekday: string;
  dayNum: string;
  isToday: boolean;
} {
  const parsed = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return {
    weekday: parsed.toLocaleDateString('en-LK', { weekday: 'short' }),
    dayNum: parsed.toLocaleDateString('en-LK', { day: 'numeric' }),
    isToday: parsed.getTime() === today.getTime(),
  };
}

function formatRangeLabel(days: string[]): string {
  if (!days.length) return '';
  const first = new Date(`${days[0]}T12:00:00`);
  const last = new Date(`${days[days.length - 1]}T12:00:00`);
  const start = first.toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
  const end = last.toLocaleDateString('en-LK', { day: 'numeric', month: 'short' });
  return `${start} – ${end}`;
}

function DayCell({
  date,
  shiftType,
  onLeave,
  shiftWindows,
}: {
  date: string;
  shiftType: CafeShiftType | null;
  onLeave: boolean;
  shiftWindows: CafeFrontRollingSchedule['shiftWindows'];
}) {
  const chip = formatDayChip(date);

  let cellClass = 'border-slate-100 bg-slate-50/70 text-slate-400';
  let label = 'Off';

  if (onLeave) {
    cellClass = 'border-rose-100 bg-rose-50/90 text-rose-700';
    label = 'Leave';
  } else if (shiftType === 'MORNING') {
    cellClass = 'border-sky-100 bg-sky-50/90 text-sky-800';
    label = cafeShiftShortLabel(shiftType);
  } else if (shiftType === 'EVENING') {
    cellClass = 'border-violet-100 bg-violet-50/90 text-violet-800';
    label = cafeShiftShortLabel(shiftType);
  }

  const timeHint =
    shiftType === 'MORNING'
      ? formatCafeShiftWindowLabel('MORNING', shiftWindows)
      : shiftType === 'EVENING'
        ? formatCafeShiftWindowLabel('EVENING', shiftWindows)
        : undefined;

  return (
    <div
      title={timeHint}
      className={`flex aspect-square flex-col items-center justify-center rounded-xl border px-0.5 py-1 text-center transition-colors ${
        chip.isToday ? 'ring-2 ring-orange-400 ring-offset-1 ring-offset-white shadow-sm' : ''
      } ${cellClass}`}
    >
      <span className="text-[8px] font-bold uppercase leading-none opacity-75">{chip.weekday}</span>
      <span className="mt-0.5 text-sm font-black leading-none">{chip.dayNum}</span>
      <span className="mt-1 text-[8px] font-black uppercase leading-none tracking-wide">{label}</span>
    </div>
  );
}

export function CafeFrontSchedulePreview() {
  const [schedule, setSchedule] = useState<CafeFrontRollingSchedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getCafeFrontRollingSchedule().then((payload) => {
      if (cancelled) return;
      setSchedule(payload);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shiftByDate = useMemo(() => {
    const map = new Map<string, CafeShiftType>();
    for (const shift of schedule?.shifts ?? []) {
      const normalized = normalizeCafeShiftType(shift.shift_type);
      if (normalized) map.set(shift.shift_date, normalized);
    }
    return map;
  }, [schedule?.shifts]);

  const leaveSet = useMemo(
    () => new Set(schedule?.leaveDates ?? []),
    [schedule?.leaveDates],
  );

  const weeks = useMemo(() => {
    if (!schedule?.days.length) return [];
    return [schedule.days.slice(0, 7), schedule.days.slice(7, 14)].filter((row) => row.length > 0);
  }, [schedule?.days]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <CalendarDays className="h-4 w-4 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">
            My schedule
          </h3>
          <p className="text-[10px] font-semibold text-slate-500">
            {schedule?.days.length
              ? `${formatRangeLabel(schedule.days)} · ${ROLLING_DAYS} days`
              : `Rolling ${ROLLING_DAYS}-day window`}
          </p>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-xl border border-slate-100 bg-slate-100/80"
              />
            ))}
          </div>
        ) : !schedule?.days.length ? (
          <p className="py-4 text-center text-xs font-semibold text-slate-400">
            Schedule unavailable
          </p>
        ) : (
          <div className="space-y-3">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="space-y-1.5">
                {weeks.length > 1 ? (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    {weekIndex === 0 ? 'This week' : 'Next week'}
                  </p>
                ) : null}
                <div className="grid grid-cols-7 gap-1.5">
                  {week.map((date) => (
                    <DayCell
                      key={date}
                      date={date}
                      shiftType={shiftByDate.get(date) ?? null}
                      onLeave={leaveSet.has(date)}
                      shiftWindows={schedule.shiftWindows}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                AM
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                PM
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Leave
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
