'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { CalendarDays } from 'lucide-react';

import PwaPortalLoading from '../../../../packages/pwa-shell/PwaPortalLoading';
import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { getCafeFrontRosterDays, requestCafeLeave } from '../../app/cafe-front/actions';
import {
  formatPeriodMonthLabel,
  normalizePeriodMonth,
  shiftPeriodMonth,
} from '../../app/executive/cafe/period-month';
import {
  cafeShiftShortLabel,
  normalizeCafeShiftType,
  type CafeShiftType,
} from '../../app/hr/cafe-roster/utils';

export function RosterLeavePanel() {
  const [periodMonth, setPeriodMonth] = useState(normalizePeriodMonth());
  const [shifts, setShifts] = useState<Array<{ shift_date: string; shift_type: string }>>([]);
  const [leaveDates, setLeaveDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const monthDays = useMemo(() => {
    const [year, month] = periodMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return `${periodMonth}-${day}`;
    });
  }, [periodMonth]);

  const reload = () => {
    void getCafeFrontRosterDays(periodMonth).then((payload) => {
      setShifts(payload.shifts);
      setLeaveDates(payload.leaveDates);
      setLoading(false);
    });
  };

  useEffect(() => {
    setLoading(true);
    reload();
  }, [periodMonth]);

  const shiftByDate = new Map<string, CafeShiftType>();
  for (const shift of shifts) {
    const normalized = normalizeCafeShiftType(shift.shift_type);
    if (normalized) shiftByDate.set(shift.shift_date, normalized);
  }
  const leaveSet = new Set(leaveDates);

  const submitLeave = () => {
    if (!selectedDate || !reason.trim()) return;
    startTransition(async () => {
      const result = await requestCafeLeave({ leaveDate: selectedDate, reason });
      if (result.ok) {
        setReason('');
        setSelectedDate(null);
        reload();
      } else if (result.error) alert(result.error);
    });
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        <h2 className="text-lg font-bold uppercase text-slate-800">My Roster</h2>
        <div className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 p-0.5">
          <button
            type="button"
            onClick={() => setPeriodMonth((m) => shiftPeriodMonth(m, -1))}
            className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600"
          >
            ←
          </button>
          <span className="min-w-[9rem] px-2 text-center text-xs font-black uppercase text-slate-800">
            {formatPeriodMonthLabel(periodMonth)}
          </span>
          <button
            type="button"
            onClick={() => setPeriodMonth((m) => shiftPeriodMonth(m, 1))}
            className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600"
          >
            →
          </button>
        </div>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs text-slate-500">
          Tap a rostered day to request leave. No salary totals shown — schedule only.
        </p>

        {loading ? (
          <PwaPortalLoading portal="cafe-front" message="Loading roster…" className="min-h-[10rem] py-8" />
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((date) => {
              const dayNum = Number(date.slice(-2));
              const shiftType = shiftByDate.get(date) ?? null;
              const rostered = Boolean(shiftType);
              const onLeave = leaveSet.has(date);
              const selected = selectedDate === date;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!rostered}
                  onClick={() => setSelectedDate(date)}
                  className={`rounded-xl border px-2 py-3 text-center text-xs font-bold transition-all ${
                    selected
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                      : onLeave
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : shiftType === 'MORNING'
                          ? 'border-sky-200 bg-sky-50/80 text-sky-900 hover:bg-sky-100/80'
                          : shiftType === 'EVENING'
                            ? 'border-violet-200 bg-violet-50/80 text-violet-900 hover:bg-violet-100/80'
                            : 'border-slate-100 bg-slate-50/50 text-slate-300'
                  }`}
                >
                  {dayNum}
                  {onLeave ? (
                    <span className="mt-1 block text-[8px] uppercase">Leave</span>
                  ) : shiftType ? (
                    <span className="mt-1 block text-[8px] uppercase">
                      {cafeShiftShortLabel(shiftType)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {selectedDate ? (
          <div className="mt-5 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-indigo-800">
              Leave request · {selectedDate}
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for leave request"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              rows={3}
            />
            <button
              type="button"
              disabled={isPending || !reason.trim()}
              onClick={submitLeave}
              className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40"
            >
              Submit leave request
            </button>
          </div>
        ) : null}
      </div>
    </ExecutiveGlassCard>
  );
}
