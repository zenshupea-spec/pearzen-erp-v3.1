import type { SupabaseClient } from '@supabase/supabase-js';

import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../packages/supabase/md-settings-envelope';
import { getDistanceInMeters } from './geofence';
import { resolveGeofenceRadiusM } from './site-geofence';

export type CafeSiteGeofence = {
  siteName: string;
  siteLat: number;
  siteLng: number;
  geofenceRadiusM: number;
};

export type CafeOpenHours = {
  openStart: string;
  openEnd: string;
};

const DEFAULT_OPEN: CafeOpenHours = { openStart: '07:00', openEnd: '19:00' };

function timeOrDefault(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
}

export async function loadCafeOpenHours(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CafeOpenHours> {
  const envelope = await loadSettingEnvelope(supabase, companyId);
  const engine = envelope[MD_SETTINGS_ENVELOPE_KEYS.engineConstants] as
    | Partial<{ cafeOpenStart: string; cafeOpenEnd: string }>
    | undefined;

  return {
    openStart: timeOrDefault(engine?.cafeOpenStart, DEFAULT_OPEN.openStart),
    openEnd: timeOrDefault(engine?.cafeOpenEnd, DEFAULT_OPEN.openEnd),
  };
}

export function isWithinCafeOpenHours(
  openStart: string,
  openEnd: string,
  date = new Date(),
): boolean {
  const [sh, sm] = openStart.split(':').map(Number);
  const [eh, em] = openEnd.split(':').map(Number);
  const nowMins = date.getHours() * 60 + date.getMinutes();
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins <= endMins) {
    return nowMins >= startMins && nowMins <= endMins;
  }

  return nowMins >= startMins || nowMins <= endMins;
}

function normalizeSiteName(value: string): string {
  return value.trim().toLowerCase();
}

function siteMatchesCafe(siteName: string, hospitalityName: string): boolean {
  const name = normalizeSiteName(siteName);
  const hospitality = normalizeSiteName(hospitalityName);
  if (!name) return false;
  if (name === hospitality) return true;
  return name.includes('café') || name.includes('cafe') || name.includes('tasha');
}

export async function resolveCafeSiteGeofence(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CafeSiteGeofence | null> {
  const envelope = await loadSettingEnvelope(supabase, companyId);
  const divisionNames = envelope[MD_SETTINGS_ENVELOPE_KEYS.divisionNames] as
    | Partial<{ hospitality?: string }>
    | undefined;
  const hospitalityName = divisionNames?.hospitality?.trim() || 'Café Tasha';

  const { data: sites, error } = await supabase
    .from('site_profiles')
    .select('site_name, latitude, longitude, geofence_radius')
    .eq('company_id', companyId);

  if (error || !sites?.length) return null;

  const withCoords = sites.filter(
    (row) =>
      row.latitude != null &&
      row.longitude != null &&
      Number.isFinite(Number(row.latitude)) &&
      Number.isFinite(Number(row.longitude)),
  );

  const matched =
    withCoords.find((row) => siteMatchesCafe(String(row.site_name ?? ''), hospitalityName)) ??
    withCoords[0];

  if (!matched) return null;

  return {
    siteName: String(matched.site_name ?? hospitalityName),
    siteLat: Number(matched.latitude),
    siteLng: Number(matched.longitude),
    geofenceRadiusM: resolveGeofenceRadiusM(
      matched.geofence_radius == null ? null : Number(matched.geofence_radius),
    ),
  };
}

export function validateCafeCheckinLocation(
  latitude: number,
  longitude: number,
  site: CafeSiteGeofence | null,
): { ok: true } | { ok: false; error: string; distanceM?: number } {
  if (!site) {
    return {
      ok: false,
      error: 'Café site GPS is not configured. Contact your manager.',
    };
  }

  const distanceM = getDistanceInMeters(latitude, longitude, site.siteLat, site.siteLng);
  if (distanceM > site.geofenceRadiusM) {
    return {
      ok: false,
      error: `You are ${distanceM}m from ${site.siteName} (max ${site.geofenceRadiusM}m). Move closer to the site.`,
      distanceM,
    };
  }

  return { ok: true };
}

export function validateCafeCheckinWindow(
  openStart: string,
  openEnd: string,
  date = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (isWithinCafeOpenHours(openStart, openEnd, date)) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Check-in is only allowed during café hours (${openStart} – ${openEnd}). After close you can check out only.`,
  };
}

/** Portal stays open this long after café close so staff can finish tasks. */
export const CAFE_PORTAL_GRACE_MINUTES = 60;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function portalGraceEndMinutes(
  openEnd: string,
  graceMinutes = CAFE_PORTAL_GRACE_MINUTES,
): number {
  return timeToMinutes(openEnd) + graceMinutes;
}

export function formatPortalGraceEndTime(
  openEnd: string,
  graceMinutes = CAFE_PORTAL_GRACE_MINUTES,
): string {
  const totalMins = portalGraceEndMinutes(openEnd, graceMinutes);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isAfterCafeClose(
  openEnd: string,
  date = new Date(),
): boolean {
  const nowMins = date.getHours() * 60 + date.getMinutes();
  return nowMins > timeToMinutes(openEnd);
}

export function isAfterPortalGraceEnd(
  openEnd: string,
  date = new Date(),
  graceMinutes = CAFE_PORTAL_GRACE_MINUTES,
): boolean {
  const nowMins = date.getHours() * 60 + date.getMinutes();
  return nowMins > portalGraceEndMinutes(openEnd, graceMinutes);
}

export function isWithinPortalAccessWindow(
  openEnd: string,
  date = new Date(),
  graceMinutes = CAFE_PORTAL_GRACE_MINUTES,
): boolean {
  return !isAfterPortalGraceEnd(openEnd, date, graceMinutes);
}
