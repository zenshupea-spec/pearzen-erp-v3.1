'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context';
import { resolveGeofenceRadiusM } from '../../../lib/site-geofence';
import { siteNeedsGpsCapture } from '../lib/site-gps';

export type OmSiteRecord = {
  id: string;
  site_name: string;
  address: string | null;
  assigned_sm_epf: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  needs_om_gps_capture: boolean;
  verification_mode: string;
  location_captured_at: string | null;
};

export type SectorManagerOption = {
  emp_number: string;
  full_name: string;
  site_count: number;
};

function mapSiteRow(row: Record<string, unknown>): OmSiteRecord {
  return {
    id: String(row.id),
    site_name: String(row.site_name),
    address: row.address == null ? null : String(row.address),
    assigned_sm_epf:
      row.assigned_sm_epf == null || row.assigned_sm_epf === ''
        ? null
        : String(row.assigned_sm_epf),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    geofence_radius: resolveGeofenceRadiusM(
      row.geofence_radius == null ? null : Number(row.geofence_radius),
    ),
    needs_om_gps_capture: Boolean(row.needs_om_gps_capture),
    verification_mode: row.verification_mode == null ? 'B' : String(row.verification_mode),
    location_captured_at:
      row.location_captured_at == null ? null : String(row.location_captured_at),
  };
}

async function fetchSitesForCompanyId(companyId: string | null): Promise<OmSiteRecord[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, address, assigned_sm_epf, latitude, longitude, geofence_radius, needs_om_gps_capture, verification_mode, location_captured_at',
    )
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchSitesForCompany):', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapSiteRow(row as Record<string, unknown>));
}

async function fetchSitesForCompany(): Promise<OmSiteRecord[]> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return fetchWithRosterCompanyFallback(fetchSitesForCompanyId, sessionCompanyId);
}

export async function getSitesNeedingGpsCapture(): Promise<OmSiteRecord[]> {
  const sites = await fetchSitesForCompany();
  return sites.filter(siteNeedsGpsCapture);
}

export async function getSitesWithGpsConfigured(): Promise<OmSiteRecord[]> {
  const sites = await fetchSitesForCompany();
  return sites.filter((s) => !siteNeedsGpsCapture(s));
}

async function fetchSectorManagersForCompanyId(
  companyId: string | null,
): Promise<{ emp_number: string; full_name: string | null }[]> {
  const supabase = await createSupabaseServerClient();

  let empQuery = supabase
    .from('employees')
    .select('emp_number, full_name')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) {
    empQuery = empQuery.eq('company_id', companyId);
  }

  const { data: managers, error } = await empQuery;
  if (error) {
    console.error('❌ SUPABASE ERROR (getSectorManagersForAssignment):', error.message);
    return [];
  }
  return (managers ?? []) as { emp_number: string; full_name: string | null }[];
}

export async function getSectorManagersForAssignment(): Promise<SectorManagerOption[]> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const managers = await fetchWithRosterCompanyFallback(
    fetchSectorManagersForCompanyId,
    sessionCompanyId,
  );

  const sites = await fetchSitesForCompany();
  const countByEpf = new Map<string, number>();
  for (const site of sites) {
    if (!site.assigned_sm_epf) continue;
    countByEpf.set(site.assigned_sm_epf, (countByEpf.get(site.assigned_sm_epf) ?? 0) + 1);
  }

  return managers.map((m) => ({
    emp_number: String(m.emp_number),
    full_name: String(m.full_name ?? m.emp_number),
    site_count: countByEpf.get(String(m.emp_number)) ?? 0,
  }));
}

export async function getSitesPendingSmAssignment(): Promise<OmSiteRecord[]> {
  const sites = await fetchSitesForCompany();
  return sites.filter((s) => !s.assigned_sm_epf);
}

export async function getSitesWithSmAssigned(): Promise<OmSiteRecord[]> {
  const sites = await fetchSitesForCompany();
  return sites.filter((s) => Boolean(s.assigned_sm_epf));
}

function parseCoord(value: number, label: string): { ok: true; value: number } | { ok: false; error: string } {
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a valid number.` };
  }
  if (label === 'Latitude' && (value < -90 || value > 90)) {
    return { ok: false, error: 'Latitude must be between -90 and 90.' };
  }
  if (label === 'Longitude' && (value < -180 || value > 180)) {
    return { ok: false, error: 'Longitude must be between -180 and 180.' };
  }
  return { ok: true, value };
}

export async function updateSiteGpsCoordinates(input: {
  siteId: string;
  latitude: number;
  longitude: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  const lat = parseCoord(input.latitude, 'Latitude');
  if (!lat.ok) return { success: false, error: lat.error };
  const lng = parseCoord(input.longitude, 'Longitude');
  if (!lng.ok) return { success: false, error: lng.error };

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const capturedBy =
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email ||
      'OM';

    const { error } = await supabase
      .from('site_profiles')
      .update({
        latitude: lat.value,
        longitude: lng.value,
        needs_om_gps_capture: false,
        location_captured_at: new Date().toISOString(),
        location_captured_by: capturedBy,
      })
      .eq('id', input.siteId);

    if (error) throw error;

    revalidatePath('/om/sites/location');
    revalidatePath('/om/sites/assignments');
    revalidatePath('/om');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save GPS coordinates.';
    console.error('❌ SUPABASE ERROR (updateSiteGpsCoordinates):', message);
    return { success: false, error: message };
  }
}

export async function assignSiteToSectorManager(input: {
  siteId: string;
  smEpf: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const smEpf = input.smEpf.trim().toUpperCase();
  if (!smEpf) {
    return { success: false, error: 'Select a Sector Manager.' };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(supabase);

    let smQuery = supabase
      .from('employees')
      .select('emp_number')
      .eq('emp_number', smEpf)
      .eq('group', 'SECTOR_MANAGER')
      .eq('status', 'ACTIVE');

    if (companyId) {
      smQuery = smQuery.eq('company_id', companyId);
    }

    const { data: sm, error: smError } = await smQuery.maybeSingle();
    if (smError) throw smError;
    if (!sm) {
      return { success: false, error: `${smEpf} is not an active Sector Manager.` };
    }

    const { error } = await supabase
      .from('site_profiles')
      .update({ assigned_sm_epf: smEpf })
      .eq('id', input.siteId);

    if (error) throw error;

    revalidatePath('/om/sites/assignments');
    revalidatePath('/om');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign Sector Manager.';
    console.error('❌ SUPABASE ERROR (assignSiteToSectorManager):', message);
    return { success: false, error: message };
  }
}

export async function clearSiteSectorManager(
  siteId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('site_profiles')
      .update({ assigned_sm_epf: null })
      .eq('id', siteId);

    if (error) throw error;

    revalidatePath('/om/sites/assignments');
    revalidatePath('/om');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear assignment.';
    console.error('❌ SUPABASE ERROR (clearSiteSectorManager):', message);
    return { success: false, error: message };
  }
}
