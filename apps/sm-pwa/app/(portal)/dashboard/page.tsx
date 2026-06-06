import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  MapPin,
  CalendarCheck,
  AlertTriangle,
  Gavel,
  Shirt,
  LogOut,
  Shield,
  Users,
} from 'lucide-react';
import DashboardStatsClient from './DashboardStatsClient';

export const dynamic = 'force-dynamic';

export default async function SMDashboard() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('sm_demo_session')?.value === 'SM-001';

  let epf: string;
  let smName: string;
  let smSite: string;
  let todayVisits: number;
  let openIncidents: number;
  let sitesToVisit: number;

  if (isDemo) {
    epf = 'SM-001';
    smName = 'Demo Manager';
    smSite = 'Demo Site';
    todayVisits = 0;
    openIncidents = 2;
    sitesToVisit = 5;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) redirect('/login');

    epf = session.user.email?.split('@')[0].toUpperCase() ?? '';

    const { data: authRecord } = await supabase
      .from('sm_portal_auth')
      .select('needs_pin_setup')
      .eq('epf_number', epf)
      .single();

    if (authRecord?.needs_pin_setup) redirect('/set-pin');

    const { data: sm } = await supabase
      .from('employees')
      .select('full_name, rank, site')
      .eq('emp_number', epf)
      .single();

    smName = sm?.full_name ?? epf;
    smSite = sm?.site ?? 'Unassigned';

    const today = new Date().toISOString().split('T')[0];
    const { count: visits } = await supabase
      .from('sm_visit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('sm_epf', epf)
      .gte('created_at', `${today}T00:00:00`)
      .eq('visit_type', 'VISIT');

    const { data: ownIncidents } = await supabase
      .from('sm_incident_reports')
      .select('id, ack_sm, status')
      .eq('sm_epf', epf);

    const { data: assignedForIncidents } = await supabase
      .from('site_profiles')
      .select('site_name')
      .eq('assigned_sm_epf', epf);

    const siteNamesForIncidents = (assignedForIncidents ?? []).map(
      (s: { site_name: string }) => s.site_name,
    );

    const { data: siteIncidents } =
      siteNamesForIncidents.length > 0
        ? await supabase
            .from('sm_incident_reports')
            .select('id, ack_sm, status')
            .in('site_name', siteNamesForIncidents)
        : { data: [] };

    const incidentIds = new Set<string>();
    const incidentRows = [...(ownIncidents ?? []), ...(siteIncidents ?? [])].filter(
      (row: { id: string; ack_sm?: boolean; status: string }) => {
        if (incidentIds.has(row.id)) return false;
        incidentIds.add(row.id);
        return true;
      },
    );

    // Assigned sites not yet visited today
    const { data: assignedSitesData } = await supabase
      .from('site_profiles')
      .select('site_name')
      .eq('assigned_sm_epf', epf);

    const assignedSiteNames = (assignedSitesData ?? []).map((s: { site_name: string }) => s.site_name);

    const { data: visitedTodayData } = await supabase
      .from('sm_visit_logs')
      .select('site_name')
      .eq('sm_epf', epf)
      .eq('visit_type', 'VISIT')
      .gte('created_at', `${today}T00:00:00`);

    const visitedTodaySet = new Set((visitedTodayData ?? []).map((v: { site_name: string }) => v.site_name));
    const remaining = assignedSiteNames.filter((s: string) => !visitedTodaySet.has(s));

    todayVisits = visits ?? 0;
    openIncidents = incidentRows.filter(
      (row: { ack_sm?: boolean; status: string }) =>
        row.ack_sm === false || (row.ack_sm === undefined && row.status === 'OPEN'),
    ).length;
    sitesToVisit = remaining.length;
  }

  async function handleLogout() {
    'use server';
    const cookieJar = await cookies();
    cookieJar.delete('sm_demo_session');
    const db = await createSupabaseServerClient();
    await db.auth.signOut();
    redirect('/login');
  }

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' :
    now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 flex flex-col min-h-[100dvh] p-5 space-y-5">

      {/* ── Header ── */}
      <header className="flex justify-between items-start pt-2">
        <div className="space-y-0.5">
          <p className="text-sm text-amber-700/80 font-mono uppercase tracking-widest">{greeting}</p>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-tight">
            {smName.split(' ')[0]}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-mono text-slate-500">{epf}</span>
            <span className="text-slate-300">·</span>
            <span className="text-sm font-mono text-slate-500 truncate max-w-[120px]">{smSite}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600" />
            </div>
            <span className="text-sm font-black text-amber-700 tracking-widest uppercase">Active</span>
          </div>
          <form action={handleLogout}>
            <button type="submit" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 shadow-sm hover:text-red-600 hover:border-red-200 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>

      {/* ── Quick Stats (visits + incidents open modals) ── */}
      <DashboardStatsClient
        todayVisits={todayVisits}
        openIncidents={openIncidents}
        sitesToVisit={sitesToVisit}
        isDemo={isDemo}
      />

      {/* ── Section: Field Movements ── */}
      <section className="space-y-2">
        <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-1">Field Movements</p>
        <div className="flex justify-center">
          <Link
            href="/visit"
            className="flex flex-col items-center gap-3 group"
          >
            <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-600 transition-all active:scale-95 group-hover:bg-amber-500/15 group-hover:border-amber-500/60 shadow-sm">
              <MapPin className="w-10 h-10" />
            </div>
            <div className="text-center">
              <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">Log Visit</p>
              <p className="text-sm text-slate-500 font-bold mt-0.5">Record site visit</p>
            </div>
          </Link>
        </div>
      </section>

      {/* ── Section: Attendance ── */}
      <section className="space-y-2">
        <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-1">Attendance</p>
        <div className="space-y-3">
          <ActionCardWide
            href="/attendance/guards"
            icon={<Users className="w-6 h-6" />}
            label="Guard Attendance"
            sub="Assign guards to sites for the shift"
            accent="emerald"
          />
          <ActionCardWide
            href="/attendance/confirm"
            icon={<CalendarCheck className="w-6 h-6" />}
            label="Confirm Shift"
            sub="Final confirmation · 2 hrs before start"
            accent="violet"
          />
        </div>
      </section>

      {/* ── Section: Guard Actions ── */}
      <section className="space-y-2">
        <p className="text-sm font-black text-slate-500 uppercase tracking-[0.2em] px-1">Guard Actions</p>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            href="/incident"
            icon={<AlertTriangle className="w-7 h-7" />}
            label="Report Incident"
            sub="File a site incident"
            accent="red"
          />
          <ActionCard
            href="/penalty"
            icon={<Gavel className="w-7 h-7" />}
            label="Issue Penalty"
            sub="Guard disciplinary"
            accent="rose"
          />
        </div>
        <ActionCardWide
          href="/uniform"
          icon={<Shirt className="w-6 h-6" />}
          label="Uniform Issue / Request"
          sub="Issue from stock or request courier"
          accent="violet"
        />
      </section>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 pb-4 mt-auto">
        <Shield className="w-3 h-3 text-slate-400" />
        <p className="text-sm text-slate-400 font-mono font-bold">Pearzen SM Portal · Secured</p>
      </div>

    </div>
  );
}

