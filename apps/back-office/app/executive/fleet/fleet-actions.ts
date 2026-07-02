'use server';

import { revalidatePath } from 'next/cache';

import {
  getExecutiveMdSettingsContext,
  resolveExecutiveCompanyId,
} from '../settings/lib/executive-md-settings-db';
import { refreshFleetTelematicsState } from './fleet-telematics-ingest';
import type {
  FleetDashboardData,
  FlaggedTrip,
  FuelRow,
  RegisterForm,
  RouteHistoryEntry,
  TripSeverity,
  VehicleAsset,
  VehicleColor,
  VehicleStatus,
} from './fleet-types';

const MARKER_COLORS: VehicleColor[] = ['amber', 'sky', 'emerald', 'violet'];

const DEFAULT_EFFICIENCY: Record<string, number> = {
  Petrol: 12.5,
  Diesel: 8,
  Electric: 6,
  Hybrid: 18,
};

type FleetAssetRow = {
  id: string;
  name: string;
  plate: string;
  driver_name: string;
  fuel_type: FuelRow['fuelType'];
  marker_color: VehicleColor;
  status: VehicleStatus;
  speed_kmh: number;
  location_label: string;
  last_ping_at: string | null;
  map_x: number;
  map_y: number;
  efficiency_km_l: number;
  gps_km_mtd: number;
  allowance_liters: number;
  allowance_lkr: number;
};

type FlaggedTripRow = {
  id: string;
  asset_id: string;
  vehicle_name: string;
  driver_name: string;
  from_label: string;
  to_label: string;
  trip_date: string;
  actual_mins: number;
  expected_mins: number;
  avg_speed_kmh: number;
  speed_limit_kmh: number;
  severity: TripSeverity;
  route_path: string;
};

type RouteHistoryRow = {
  asset_id: string;
  trip_date: string;
  label: string;
  route_path: string;
  is_flagged: boolean;
};

function formatLastPing(iso: string | null): string {
  if (!iso) return 'No ping yet';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'Just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs} sec${secs === 1 ? '' : 's'} ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function mapAssetRow(row: FleetAssetRow): VehicleAsset {
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    driver: row.driver_name,
    status: row.status,
    speedKmh: Number(row.speed_kmh) || 0,
    location: row.location_label || 'Awaiting GPS ping',
    lastPing: formatLastPing(row.last_ping_at),
    mapX: Number(row.map_x) || 400,
    mapY: Number(row.map_y) || 210,
    color: row.marker_color,
  };
}

function mapFuelRow(row: FleetAssetRow): FuelRow {
  return {
    vehicleId: row.id,
    vehicleName: row.name,
    plate: row.plate,
    fuelType: row.fuel_type,
    efficiencyKmL: Number(row.efficiency_km_l) || 10,
    gpsKm: Number(row.gps_km_mtd) || 0,
    allowanceLiters: Number(row.allowance_liters) || 0,
    allowanceLkr: Number(row.allowance_lkr) || 0,
  };
}

function mapFlaggedTripRow(row: FlaggedTripRow): FlaggedTrip {
  return {
    id: row.id,
    vehicleId: row.asset_id,
    vehicleName: row.vehicle_name,
    driver: row.driver_name,
    from: row.from_label,
    to: row.to_label,
    date: row.trip_date,
    actualMins: row.actual_mins,
    expectedMins: row.expected_mins,
    avgSpeedKmh: Number(row.avg_speed_kmh) || 0,
    speedLimitKmh: Number(row.speed_limit_kmh) || 0,
    severity: row.severity,
    routePath: row.route_path,
  };
}

function currentFuelPeriod() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    label: now.toLocaleString('en-LK', { month: 'long', year: 'numeric' }),
  };
}

