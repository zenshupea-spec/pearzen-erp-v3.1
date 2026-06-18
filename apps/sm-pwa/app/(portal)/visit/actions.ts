'use server'

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveSmLookupKeys } from '../../../lib/sm-portal-db';
import { resolveSmSessionEpf } from '../../../lib/sm-assignments';

const VISIT_SELFIE_BUCKET = 'sm-visit-selfies';

function decodeBase64Image(photoBase64: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} | null {
  const trimmed = photoBase64.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!dataUrlMatch) return null;

  const contentType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  const extByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const extension = extByMime[contentType] ?? 'jpg';
  return { buffer: Buffer.from(base64Data, 'base64'), contentType, extension };
}

async function uploadVisitSelfie(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  photoBase64: string,
  smEpf: string,
  siteName: string,
): Promise<string | null> {
  const decoded = decodeBase64Image(photoBase64);
  if (!decoded) return null;

  const safeSite = siteName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const objectPath = `${smEpf}/${safeSite}-${Date.now()}.${decoded.extension}`;
  const { error } = await supabase.storage
    .from(VISIT_SELFIE_BUCKET)
    .upload(objectPath, decoded.buffer, { contentType: decoded.contentType, upsert: false });

  if (error) {
    console.error('[SM Visit] Selfie upload error:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(VISIT_SELFIE_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFirstNumeric(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (key in source) {
      const parsed = toNumberOrNull(source[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

export async function logVisitAction(formData: FormData): Promise<
  | { error: string }
  | { already_logged: true; site: string }
  | { success: true; site: string }
> {
  const supabase = await createSupabaseServerClient();
  const epf = await resolveSmSessionEpf();
  const smLookupKeys = await resolveSmLookupKeys(epf);

  const latitude = toNumberOrNull(formData.get('latitude'));
  const longitude = toNumberOrNull(formData.get('longitude'));
  const selfieConfirmed = (formData.get('selfie_confirmed') as string) === 'true';
  const selfiePhoto = (formData.get('selfie_photo') as string)?.trim() || null;
  const declarationChecked = (formData.get('visit_confirmation') as string) === 'on';
  const qrSiteName = (formData.get('site_name') as string)?.trim() || null;
  const forceLog = (formData.get('force_log') as string) === 'true';

  if (latitude === null || longitude === null) {
    return { error: 'Live GPS is required to log this visit.' };
  }
  if (!selfieConfirmed || !declarationChecked) {
    return { error: 'Selfie and visit declaration are required before logging.' };
  }

  let siteName: string;

  if (qrSiteName) {
    // QR code or NFC provided the site — verify SM is within GPS radius
    const { data: siteProfile, error: siteError } = await supabase
      .from('site_profiles')
      .select('*')
      .eq('site_name', qrSiteName)
      .maybeSingle();

    if (siteError || !siteProfile) {
      return { error: 'Site from QR/NFC not found in directory.' };
    }

    const site = siteProfile as Record<string, unknown>;
    const siteLat = getFirstNumeric(site, ['lat', 'latitude', 'site_lat', 'site_latitude']);
    const siteLng = getFirstNumeric(site, ['lng', 'longitude', 'site_lng', 'site_longitude']);
    const radius = getFirstNumeric(site, ['geofence_radius', 'radius_meters', 'gps_radius_meters']) ?? 25;

    if (siteLat !== null && siteLng !== null) {
      const dist = distanceMeters(latitude, longitude, siteLat, siteLng);
      if (dist > radius) {
        return { error: `You are ${Math.round(dist)}m away from this site (radius: ${Math.round(radius)}m). Move closer and try again.` };
      }
    }

    siteName = qrSiteName;
  } else {
    // Auto-detect site from GPS — find closest assigned site within geofence
    const { data: assignedSites, error: sitesError } = await supabase
      .from('site_profiles')
      .select('*')
      .in('assigned_sm_epf', smLookupKeys);

    if (sitesError) {
      return { error: 'Unable to load assigned sites. Please try again.' };
    }

    let matchedSite: string | null = null;
    let closestDist = Infinity;

    for (const s of assignedSites ?? []) {
      const site = s as Record<string, unknown>;
      const siteLat = getFirstNumeric(site, ['lat', 'latitude', 'site_lat', 'site_latitude']);
      const siteLng = getFirstNumeric(site, ['lng', 'longitude', 'site_lng', 'site_longitude']);
      const radius = getFirstNumeric(site, ['geofence_radius', 'radius_meters', 'gps_radius_meters']) ?? 25;

      if (siteLat === null || siteLng === null) continue;

      const dist = distanceMeters(latitude, longitude, siteLat, siteLng);
      if (dist <= radius && dist < closestDist) {
        matchedSite = (site['site_name'] as string) ?? null;
        closestDist = dist;
      }
    }

    if (!matchedSite) {
      return { error: 'You are not within range of any assigned site. Move closer to a site and try again.' };
    }

    siteName = matchedSite;
  }

  // Check if already logged today (unless force-logging)
  if (!forceLog) {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('sm_visit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('sm_epf', epf)
      .eq('site_name', siteName)
      .eq('visit_type', 'VISIT')
      .gte('created_at', `${today}T00:00:00`);

    if ((count ?? 0) > 0) {
      return { already_logged: true, site: siteName };
    }
  }

  let photoUrl: string | null = null;
  if (selfiePhoto) {
    photoUrl = await uploadVisitSelfie(supabase, selfiePhoto, epf, siteName);
  }

  const { error } = await supabase.from('sm_visit_logs').insert({
    sm_epf: epf,
    visit_type: 'VISIT',
    site_name: siteName,
    latitude,
    longitude,
    photo_url: photoUrl,
    verification_status: 'PENDING',
  });

  if (error) {
    console.error('[SM Visit] Insert error:', error.message);
    return { error: 'Failed to log visit. Please try again.' };
  }

  return { success: true, site: siteName };
}
