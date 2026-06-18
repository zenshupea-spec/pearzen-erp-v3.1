import { createSupabaseServiceClient } from '../../../../../../packages/supabase/server';
import AttendanceConfirmClient from './AttendanceConfirmClient';
import { getShiftsToConfirm, resolveEpf } from './actions';

export const dynamic = 'force-dynamic';

function guardLabel(empNumber: string, fullName: string | null) {
  const name = fullName?.trim();
  return name ? `${empNumber} — ${name}` : empNumber;
}

function isBenchSite(site: string | null | undefined) {
  if (!site) return true;
  const s = site.toLowerCase();
  return s.includes('unassigned') || s.includes('bench');
}

export default async function AttendanceConfirmPage() {
  const epf = await resolveEpf();

  const shifts = await getShiftsToConfirm(epf);
  const shift = shifts[0] ?? null;

  type SiteEntry = { value: string; label: string; required: number };
  let sites: SiteEntry[] = [];

  const supabase = createSupabaseServiceClient();

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

  type GuardEntry = { epf: string; label: string; defaultSite: string | null; phone: string | null };
  let guards: GuardEntry[] = [];

  const siteNames = sites.map((s) => s.value);

  const { data: explicit, error: assignError } = await supabase
    .from('sm_guard_assignments')
    .select('guard_epf')
    .eq('sm_epf', epf);

  if (!assignError && explicit && explicit.length > 0) {
      const epfs = explicit.map((r: { guard_epf: string }) => r.guard_epf);
      const { data: employees } = await supabase
        .from('employees')
        .select('emp_number, full_name, site, phone')
        .in('emp_number', epfs)
        .eq('status', 'ACTIVE')
        .order('emp_number', { ascending: true });

      guards = (employees ?? []).map((e: { emp_number: string; full_name: string | null; site: string | null; phone: string | null }) => ({
        epf: e.emp_number,
        label: guardLabel(e.emp_number, e.full_name),
        defaultSite: e.site ?? null,
        phone: e.phone ?? null,
      }));
    } else if (siteNames.length > 0) {
      const { data: employees } = await supabase
        .from('employees')
        .select('emp_number, full_name, site, phone')
        .eq('status', 'ACTIVE')
        .eq('group', 'GUARD_FIELD')
        .in('site', siteNames)
        .order('emp_number', { ascending: true });

      guards = (employees ?? []).map((e: { emp_number: string; full_name: string | null; site: string | null; phone: string | null }) => ({
        epf: e.emp_number,
        label: guardLabel(e.emp_number, e.full_name),
        defaultSite: e.site ?? null,
        phone: e.phone ?? null,
      }));
    }

  type ExistingEntry = { site_name: string; guard_epf: string; status: string };
  let existing: ExistingEntry[] = [];

  if (shift) {
    const { data } = await supabase
      .from('sm_guard_attendance')
      .select('site_name, guard_epf, status')
      .eq('sm_epf', epf)
      .eq('shift_date', shift.shift_date)
      .eq('shift_type', shift.shift_type)
      .neq('status', 'CANCELLED');

    existing = data ?? [];
  }

  return (
    <AttendanceConfirmClient
      shift={shift}
      sites={sites}
      guards={guards}
      existing={existing}
      totalSectorGuards={guards.length}
    />
  );
}
