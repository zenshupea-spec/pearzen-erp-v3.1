import Link from 'next/link';
import { CalendarDays, Home } from 'lucide-react';

import HrHubPills from '../HrHubPills';
import CafeRosterClient from './CafeRosterClient';
import { getCafeRosterDeskData } from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CafeRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const params = await searchParams;
  const data = await getCafeRosterDeskData({
    siteProfileId: params.site ?? null,
  });

  const pendingCount = data.pendingLeaves.length;
  const pendingCheckinCount = data.pendingCheckinVerifications.length;
  const staffCount = data.staff.length;

  return (
    <div className="-mx-4 md:-mx-8 min-h-full">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-2.5">
                <CalendarDays className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black uppercase tracking-widest text-slate-900">
                  Café Staff Roster
                </h1>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Rolling 14-day schedule · 9-hour AM/PM shifts from MD café hours
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {staffCount > 0 ? (
                <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                  {staffCount} staff
                </span>
              ) : null}
              {pendingCheckinCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800">
                  {pendingCheckinCount} check-in pending
                </span>
              ) : null}
              {pendingCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">
                  {pendingCount} leave pending
                </span>
              ) : null}
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50"
              >
                <Home className="h-3.5 w-3.5" />
                HQ Hub
              </Link>
            </div>
          </div>

          <HrHubPills />
        </div>
      </div>

      <div className="mx-auto max-w-[1800px] px-4 py-6 md:px-8">
        <CafeRosterClient initialData={data} />
      </div>
    </div>
  );
}
