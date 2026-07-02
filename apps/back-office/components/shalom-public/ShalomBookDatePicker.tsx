'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  buildColomboMonthGrid,
  colomboTodayIso,
  formatColomboGuestDate,
  formatColomboMonthLabel,
  shiftColomboMonth,
} from '../../lib/shalom-public-colombo-dates';
import { shalomPublicDisplayClass, shalomPublicSurfaceClass } from '../../lib/shalom-public-tokens';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function ShalomBookMonthGrid({
  year,
  month,
  earliestCheckInIso,
  horizonEndIso,
  availabilityByDate,
  checkIn,
  checkOut,
  onSelectDate,
}: {
  year: number;
  month: number;
  earliestCheckInIso: string;
  horizonEndIso: string;
  availabilityByDate: Map<string, boolean>;
  checkIn: string;
  checkOut: string;
  onSelectDate: (isoDate: string) => void;
}) {
  const cells = buildColomboMonthGrid(year, month);
  const todayIso = colomboTodayIso();

  return (
    <div>
      <p
        className={`mb-3 text-center text-base font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
      >
        {formatColomboMonthLabel(year, month)}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--shalom-muted)]">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((isoDate, index) => {
          if (!isoDate) {
            return <div key={`empty-${year}-${month}-${index}`} aria-hidden />;
          }

          const isTooSoon = isoDate < earliestCheckInIso;
          const isBeyondHorizon = isoDate >= horizonEndIso;
          const nightAvailable = availabilityByDate.get(isoDate) ?? false;
          const isDisabled = isTooSoon || isBeyondHorizon || !nightAvailable;

          const isStart = checkIn === isoDate;
          const isEnd = checkOut === isoDate;
          const inRange = checkIn && checkOut && isoDate > checkIn && isoDate < checkOut;

          let cellClass =
            'relative flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition';

          if (isDisabled) {
            cellClass += ' cursor-not-allowed text-[color:var(--shalom-muted)]/45 line-through';
          } else {
            cellClass +=
              ' cursor-pointer text-[color:var(--shalom-text)] hover:bg-[color:var(--shalom-accent-soft)]';
          }

          if (isStart || isEnd) {
            cellClass +=
              ' bg-[color:var(--shalom-accent)] text-white hover:bg-[color:var(--shalom-accent-hover)]';
          } else if (inRange) {
            cellClass +=
              ' bg-[color:var(--shalom-accent-soft)] text-[color:var(--shalom-accent-hover)]';
          }

          if (isoDate === todayIso && !isStart && !isEnd) {
            cellClass += ' ring-1 ring-[color:var(--shalom-accent)]/40';
          }

          return (
            <button
              key={isoDate}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelectDate(isoDate)}
              className={cellClass}
              aria-label={formatColomboGuestDate(isoDate)}
              aria-pressed={isStart || isEnd}
            >
              {Number(isoDate.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ShalomBookDatePicker({
  layout = 'double',
  viewYear,
  viewMonth,
  earliestCheckInIso,
  horizonEndIso,
  availabilityByDate,
  checkIn,
  checkOut,
  canGoPrev,
  canGoNext,
  rangeError,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  layout?: 'single' | 'double';
  viewYear: number;
  viewMonth: number;
  earliestCheckInIso: string;
  horizonEndIso: string;
  availabilityByDate: Map<string, boolean>;
  checkIn: string;
  checkOut: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  rangeError: string | null;
  onSelectDate: (isoDate: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const nextMonth = shiftColomboMonth(viewYear, viewMonth, 1);
  const embedded = layout === 'single';

  return (
    <div className={embedded ? '' : `p-5 sm:p-6 ${shalomPublicSurfaceClass}`}>
      <div className={`flex items-center justify-between gap-3 ${embedded ? 'mb-3' : 'mb-4'}`}>
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!canGoPrev}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--shalom-border)] text-[color:var(--shalom-text)] disabled:opacity-40"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--shalom-muted)]">
          Select check-in, then check-out
        </p>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={!canGoNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--shalom-border)] text-[color:var(--shalom-text)] disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={embedded ? '' : 'grid gap-8 md:grid-cols-2'}>
        <ShalomBookMonthGrid
          year={viewYear}
          month={viewMonth}
          earliestCheckInIso={earliestCheckInIso}
          horizonEndIso={horizonEndIso}
          availabilityByDate={availabilityByDate}
          checkIn={checkIn}
          checkOut={checkOut}
          onSelectDate={onSelectDate}
        />
        {!embedded ? (
          <ShalomBookMonthGrid
            year={nextMonth.year}
            month={nextMonth.month}
            earliestCheckInIso={earliestCheckInIso}
            horizonEndIso={horizonEndIso}
            availabilityByDate={availabilityByDate}
            checkIn={checkIn}
            checkOut={checkOut}
            onSelectDate={onSelectDate}
          />
        ) : null}
      </div>

      {rangeError ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {rangeError}
        </p>
      ) : null}
    </div>
  );
}