/* ── Sub-components ── */

function ActionCard({
  href,
  icon,
  label,
  sub,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  accent: string;
}) {
  const colors: Record<string, string> = {
    amber: 'border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-50 [&>div:first-child]:bg-amber-500/10 [&>div:first-child]:text-amber-600',
    orange: 'border-orange-500/30 hover:border-orange-500/50 hover:bg-orange-50 [&>div:first-child]:bg-orange-500/10 [&>div:first-child]:text-orange-600',
    red: 'border-red-500/30 hover:border-red-500/50 hover:bg-red-50 [&>div:first-child]:bg-red-500/10 [&>div:first-child]:text-red-600',
    rose: 'border-rose-500/30 hover:border-rose-500/50 hover:bg-rose-50 [&>div:first-child]:bg-rose-500/10 [&>div:first-child]:text-rose-600',
    violet: 'border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-50 [&>div:first-child]:bg-violet-500/10 [&>div:first-child]:text-violet-600',
  };

  return (
    <Link
      href={href}
      className={`flex flex-col p-4 bg-white/90 border border-slate-200 rounded-2xl shadow-sm transition-all active:scale-95 gap-3 ${colors[accent] ?? colors['amber']}`}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{label}</p>
        <p className="text-sm text-slate-500 font-bold mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}

function ActionCardWide({
  href,
  icon,
  label,
  sub,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  accent: string;
}) {
  const colors: Record<string, { wrap: string; icon: string }> = {
    sky: {
      wrap: 'border-sky-500/30 hover:border-sky-500/50 hover:bg-sky-50',
      icon: 'bg-sky-500/10 text-sky-600',
    },
    emerald: {
      wrap: 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-50',
      icon: 'bg-emerald-500/10 text-emerald-600',
    },
    violet: {
      wrap: 'border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-50',
      icon: 'bg-violet-500/10 text-violet-600',
    },
  };
  const c = colors[accent] ?? colors['sky'];

  return (
    <Link
      href={href}
      className={`flex items-center gap-4 p-4 bg-white/90 border border-slate-200 rounded-2xl shadow-sm transition-all active:scale-95 ${c.wrap}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${c.icon}`}>
        {icon}
      </div>
      <div>
        <p className="text-base font-black text-slate-900 uppercase tracking-tight leading-tight">{label}</p>
        <p className="text-sm text-slate-500 font-bold mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}
