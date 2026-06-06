import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { getCompanyLogoUrl } from '../../../packages/supabase/company-branding';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, Shield, LogOut } from 'lucide-react';
import CheckInButton from './components/CheckInButton';
import { calculateTodayEarnings } from '../lib/earnings-engine';
import { resolveGuardSession } from '../lib/guard-auth';
import { createSupabaseServiceClient } from '../../../packages/supabase/server';

export default async function GuardDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const service = createSupabaseServiceClient();
  const { epfNo, rosterKey, employee } = await resolveGuardSession(
    service,
    session.user.email,
  );

  if (!rosterKey) redirect('/login');

  const guardName = employee?.full_name ?? rosterKey;
  const displayEpf = epfNo || rosterKey;
  const earningsData = await calculateTodayEarnings(rosterKey);
  const logoUrl = await getCompanyLogoUrl();

  async function handleLogout() {
    'use server';
    const supabaseServer = await createSupabaseServerClient();
    await supabaseServer.auth.signOut();
    redirect('/login');
  }

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-1 flex-col gap-5 p-5 pb-6">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200/90 pb-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg ${
                logoUrl ? 'border border-slate-200 bg-white' : 'bg-slate-900 text-white'
              }`}
            >
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt=""
                  className="h-full w-full object-contain p-0.5"
                />
              ) : (
                <Shield className="h-4 w-4" strokeWidth={2.25} />
              )}
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
              Guard portal
            </p>
          </div>
          <h1 className="truncate text-xl font-black uppercase tracking-tight text-slate-900">
            {guardName}
          </h1>
          <p className="mt-0.5 font-mono text-xs font-bold text-slate-500">EPF {displayEpf}</p>
        </div>
        <form action={handleLogout}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-colors hover:border-rose-200 hover:text-rose-700"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2.25} />
            Logout
          </button>
        </form>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-5 text-white shadow-lg shadow-slate-900/20">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
          Today&apos;s earnings
        </p>
        <p className="mt-2 text-4xl font-black tabular-nums tracking-tight">
          <span className="mr-1 text-2xl font-bold text-slate-400">
            {earningsData.currency}
          </span>
          {earningsData.todayTotal.toLocaleString()}
        </p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-300">
          {earningsData.shiftsCompleted > 0
            ? `${earningsData.shiftsCompleted} verified shift${earningsData.shiftsCompleted === 1 ? '' : 's'} today · LKR ${earningsData.shiftPay.toLocaleString()} per shift (by start time)`
            : earningsData.onShift
              ? `On shift — LKR ${earningsData.shiftPay.toLocaleString()} counts when you check out`
              : earningsData.rosteredToday > 0
                ? `${earningsData.rosteredToday} shift${earningsData.rosteredToday === 1 ? '' : 's'} rostered today — check in to start earning`
                : 'No shifts rostered for today'}
        </p>
      </section>

      <section className="flex flex-1 flex-col justify-center py-1">
        <CheckInButton empNumber={rosterKey} layout="portal" />
      </section>

      <nav className="flex flex-col gap-2.5">
        <Link
          href="/dashboard/incident"
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-amber-300/80 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-200/80">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-black uppercase tracking-wide text-slate-900">
              Report incident
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Log security or site issues for HQ
            </span>
          </span>
        </Link>

        <Link
          href="/dashboard/schedule"
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-400/60 hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800 ring-1 ring-slate-200/80">
            <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-black uppercase tracking-wide text-slate-900">
              Upcoming shifts
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              View your rostered deployments
            </span>
          </span>
        </Link>
      </nav>
    </div>
  );
}
