import type { SupabaseClient } from '@supabase/supabase-js';

import {
  appendRoutePoint,
  buildRoutePath,
  deriveVehicleStatus,
  estimateExpectedMins,
  evaluateTripSeverity,
  FLEET_TELEMATICS,
  haversineKm,
  latLngToMapXY,
  parseRoutePoints,
  type MapPoint,
} from '../../../lib/fleet-telematics';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

export type FleetTelematicsPingInput = {
  tagId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  recordedAt?: string;
  locationLabel?: string;
  companyId?: string;
};

type FleetAssetRecord = {
  id: string;
  company_id: string;
  name: string;
  driver_name: string;
  gps_km_mtd: number;
  fuel_period_year: number;
  fuel_period_month: number;
  last_latitude: number | null;
  last_longitude: number | null;
};

type ActiveTripRecord = {
  asset_id: string;
  company_id: string;
  started_at: string;
  start_latitude: number;
  start_longitude: number;
  start_label: string;
  start_map_x: number;
  start_map_y: number;
  route_points: unknown;
  distance_km: number;
  last_speed_kmh: number;
  last_move_at: string;
  idle_since: string | null;
};

function parseCoord(value: unknown, label: string): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return null;
  if (label.includes('lat') && (n < -90 || n > 90)) return null;
  if (label.includes('lng') && (n < -180 || n > 180)) return null;
  return n;
}

function currentFuelPeriod() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

async function findAssetByTag(
  db: SupabaseClient,
  tagId: string,
  companyId?: string,
): Promise<FleetAssetRecord | null> {
  let query = db
    .from('fleet_assets')
    .select(
      'id, company_id, name, driver_name, gps_km_mtd, fuel_period_year, fuel_period_month, last_latitude, last_longitude',
    )
    .eq('is_active', true)
    .ilike('tag_id', tagId.trim());

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FleetAssetRecord | null) ?? null;
}

