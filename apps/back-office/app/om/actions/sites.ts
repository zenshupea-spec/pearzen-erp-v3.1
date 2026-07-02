'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import { getOmServiceDb } from '../../../lib/om-service-db';
import { fetchActiveSectorManagerRecordsForCompany } from '../../../lib/sector-manager-roster';
import { resolveActiveSmPortalAuth } from '../../../lib/sm-portal-access-server';
import { normalizeSmEpf, sectorManagerEpfKey } from '../../../../../packages/supabase/sm-epf';
import { resolveGeofenceRadiusM } from '../../../lib/site-geofence';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  filterSectorManagersForOmScope,
  filterSitesForOmScope,
  isOmSectorScopeEmpty,
  omScopeIncludesSite,
  omScopeIncludesSmEpf,
  resolveOmSectorScopeForSession,
} from '../../../lib/om-sector-scope';
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
    assigned_sm_epf: normalizeSmEpf(row.assigned_sm_epf),
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
  const supabase = getOmServiceDb();

  let query = supabase
    .from('site_profiles')
    .select(
      'id, site_name, address, assigned_sm_epf, latitude, longitude, geofence_radius, needs_om_gps_capture, verification_mode, location_captured_at',
    )
    .neq('site_status', 'ARCHIVED')
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
  const [sites, omScope] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSitesForCompanyId, sessionCompanyId),
    resolveOmSectorScopeForSession(),
  ]);
  return filterSitesForOmScope(sites, omScope);
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
): Promise<{ emp_number: string; full_name: string | null; epf_no: string | null; epf_num: string | number | null }[]> {
  const supabase = getOmServiceDb();
  const managers = await fetchActiveSectorManagerRecordsForCompany(
    supabase,
    companyId,
    'emp_number, epf_no, epf_num, full_name',
  );
  return managers.map((row) => ({
    emp_number: String(row.emp_number ?? row.epf_no ?? ''),
    full_name: row.full_name != null ? String(row.full_name) : null,
    epf_no: row.epf_no != null ? String(row.epf_no) : null,
    epf_num: row.epf_num ?? null,
  }));
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

  return filterSectorManagersForOmScope(
    managers
      .map((m) => {
        const epfKey = sectorManagerEpfKey(m);
        if (!epfKey) return null;
        return {
          emp_number: epfKey,
          full_name: String(m.full_name ?? epfKey),
          site_count: countByEpf.get(epfKey) ?? 0,
        };
      })
      .filter((row): row is SectorManagerOption => row !== null),
    await resolveOmSectorScopeForSession(),
  );
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
    const session = await createSupabaseServerClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    const capturedBy =
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email ||
      'OM';

    const supabase = getOmServiceDb();
    const { data: siteRow } = await supabase
      .from('site_profiles')
      .select('id, site_name, assigned_sm_epf')
      .eq('id', input.siteId)
      .maybeSingle();

    const omScope = await resolveOmSectorScopeForSession();
    if (omScope !== null) {
      if (isOmSectorScopeEmpty(omScope)) {
        return { success: false, error: 'No assigned sectors — cannot update site GPS.' };
      }
      if (!siteRow || !omScopeIncludesSite(omScope, siteRow)) {
        return { success: false, error: 'This site is outside your assigned sectors.' };
      }
    }

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

    await auditStaffAction({
      supabase: session,
      portal: 'om',
      action: 'Update Site GPS',
      targetEntity: `Site ${input.siteId}`,
      details: { latitude: lat.value, longitude: lng.value },
    });

    revalidatePath('/om/sites/location');
    revalidatePath('/om/sites/assignments');
    revalidatePath('/om/sites/guards');
    revalidatePath('/om/guards/sm-assignments');
    revalidatePath('/om');
    revalidatePath('/tm');

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
  const smEpf = normalizeSmEpf(input.smEpf);
  if (!smEpf) {
    return { success: false, error: 'Select a Sector Manager.' };
  }

  try {
    const session = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(session);
    const supabase = getOmServiceDb();
    const { data: siteRow } = await supabase
      .from('site_profiles')
      .select('id, site_name, assigned_sm_epf')
      .eq('id', input.siteId)
      .maybeSingle();

    const omScope = await resolveOmSectorScopeForSession();
    if (omScope !== null) {
      if (isOmSectorScopeEmpty(omScope)) {
        return { success: false, error: 'No assigned sectors — cannot assign Sector Manager.' };
      }
      if (!siteRow || !omScopeIncludesSite(omScope, siteRow)) {
        return { success: false, error: 'This site is outside your assigned sectors.' };
      }
      if (!omScopeIncludesSmEpf(omScope, smEpf)) {
        return { success: false, error: 'This Sector Manager is outside your assigned sectors.' };
      }
    }

    const gate = await resolveActiveSmPortalAuth(supabase, companyId, smEpf);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    const { error } = await supabase
      .from('site_profiles')
      .update({ assigned_sm_epf: gate.storedEpf, site_status: 'ACTIVE' })
      .eq('id', input.siteId);

    if (error) throw error;

    await auditStaffAction({
      supabase: session,
      portal: 'om',
      action: 'Assign Sector Manager',
      targetEntity: `Site ${input.siteId} → SM ${gate.storedEpf}`,
    });

    revalidatePath('/om/sites/assignments');
    revalidatePath('/om/sites/guards');
    revalidatePath('/om/guards/sm-assignments');
    revalidatePath('/om');
    revalidatePath('/om/sm-visit-caps');
    revalidatePath('/fm/sm-handler');
    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');

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
    const session = await createSupabaseServerClient();
    const supabase = getOmServiceDb();

    const { data: siteRow } = await supabase
      .from('site_profiles')
      .select('id, site_name, assigned_sm_epf')
      .eq('id', siteId)
      .maybeSingle();

    const omScope = await resolveOmSectorScopeForSession();
    if (omScope !== null) {
      if (isOmSectorScopeEmpty(omScope)) {
        return { success: false, error: 'No assigned sectors — cannot clear Sector Manager.' };
      }
      if (!siteRow || !omScopeIncludesSite(omScope, siteRow)) {
        return { success: false, error: 'This site is outside your assigned sectors.' };
      }
    }

    const { error } = await supabase
      .from('site_profiles')
      .update({ assigned_sm_epf: null, site_status: 'PENDING' })
      .eq('id', siteId);

    if (error) throw error;

    await auditStaffAction({
      supabase: session,
      portal: 'om',
      action: 'Clear Sector Manager',
      targetEntity: `Site ${siteId}`,
    });

    revalidatePath('/om/sites/assignments');
    revalidatePath('/om/sites/guards');
    revalidatePath('/om/guards/sm-assignments');
    revalidatePath('/om');
    revalidatePath('/executive/sites');
    revalidatePath('/fm/sites');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear assignment.';
    console.error('❌ SUPABASE ERROR (clearSiteSectorManager):', message);
    return { success: false, error: message };
  }
}
