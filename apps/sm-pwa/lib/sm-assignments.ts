import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import {
  fetchGuardsForSm,
  fetchSmAssignedSites,
  guardLabel,
} from './sm-portal-db';

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

export async function getCurrentSmEpf(): Promise<string | null> {
  const cookieStore = await cookies();
  const demo = cookieStore.get('sm_demo_session')?.value;
  if (demo) return demo.toUpperCase();

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  return session.user.email?.split('@')[0].toUpperCase() ?? null;
}

export async function getSMAssignments(epf: string): Promise<SMAssignments> {
  if (epf === 'SM-001') {
    const demoGuards = await fetchGuardsForSm(
      epf,
      DEMO_SITES_SM001.map((site) => site.value),
    );
    return {
      sites: DEMO_SITES_SM001,
      guards:
        demoGuards.length > 0
          ? demoGuards.map((guard) => ({ value: guard.epf, label: guard.label }))
          : [
              { value: 'G-001', label: 'G-001 — Demo Guard A' },
              { value: 'G-002', label: 'G-002 — Demo Guard B' },
            ],
    };
  }

  const profileSites = await fetchSmAssignedSites(epf);
  const siteNames = profileSites.map((site) => site.site_name);
  const guards = await fetchGuardsForSm(epf, siteNames);
  return {
    sites: profileSites.map((site) => ({
      value: site.site_name,
      label: site.site_name,
    })),
    guards: guards.map((guard) => ({ value: guard.epf, label: guard.label })),
  };
}

/** @deprecated use fetchSmAssignedSites / fetchGuardsForSm directly */
export async function fetchAssignedSites(
  _supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  epf: string,
): Promise<SMAssignmentOption[]> {
  const sites = await fetchSmAssignedSites(epf);
  return sites.map((site) => ({ value: site.site_name, label: site.site_name }));
}

/** @deprecated use fetchGuardsForSm directly */
export async function fetchAssignedGuards(
  _supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  epf: string,
  siteNames: string[],
): Promise<SMAssignmentOption[]> {
  const guards = await fetchGuardsForSm(epf, siteNames);
  return guards.map((guard) => ({ value: guard.epf, label: guard.label }));
}

export { guardLabel };
