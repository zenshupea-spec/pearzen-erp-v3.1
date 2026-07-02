import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from './site-geofence';
import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
} from '../../../packages/supabase/md-settings-envelope';
import type { SupabaseClient } from '@supabase/supabase-js';

export type InternalWorkLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
};

export type InternalWorkLocationsSettings = {
  headOffice: InternalWorkLocation[];
  cafe: InternalWorkLocation[];
};

export const DEFAULT_INTERNAL_WORK_LOCATIONS: InternalWorkLocationsSettings = {
  headOffice: [],
  cafe: [],
};

function newLocationId(): string {
  return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Canonical branch label for MD Settings HO / café locations (stored uppercase). */
export function formatInternalBranchLabel(name: string): string {
  return name.trim().toUpperCase();
}

function parseLocation(raw: unknown, fallbackId?: string): InternalWorkLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = formatInternalBranchLabel(String(row.name ?? ''));
  const lat = parseCoord(row.latitude ?? row.lat);
  const lng = parseCoord(row.longitude ?? row.lng);
  if (!name || lat == null || lng == null) return null;

  const radiusRaw = row.geofenceRadiusM ?? row.geofence_radius_m;
  const geofenceRadiusM = clampGeofenceRadiusM(
    radiusRaw == null ? DEFAULT_GEOFENCE_RADIUS_M : Number(radiusRaw),
  );

  return {
    id: String(row.id ?? fallbackId ?? newLocationId()).trim() || newLocationId(),
    name,
    address: String(row.address ?? '').trim(),
    latitude: lat,
    longitude: lng,
    geofenceRadiusM,
  };
}

function parseLocationList(raw: unknown): InternalWorkLocation[] {
  if (!Array.isArray(raw)) return [];
  const out: InternalWorkLocation[] = [];
  for (const item of raw) {
    const parsed = parseLocation(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parseInternalWorkLocations(raw: unknown): InternalWorkLocationsSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_INTERNAL_WORK_LOCATIONS };
  const row = raw as Record<string, unknown>;
  return {
    headOffice: parseLocationList(row.headOffice ?? row.head_office),
    cafe: parseLocationList(row.cafe),
  };
}

export function sanitizeInternalWorkLocations(
  input: InternalWorkLocationsSettings,
): InternalWorkLocationsSettings {
  const seenHo = new Set<string>();
  const seenCafe = new Set<string>();

  const dedupe = (list: InternalWorkLocation[], seen: Set<string>) =>
    list
      .map((loc) => parseLocation(loc, loc.id))
      .filter((loc): loc is InternalWorkLocation => {
        if (!loc) return false;
        const key = loc.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

  return {
    headOffice: dedupe(input.headOffice ?? [], seenHo),
    cafe: dedupe(input.cafe ?? [], seenCafe),
  };
}

export function findInternalWorkLocation(
  settings: InternalWorkLocationsSettings,
  kind: 'headOffice' | 'cafe',
  locationName: string,
): InternalWorkLocation | null {
  const norm = formatInternalBranchLabel(locationName);
  if (!norm) return null;
  return settings[kind].find((loc) => formatInternalBranchLabel(loc.name) === norm) ?? null;
}

export function findInternalWorkLocationById(
  settings: InternalWorkLocationsSettings,
  kind: 'headOffice' | 'cafe',
  id: string,
): InternalWorkLocation | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return settings[kind].find((loc) => loc.id === trimmed) ?? null;
}

export function createEmptyInternalWorkLocation(): InternalWorkLocation {
  return {
    id: newLocationId(),
    name: '',
    address: '',
    latitude: 0,
    longitude: 0,
    geofenceRadiusM: DEFAULT_GEOFENCE_RADIUS_M,
  };
}

export async function loadInternalWorkLocationsForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<InternalWorkLocationsSettings> {
  const envelope = await loadSettingEnvelope(supabase, companyId);
  return parseInternalWorkLocations(envelope[MD_SETTINGS_ENVELOPE_KEYS.internalWorkLocations]);
}
