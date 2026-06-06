import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';
import GuardAttendanceClient from './GuardAttendanceClient';
import type { ExistingAttendanceEntry } from './actions';

export const dynamic = 'force-dynamic';

const DEMO_SITES: { name: string; required: number }[] = [
  { name: 'Lanka Hospitals',    required: 3 },
  { name: 'Commercial Bank HQ', required: 2 },
  { name: 'Arpico Supercentre', required: 2 },
  { name: 'BOC Borella Branch', required: 1 },
  { name: 'Dialog Axiata HQ',   required: 2 },
];

const DEMO_GUARDS = [
  { epf: 'G-001', label: 'G-001 — Demo Guard Alpha', defaultSite: 'Lanka Hospitals' },
  { epf: 'G-002', label: 'G-002 — Demo Guard Beta', defaultSite: 'Lanka Hospitals' },
  { epf: 'G-003', label: 'G-003 — Demo Guard Gamma', defaultSite: 'Commercial Bank HQ' },
  { epf: 'G-004', label: 'G-004 — Demo Guard Delta', defaultSite: 'Arpico Supercentre' },
  { epf: 'G-005', label: 'G-005 — Demo Guard Epsilon', defaultSite: 'BOC Borella Branch' },
  { epf: 'G-006', label: 'G-006 — Demo Guard Zeta', defaultSite: null },
];

function guardLabel(empNumber: string, fullName: string | null) {
  const name = fullName?.trim();
  return name ? `${empNumber} — ${name}` : empNumber;
}

function isBenchSite(site: string | null | undefined) {
  if (!site) return true;
  const s = site.toLowerCase();
  return s.includes('unassigned') || s.includes('bench');
}

export default async function GuardAttendancePage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('sm_demo_session')?.value === 'SM-001';

  const supabase = await createSupabaseServerClient();

  let epf: string;
  if (isDemo) {
    epf = 'SM-001';
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) redirect('/login');
    epf = session.user.email?.split('@')[0].toUpperCase() ?? '';
  }

  // ── 1. Resolve assigned sites (with required guard count) ─────────
  type SiteEntry = { value: string; label: string; required: number };
  let sites: SiteEntry[] = [];

  if (isDemo) {
    sites = DEMO_SITES.map(s => ({ value: s.name, label: s.name, required: s.required }));
  } else {
    const { data: profileSites } = await supabase
      .from('site_profiles')
      .select('site_name, required_guards')
      .eq('assigned_sm_epf', epf)
      .order('site_name', { ascending: true });

    if (profileSites && profileSites.length > 0) {
      sites = profileSites.map((s: { site_name: string; required_guards: number }) => ({
        value: s.site_name,
        label: s.site_name,
        required: s.required_guards ?? 1,
      }));
    } else {
      const { data: sm } = await supabase
        .from('employees')
        .select('site')
        .eq('emp_number', epf)
        .single();
      if (!isBenchSite(sm?.site)) {
        sites = [{ value: sm!.site!, label: sm!.site!, required: 1 }];
      }
    }
  }

  const siteNames = sites.map(s => s.value);

  // ── 2. Resolve guards with their default site ──────────────────────
  type GuardWithSite = { epf: string; label: string; defaultSite: string | null };
  let guards: GuardWithSite[] = [];

  if (!isDemo) {
    // Try explicit sm_guard_assignments first
    const { data: explicit, error: assignError } = await supabase
      .from('sm_guard_assignments')
      .select('guard_epf')
      .eq('sm_epf', epf);

    if (!assignError && explicit && explicit.length > 0) {
      const epfs = explicit.map((r: { guard_epf: string }) => r.guard_epf);
      const { data: employees } = await supabase
        .from('employees')
        .select('emp_number, full_name, site')
        .in('emp_number', epfs)
        .eq('status', 'ACTIVE')
        .order('emp_number', { ascending: true });

      guards = (employees ?? []).map((e: { emp_number: string; full_name: string | null; site: string | null }) => ({
        epf: e.emp_number,
        label: guardLabel(e.emp_number, e.full_name),
        defaultSite: e.site ?? null,
      }));
    } else if (siteNames.length > 0) {
      // Fallback: guards whose home site is one of the SM's sites
      const { data: employees } = await supabase
        .from('employees')
        .select('emp_number, full_name, site')
        .eq('status', 'ACTIVE')
        .eq('group', 'GUARD_FIELD')
        .in('site', siteNames)
        .order('emp_number', { ascending: true });

      guards = (employees ?? []).map((e: { emp_number: string; full_name: string | null; site: string | null }) => ({
        epf: e.emp_number,
        label: guardLabel(e.emp_number, e.full_name),
        defaultSite: e.site ?? null,
      }));
    }
  } else {
    guards = DEMO_GUARDS;
  }

  // ── 3. Today's existing attendance ────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const { data: existingData } = await supabase
    .from('sm_guard_attendance')
    .select('site_name, guard_epf, status')
    .eq('sm_epf', epf)
    .eq('shift_date', today);

  const existing: ExistingAttendanceEntry[] = existingData ?? [];

  return (
    <GuardAttendanceClient
      sites={sites}
      guards={guards}
      existing={existing}
      defaultDate={today}
    />
  );
}
