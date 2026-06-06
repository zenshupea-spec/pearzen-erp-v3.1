'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatSelectedDate(d: Date) {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function VerificationCalendar({
  selectedDate,
  onSelectDate,
  onClose,
  today,
  markedDates,
  unclearedDates,
  minDateStr,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onClose: () => void;
  today: Date;
  markedDates?: Set<string>;
  /** Dates that still have verification queue work — shown in red. */
  unclearedDates?: Set<string>;
  minDateStr?: string;
}) {
  const [viewYear, setViewYear] = useState(selectedDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getUTCMonth());

  const todayStr = toDateStr(today);
  const selectedStr = toDateStr(selectedDate);

  const firstDow = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const canGoNext =
    viewYear < today.getUTCFullYear() ||
    (viewYear === today.getUTCFullYear() && viewMonth < today.getUTCMonth());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black text-slate-700">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7">
          {DAYS.map((d) => (
            <span
              key={d}
              className="text-center text-[9px] font-black uppercase tracking-wider text-slate-400"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelect = dateStr === selectedStr;
            const isToday = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            const isBeforeMin = minDateStr ? dateStr < minDateStr : false;
            const hasItems = markedDates?.has(dateStr);
            const isUncleared = unclearedDates?.has(dateStr);
            const disabled = isFuture || isBeforeMin;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onSelectDate(new Date(`${dateStr}T00:00:00Z`));
                  onClose();
                }}
                className={[
                  'relative flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition-all',
                  disabled ? 'cursor-default opacity-25' : 'cursor-pointer',
                  isSelect ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1' : '',
                  !isSelect && isUncleared && !disabled
                    ? 'bg-rose-50 font-black text-rose-700 hover:bg-rose-100'
                    : '',
                  !isSelect && isToday && !isUncleared
                    ? 'bg-slate-100 font-black text-slate-900 hover:bg-slate-200'
                    : '',
                  !isSelect && !disabled && !isToday && !isUncleared
                    ? 'text-slate-600 hover:bg-slate-100'
                    : '',
                  !isSelect && disabled ? 'text-slate-300' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {day}
                {isUncleared && !isSelect && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-rose-500" />
                )}
                {hasItems && !isSelect && !isUncleared && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-indigo-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function VerificationDatePicker({
  selectedDate,
  onSelectDate,
  markedDates,
  unclearedDates,
  lookbackDays = 60,
  className = '',
  label,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDates?: Set<string>;
  unclearedDates?: Set<string>;
  /** How far back dates can be selected (matches photo retention). */
  lookbackDays?: number;
  className?: string;
  label?: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const minDateStr = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - lookbackDays);
    return d.toISOString().slice(0, 10);
  }, [lookbackDays]);
  const selectedStr = toDateStr(selectedDate);
  const selectedIsUncleared = unclearedDates?.has(selectedStr) ?? false;

  return (
    <div className={`relative ${className}`}>
      {label && (
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </p>
      )}
      <button
        type="button"
        onClick={() => setCalendarOpen((o) => !o)}
        className={[
          'inline-flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-bold shadow-sm transition-all active:scale-[0.99]',
          selectedIsUncleared
            ? 'border-rose-300 text-rose-800 hover:border-rose-400 hover:bg-rose-50'
            : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        ].join(' ')}
      >
        <CalendarDays
          className={`h-3.5 w-3.5 ${selectedIsUncleared ? 'text-rose-500' : 'text-slate-400'}`}
        />
        <span className={`font-mono ${selectedIsUncleared ? 'text-rose-800' : ''}`}>
          {formatSelectedDate(selectedDate)}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-slate-400 transition-transform duration-150 ${calendarOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {calendarOpen && (
        <VerificationCalendar
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onClose={() => setCalendarOpen(false)}
          today={today}
          markedDates={markedDates}
          unclearedDates={unclearedDates}
          minDateStr={minDateStr}
        />
      )}
    </div>
  );
}
