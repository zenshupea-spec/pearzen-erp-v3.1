import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import {
  fetchGuardsForSm,
  fetchSmAssignedSites,
  guardLabel,
  resolveCanonicalSmEpf,
} from './sm-portal-db';

export type SMAssignmentOption = {
  value: string;
  label: string;
};

export type SMAssignments = {
  sites: SMAssignmentOption[];
  guards: SMAssignmentOption[];
};

function loginEpfFromSessionEmail(email: string | null | undefined): string {
  return email?.split('@')[0]?.trim().toUpperCase() ?? '';
}

/** Canonical SM EPF from Supabase session. */
export async function resolveSmSessionEpf(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  return resolveCanonicalSmEpf(loginEpfFromSessionEmail(session.user.email));
}

export async function getCurrentSmEpf(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  return resolveCanonicalSmEpf(loginEpfFromSessionEmail(session.user.email));
}

export async function getSMAssignments(epf: string): Promise<SMAssignments> {
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
