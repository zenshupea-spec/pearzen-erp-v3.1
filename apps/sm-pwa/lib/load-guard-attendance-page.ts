import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../packages/supabase/server';
import { getSmPortalAssignmentBundle } from './sm-portal-db';
import { colomboTodayIso } from './shift-timing';
import type { SiteShiftRequirementRow } from './site-shift-requirements';

export type ExistingAttendanceEntry = {
  site_name: string;
  guard_epf: string;
  status: string;
};

export const dynamic = 'force-dynamic';

const DEMO_SITES: { name: string; required: number }[] = [
  { name: 'Lanka Hospitals', required: 3 },
  { name: 'Commercial Bank HQ', required: 2 },
  { name: 'Arpico Supercentre', required: 2 },
  { name: 'BOC Borella Branch', required: 1 },
  { name: 'Dialog Axiata HQ', required: 2 },
];

const DEMO_GUARDS = [
  { epf: 'G-001', label: 'G-001 — Demo Guard Alpha', defaultSite: 'Lanka Hospitals' },
  { epf: 'G-002', label: 'G-002 — Demo Guard Beta', defaultSite: 'Lanka Hospitals' },
  { epf: 'G-003', label: 'G-003 — Demo Guard Gamma', defaultSite: 'Commercial Bank HQ' },
  { epf: 'G-004', label: 'G-004 — Demo Guard Delta', defaultSite: 'Arpico Supercentre' },
  { epf: 'G-005', label: 'G-005 — Demo Guard Epsilon', defaultSite: 'BOC Borella Branch' },
  { epf: 'G-006', label: 'G-006 — Demo Guard Zeta', defaultSite: null },
];

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
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('sm_demo_session')?.value === 'SM-001';

  const supabase = await createSupabaseServerClient();

  let loginEpf: string;
  if (isDemo) {
    loginEpf = 'SM-001';
  } else {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) redirect('/login');
    loginEpf = session.user.email?.split('@')[0].toUpperCase() ?? '';
  }

  let sites: GuardAttendancePageData['sites'] = [];
  let guards: GuardAttendancePageData['guards'] = [];
  let canonicalSmEpf = loginEpf;

  if (isDemo) {
    sites = DEMO_SITES.map((site) => ({
      value: site.name,
      label: site.name,
      required: site.required,
      shiftRows: [],
    }));
    guards = DEMO_GUARDS;
  } else {
    const bundle = await getSmPortalAssignmentBundle(loginEpf);
    canonicalSmEpf = bundle.canonicalSmEpf;
    sites = bundle.sites.map((site) => ({
      value: site.site_name,
      label: site.site_name,
      required: site.required_guards,
      shiftRows: site.shiftRows,
    }));
    guards = bundle.guards.map((guard) => ({
      epf: guard.epf,
      label: guard.label,
      defaultSite: guard.defaultSite,
    }));
  }

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
