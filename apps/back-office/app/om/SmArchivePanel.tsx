'use client';

import { Archive, Ban, CheckCircle2 } from 'lucide-react';
import type { SmVisitVerificationRecord } from './actions';
import { VERIFICATION_PHOTO_RETENTION_DAYS } from './shift-verification-utils';
import VerificationDatePicker from './VerificationDatePicker';
import SmVerificationQueue from './SmVerificationQueue';

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
export default function SmArchivePanel({
  mode,
  visits,
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  mode: 'approved' | 'rejected';
  visits: SmVisitVerificationRecord[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  markedDates: Set<string>;
}) {
  const isRejected = mode === 'rejected';
  const dateStr = selectedDate.toISOString().slice(0, 10);

  const header = isRejected
    ? {
        title: 'Rejected archive',
        desc: 'SM visits are not rejected — use Hold to flag for re-review instead.',
        icon: Ban,
        accent: 'rose' as const,
      }
    : {
        title: 'Approved archive',
        desc: 'Cleared visit verifications. Browse prior dates to audit past approvals.',
        icon: CheckCircle2,
        accent: 'emerald' as const,
      };

  const Icon = header.icon;
  const accentBorder =
    header.accent === 'rose' ? 'border-rose-200 bg-rose-50/30' : 'border-emerald-200 bg-emerald-50/30';
  const accentText = header.accent === 'rose' ? 'text-rose-800' : 'text-emerald-800';

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
        {!isRejected && (
          <div className="w-full min-w-[200px] sm:w-56">
            <VerificationDatePicker
              label="Visit date"
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              markedDates={markedDates}
              lookbackDays={VERIFICATION_PHOTO_RETENTION_DAYS}
            />
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <Archive className="h-4 w-4 text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            {formatShiftDate(dateStr)}
          </p>
          <span className="ml-auto rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-black text-slate-700">
            {visits.length}
          </span>
        </div>

        {isRejected ? (
          <p className="px-6 py-14 text-center text-sm text-slate-500">
            SM visits use Hold instead of Reject. Check the On hold tab for flagged visits.
          </p>
        ) : visits.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-slate-500">
            No approved visits on this date.
          </p>
        ) : (
          <SmVerificationQueue visits={visits} onRefresh={() => {}} readOnly />
        )}
      </div>
    </div>
  );
}
