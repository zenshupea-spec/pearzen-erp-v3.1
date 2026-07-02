import type { SupabaseClient } from '@supabase/supabase-js';

export type SiteGpsSubmissionStatus = 'PENDING' | 'APPROVED' | 'RESUBMIT_REQUESTED';

export type SiteGpsSubmissionRow = {
  id: string;
  company_id: string;
  site_profile_id: string;
  site_name: string;
  sm_epf: string;
  sm_name: string | null;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  status: SiteGpsSubmissionStatus;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

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

export async function promoteSiteGpsSubmission(
  supabase: SupabaseClient,
  siteProfileId: string,
  latitude: number,
  longitude: number,
  capturedBy: string,
): Promise<{ success: boolean; error?: string }> {
  const lat = parseCoord(latitude, 'Latitude');
  if (!lat.ok) return { success: false, error: lat.error };
  const lng = parseCoord(longitude, 'Longitude');
  if (!lng.ok) return { success: false, error: lng.error };

  const { error } = await supabase
    .from('site_profiles')
    .update({
      latitude: lat.value,
      longitude: lng.value,
      needs_om_gps_capture: false,
      location_captured_at: new Date().toISOString(),
      location_captured_by: capturedBy,
    })
    .eq('id', siteProfileId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export function formatSiteGpsCoords(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
