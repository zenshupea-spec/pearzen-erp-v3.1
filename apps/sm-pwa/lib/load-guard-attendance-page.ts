import { createSupabaseServiceClient } from '../../../packages/supabase/server';
import { resolveSmSessionEpf } from './sm-assignments';
import { getSmPortalAssignmentBundle } from './sm-portal-db';
import { colomboTodayIso } from './shift-timing';
import type { SiteShiftRequirementRow } from './site-shift-requirements';

export type ExistingAttendanceEntry = {
  site_name: string;
  guard_epf: string;
  status: string;
};

export const dynamic = 'force-dynamic';

export type GuardAttendanceSite = {
  value: string;
  label: string;
  required: number;
  shiftRows: SiteShiftRequirementRow[];
};

export type GuardAttendancePageData = {
  sites: GuardAttendanceSite[];
  guards: { epf: string; label: string; defaultSite: string | null }[];
  existing: ExistingAttendanceEntry[];
  defaultDate: string;
  canonicalSmEpf: string;
};

export async function loadGuardAttendancePageData(): Promise<GuardAttendancePageData> {
  const loginEpf = await resolveSmSessionEpf();
  const bundle = await getSmPortalAssignmentBundle(loginEpf);
  const canonicalSmEpf = bundle.canonicalSmEpf;
  const sites = bundle.sites.map((site) => ({
    value: site.site_name,
    label: site.site_name,
    required: site.required_guards,
    shiftRows: site.shiftRows,
  }));
  const guards = bundle.guards.map((guard) => ({
    epf: guard.epf,
    label: guard.label,
    defaultSite: guard.defaultSite,
  }));

  const defaultDate = colomboTodayIso();
  const db = createSupabaseServiceClient();
  const { data: existingData } = await db
    .from('sm_guard_attendance')
    .select('site_name, guard_epf, status')
    .eq('sm_epf', canonicalSmEpf)
    .eq('shift_date', defaultDate)
    .eq('shift_type', 'DAY');

  return {
    sites,
    guards,
    existing: existingData ?? [],
    defaultDate,
    canonicalSmEpf,
  };
}