async function finalizeTrip(
  db: SupabaseClient,
  asset: FleetAssetRecord,
  trip: ActiveTripRecord,
  endLabel: string,
  endedAt: Date,
): Promise<void> {
  const points = parseRoutePoints(trip.route_points);
  if (points.length < 2 || trip.distance_km < FLEET_TELEMATICS.minTripDistanceKm) {
    await db.from('fleet_active_trips').delete().eq('asset_id', asset.id);
    return;
  }

  const startedAt = new Date(trip.started_at);
  const actualMins = Math.max(
    FLEET_TELEMATICS.minTripDurationMins,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
  const expectedMins = estimateExpectedMins(Number(trip.distance_km));
  const avgSpeedKmh =
    actualMins > 0 ? Number(((Number(trip.distance_km) / actualMins) * 60).toFixed(1)) : 0;
  const routePath = buildRoutePath(points);
  const tripDate = endedAt.toISOString().slice(0, 10);
  const label = `${trip.start_label || 'Start'} → ${endLabel || 'End'}`;
  const evaluation = evaluateTripSeverity({ actualMins, expectedMins, avgSpeedKmh });

  await db.from('fleet_route_history').insert({
    company_id: asset.company_id,
    asset_id: asset.id,
    trip_date: tripDate,
    label,
    route_path: routePath,
    is_flagged: evaluation.flagged,
  });

  if (evaluation.flagged && evaluation.severity) {
    await db.from('fleet_flagged_trips').insert({
      company_id: asset.company_id,
      asset_id: asset.id,
      vehicle_name: asset.name,
      driver_name: asset.driver_name,
      from_label: trip.start_label || 'Unknown start',
      to_label: endLabel || 'Unknown end',
      trip_date: tripDate,
      actual_mins: actualMins,
      expected_mins: expectedMins,
      avg_speed_kmh: avgSpeedKmh,
      speed_limit_kmh: 50,
      severity: evaluation.severity,
      route_path: routePath,
    });
  }

  await db.from('fleet_active_trips').delete().eq('asset_id', asset.id);
}

async function upsertActiveTrip(
  db: SupabaseClient,
  asset: FleetAssetRecord,
  trip: ActiveTripRecord | null,
  input: {
    lat: number;
    lng: number;
    speedKmh: number;
    locationLabel: string;
    recordedAt: Date;
    mapXY: { x: number; y: number };
    deltaKm: number;
  },
): Promise<void> {
  const moving = input.speedKmh >= FLEET_TELEMATICS.tripStartSpeedKmh;

  if (!trip && moving) {
    const point: MapPoint = { x: input.mapXY.x, y: input.mapXY.y, lat: input.lat, lng: input.lng };
    await db.from('fleet_active_trips').insert({
      asset_id: asset.id,
      company_id: asset.company_id,
      started_at: input.recordedAt.toISOString(),
      start_latitude: input.lat,
      start_longitude: input.lng,
      start_label: input.locationLabel,
      start_map_x: input.mapXY.x,
      start_map_y: input.mapXY.y,
      route_points: [point],
      distance_km: 0,
      last_speed_kmh: input.speedKmh,
      last_move_at: input.recordedAt.toISOString(),
      idle_since: null,
    });
    return;
  }

  if (!trip) return;

  let points = parseRoutePoints(trip.route_points);
  let distanceKm = Number(trip.distance_km) || 0;
  if (input.deltaKm > 0) {
    points = appendRoutePoint(points, input.lat, input.lng);
    distanceKm += input.deltaKm;
  }

  const idleSince =
    input.speedKmh < FLEET_TELEMATICS.tripEndSpeedKmh
      ? trip.idle_since ?? input.recordedAt.toISOString()
      : null;

  const idleMs = idleSince
    ? input.recordedAt.getTime() - new Date(idleSince).getTime()
    : 0;
  const shouldFinalize =
    idleSince !== null && idleMs >= FLEET_TELEMATICS.tripIdleMinutes * 60 * 1000;

  if (shouldFinalize) {
    await finalizeTrip(db, asset, { ...trip, route_points: points, distance_km: distanceKm }, input.locationLabel, input.recordedAt);
    return;
  }

  await db
    .from('fleet_active_trips')
    .update({
      route_points: points,
      distance_km: distanceKm,
      last_speed_kmh: input.speedKmh,
      last_move_at: input.deltaKm > 0 ? input.recordedAt.toISOString() : trip.last_move_at,
      idle_since: idleSince,
      updated_at: new Date().toISOString(),
    })
    .eq('asset_id', asset.id);
}

export async function processFleetTelematicsPing(
  input: FleetTelematicsPingInput,
  db: SupabaseClient = createSupabaseServiceClient(),
): Promise<
  | { success: true; assetId: string; status: string }
  | { success: false; error: string }
> {
  const tagId = input.tagId?.trim();
  if (!tagId) return { success: false, error: 'tag_id is required.' };

  const lat = parseCoord(input.latitude, 'lat');
  const lng = parseCoord(input.longitude, 'lng');
  if (lat == null || lng == null) {
    return { success: false, error: 'Valid latitude and longitude are required.' };
  }

  const speedKmh = Math.max(0, Number(input.speedKmh ?? 0) || 0);
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  if (Number.isNaN(recordedAt.getTime())) {
    return { success: false, error: 'Invalid recorded_at timestamp.' };
  }

  const asset = await findAssetByTag(db, tagId, input.companyId);
  if (!asset) {
    return { success: false, error: `No active fleet asset registered for tag "${tagId}".` };
  }

  const mapXY = latLngToMapXY(lat, lng);
  const locationLabel = input.locationLabel?.trim() || 'GPS fix';
  const status = deriveVehicleStatus(speedKmh, recordedAt);
  const period = currentFuelPeriod();

  let deltaKm = 0;
  if (asset.last_latitude != null && asset.last_longitude != null) {
    deltaKm = haversineKm(asset.last_latitude, asset.last_longitude, lat, lng);
  }

  let gpsKmMtd = Number(asset.gps_km_mtd) || 0;
  if (
    asset.fuel_period_year !== period.year ||
    asset.fuel_period_month !== period.month
  ) {
    gpsKmMtd = 0;
  }
  if (deltaKm >= 0.02) gpsKmMtd += deltaKm;

  await db.from('fleet_telematics_pings').insert({
    company_id: asset.company_id,
    asset_id: asset.id,
    tag_id: tagId,
    latitude: lat,
    longitude: lng,
    speed_kmh: speedKmh,
    location_label: locationLabel,
    recorded_at: recordedAt.toISOString(),
  });

  const { data: activeTrip } = await db
    .from('fleet_active_trips')
    .select('*')
    .eq('asset_id', asset.id)
    .maybeSingle();

  await upsertActiveTrip(db, asset, (activeTrip as ActiveTripRecord | null) ?? null, {
    lat,
    lng,
    speedKmh,
    locationLabel,
    recordedAt,
    mapXY,
    deltaKm,
  });

  const { error: assetError } = await db
    .from('fleet_assets')
    .update({
      status,
      speed_kmh: speedKmh,
      location_label: locationLabel,
      last_ping_at: recordedAt.toISOString(),
      last_latitude: lat,
      last_longitude: lng,
      map_x: mapXY.x,
      map_y: mapXY.y,
      gps_km_mtd: Number(gpsKmMtd.toFixed(2)),
      fuel_period_year: period.year,
      fuel_period_month: period.month,
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.id);

  if (assetError) return { success: false, error: assetError.message };

  return { success: true, assetId: asset.id, status };
}

export async function refreshFleetTelematicsState(
  companyId: string,
  db: SupabaseClient = createSupabaseServiceClient(),
): Promise<void> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - FLEET_TELEMATICS.staleOnlineMinutes * 60 * 1000).toISOString();
  const routeCutoff = new Date(
    now.getTime() - FLEET_TELEMATICS.routeRetentionDays * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const pingCutoff = new Date(
    now.getTime() - FLEET_TELEMATICS.pingRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .from('fleet_assets')
    .update({ status: 'PARKED', speed_kmh: 0, updated_at: now.toISOString() })
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('status', ['ONLINE', 'IDLE'])
    .lt('last_ping_at', staleCutoff);

  await db
    .from('fleet_route_history')
    .delete()
    .eq('company_id', companyId)
    .lt('trip_date', routeCutoff);

  await db
    .from('fleet_telematics_pings')
    .delete()
    .eq('company_id', companyId)
    .lt('recorded_at', pingCutoff);
}
