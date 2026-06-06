import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../../packages/supabase/server';

export type SMAssignmentOption = {
  value: string;
  label: string;
};

export type SMAssignments = {
  sites: SMAssignmentOption[];
  guards: SMAssignmentOption[];
};

const DEMO_SITES_SM001: SMAssignmentOption[] = [
  { value: 'Lanka Hospitals', label: 'Lanka Hospitals' },
  { value: 'Commercial Bank HQ', label: 'Commercial Bank HQ' },
  { value: 'Arpico Supercentre', label: 'Arpico Supercentre' },
  { value: 'BOC Borella Branch', label: 'BOC Borella Branch' },
  { value: 'Dialog Axiata HQ', label: 'Dialog Axiata HQ' },
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

export async function getCurrentSmEpf(): Promise<string | null> {
  const cookieStore = await cookies();
  const demo = cookieStore.get('sm_demo_session')?.value;
  if (demo) return demo.toUpperCase();

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  return session.user.email?.split('@')[0].toUpperCase() ?? null;
}

export async function getSMAssignments(epf: string): Promise<SMAssignments> {
  if (epf === 'SM-001') {
    const supabase = await createSupabaseServerClient();
    const demoGuards = await fetchAssignedGuards(supabase, epf, DEMO_SITES_SM001.map(s => s.value));
    return {
      sites: DEMO_SITES_SM001,
      guards:
        demoGuards.length > 0
          ? demoGuards
          : [
              { value: 'G-001', label: 'G-001 — Demo Guard A' },
              { value: 'G-002', label: 'G-002 — Demo Guard B' },
            ],
    };
  }

  const supabase = await createSupabaseServerClient();
  const sites = await fetchAssignedSites(supabase, epf);
  const siteNames = sites.map(s => s.value);
  const guards = await fetchAssignedGuards(supabase, epf, siteNames);

  return { sites, guards };
}

async function fetchAssignedSites(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  epf: string,
): Promise<SMAssignmentOption[]> {
  const { data: profileSites, error: profileError } = await supabase
    .from('site_profiles')
    .select('site_name')
    .eq('assigned_sm_epf', epf)
    .order('site_name', { ascending: true });

  if (!profileError && profileSites && profileSites.length > 0) {
    return profileSites.map(row => ({
      value: row.site_name,
      label: row.site_name,
    }));
  }

  const { data: smRow } = await supabase
    .from('employees')
    .select('site')
    .eq('emp_number', epf)
    .single();

  if (!isBenchSite(smRow?.site)) {
    return [{ value: smRow!.site!, label: smRow!.site! }];
  }

  return [];
}

async function fetchAssignedGuards(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  epf: string,
  siteNames: string[],
): Promise<SMAssignmentOption[]> {
  const { data: explicit, error: assignError } = await supabase
    .from('sm_guard_assignments')
    .select('guard_epf')
    .eq('sm_epf', epf);

  if (!assignError && explicit && explicit.length > 0) {
    const epfs = explicit.map(r => r.guard_epf);
    const { data: employees } = await supabase
      .from('employees')
      .select('emp_number, full_name')
      .in('emp_number', epfs)
      .eq('status', 'ACTIVE')
      .order('emp_number', { ascending: true });

    const nameByEpf = Object.fromEntries(
      (employees ?? []).map(e => [e.emp_number, e.full_name as string | null]),
    );

    return epfs
      .sort()
      .map(guardEpf => ({
        value: guardEpf,
        label: guardLabel(guardEpf, nameByEpf[guardEpf] ?? null),
      }));
  }

  if (siteNames.length === 0) return [];

  const { data: siteGuards } = await supabase
    .from('employees')
    .select('emp_number, full_name')
    .eq('status', 'ACTIVE')
    .in('site', siteNames)
    .order('emp_number', { ascending: true });

  return (siteGuards ?? []).map((row) => ({
    value: row.emp_number,
    label: guardLabel(row.emp_number, row.full_name),
  }));
}
