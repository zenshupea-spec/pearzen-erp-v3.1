import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import { getUpcomingShifts } from '../../actions';
import { resolveGuardSession } from '../../../lib/guard-auth';
import { colomboTodayIso } from '../../../lib/guard-shift-resolver';

function formatShiftDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTimeRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const s = new Date(start).toLocaleTimeString('en-GB', opts);
  const e = new Date(end).toLocaleTimeString('en-GB', opts);
  return `${s} – ${e}`;
}

export default async function SchedulePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const service = createSupabaseServiceClient();
  const { rosterKey } = await resolveGuardSession(service, session.user.email);
  if (!rosterKey) redirect('/login');
  const shifts = await getUpcomingShifts(rosterKey);

  return (
    <div className="relative flex min-h-[100dvh] flex-1 flex-col p-6">
      <header className="mb-8 flex items-center gap-4 border-b border-slate-200/80 pb-4">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Roster
          </p>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
            Upcoming shifts
          </h1>
        </div>
      </header>

      {shifts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
          <CalendarDays className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-600">No upcoming shifts</p>
          <p className="max-w-xs text-xs text-slate-500">
            When your sector manager confirms roster, shifts will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shifts.map((shift) => {
            const isToday = shift.shiftDate === colomboTodayIso();
            return (
              <li
                key={shift.id}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-blue-600">
                      {formatShiftDate(shift.shiftDate)}
                      {isToday ? ' · Today' : ''}
                    </p>
                    <p className="mt-1 text-base font-black uppercase tracking-wide text-slate-900">
                      {shift.siteName}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                    Confirmed
                  </span>
                </div>
                <p className="mt-3 font-mono text-xs font-medium uppercase tracking-tight text-slate-500">
                  {formatTimeRange(shift.startTime, shift.endTime)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