export async function getFleetDashboard(): Promise<FleetDashboardData> {
  const companyId = await resolveExecutiveCompanyId();
  const db = (await getExecutiveMdSettingsContext()).db;
  const period = currentFuelPeriod();

  await refreshFleetTelematicsState(companyId, db);

  const [assetsRes, tripsRes, routesRes] = await Promise.all([
    db
      .from('fleet_assets')
      .select(
        'id, name, plate, driver_name, fuel_type, marker_color, status, speed_kmh, location_label, last_ping_at, map_x, map_y, efficiency_km_l, gps_km_mtd, allowance_liters, allowance_lkr',
      )
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    db
      .from('fleet_flagged_trips')
      .select(
        'id, asset_id, vehicle_name, driver_name, from_label, to_label, trip_date, actual_mins, expected_mins, avg_speed_kmh, speed_limit_kmh, severity, route_path',
      )
      .eq('company_id', companyId)
      .order('trip_date', { ascending: false }),
    db
      .from('fleet_route_history')
      .select('asset_id, trip_date, label, route_path, is_flagged')
      .eq('company_id', companyId)
      .gte('trip_date', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('trip_date', { ascending: false }),
  ]);

  if (assetsRes.error) throw new Error(assetsRes.error.message);
  if (tripsRes.error) throw new Error(tripsRes.error.message);
  if (routesRes.error) throw new Error(routesRes.error.message);

  const assets = (assetsRes.data ?? []) as FleetAssetRow[];
  const routeHistory: Record<string, RouteHistoryEntry[]> = {};

  for (const row of (routesRes.data ?? []) as RouteHistoryRow[]) {
    const entry: RouteHistoryEntry = {
      path: row.route_path,
      date: row.trip_date,
      label: row.label,
      isFlagged: row.is_flagged,
    };
    if (!routeHistory[row.asset_id]) routeHistory[row.asset_id] = [];
    routeHistory[row.asset_id].push(entry);
  }

  return {
    vehicles: assets.map(mapAssetRow),
    flaggedTrips: ((tripsRes.data ?? []) as FlaggedTripRow[]).map(mapFlaggedTripRow),
    routeHistory,
    fuelRows: assets.map(mapFuelRow),
    fuelPeriodLabel: period.label,
  };
}

export async function registerFleetAsset(
  input: RegisterForm,
): Promise<{ success: true } | { success: false; error: string }> {
  const name = input.name.trim();
  const plate = input.plate.trim();
  const tagId = input.tagId.trim();

  if (!name) return { success: false, error: 'Vehicle name is required.' };
  if (!plate) return { success: false, error: 'License plate is required.' };
  if (!tagId) return { success: false, error: 'GPS tag ID is required.' };

  const { db, companyId } = await getExecutiveMdSettingsContext();
  const period = currentFuelPeriod();

  const { count } = await db
    .from('fleet_assets')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  const markerColor = MARKER_COLORS[(count ?? 0) % MARKER_COLORS.length];
  const fuelType = (input.fuelType || 'Petrol') as FuelRow['fuelType'];
  const efficiency = DEFAULT_EFFICIENCY[fuelType] ?? 10;

  const { error } = await db.from('fleet_assets').insert({
    company_id: companyId,
    name,
    plate,
    driver_name: input.driver.trim(),
    vehicle_type: input.type.trim() || 'Sedan',
    fuel_type: fuelType,
    tracker_type: input.trackerType.trim() || 'Hardwired GPS (Teltonika/SinoTrack)',
    tag_id: tagId,
    marker_color: markerColor,
    status: 'PARKED',
    location_label: 'Awaiting GPS ping',
    efficiency_km_l: efficiency,
    fuel_period_year: period.year,
    fuel_period_month: period.month,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'That plate or GPS tag is already registered.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/executive/fleet');
  return { success: true };
}

export async function removeFleetAsset(
  assetId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!assetId) return { success: false, error: 'Asset id is required.' };

  const { db, companyId } = await getExecutiveMdSettingsContext();
  const { error } = await db
    .from('fleet_assets')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', assetId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/executive/fleet');
  return { success: true };
}

export async function updateFleetEfficiency(
  assetId: string,
  efficiencyKmL: number,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!assetId) return { success: false, error: 'Asset id is required.' };
  if (!Number.isFinite(efficiencyKmL) || efficiencyKmL <= 0) {
    return { success: false, error: 'Efficiency must be a positive number.' };
  }

  const { db, companyId } = await getExecutiveMdSettingsContext();
  const { error } = await db
    .from('fleet_assets')
    .update({
      efficiency_km_l: efficiencyKmL,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', assetId)
    .eq('is_active', true);

  if (error) return { success: false, error: error.message };

  revalidatePath('/executive/fleet');
  return { success: true };
}

export async function recordFleetTelematicsPing(input: {
  tagId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  recordedAt?: string;
  locationLabel?: string;
}) {
  const { processFleetTelematicsPing } = await import('./fleet-telematics-ingest');
  const { db, companyId } = await getExecutiveMdSettingsContext();
  const result = await processFleetTelematicsPing({ ...input, companyId }, db);
  if (result.success) revalidatePath('/executive/fleet');
  return result;
}
