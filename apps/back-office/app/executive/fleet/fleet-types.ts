export type VehicleStatus = 'ONLINE' | 'PARKED' | 'IDLE';
export type VehicleColor = 'amber' | 'sky' | 'emerald' | 'violet';
export type TripSeverity = 'RECKLESS' | 'SPEEDING' | 'AGGRESSIVE';

export interface VehicleAsset {
  id: string;
  name: string;
  plate: string;
  driver: string;
  status: VehicleStatus;
  speedKmh: number;
  location: string;
  lastPing: string;
  mapX: number;
  mapY: number;
  color: VehicleColor;
}

export interface FlaggedTrip {
  id: string;
  vehicleId: string;
  vehicleName: string;
  driver: string;
  from: string;
  to: string;
  date: string;
  actualMins: number;
  expectedMins: number;
  avgSpeedKmh: number;
  speedLimitKmh: number;
  severity: TripSeverity;
  routePath: string;
}

export interface FuelRow {
  vehicleId: string;
  vehicleName: string;
  plate: string;
  fuelType: 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid';
  efficiencyKmL: number;
  gpsKm: number;
  allowanceLiters: number;
  allowanceLkr: number;
}

export interface RouteHistoryEntry {
  path: string;
  date: string;
  label: string;
  isFlagged?: boolean;
}

export interface RegisterForm {
  name: string;
  plate: string;
  driver: string;
  type: string;
  fuelType: string;
  trackerType: string;
  tagId: string;
}

export interface FleetDashboardData {
  vehicles: VehicleAsset[];
  flaggedTrips: FlaggedTrip[];
  routeHistory: Record<string, RouteHistoryEntry[]>;
  fuelRows: FuelRow[];
  fuelPeriodLabel: string;
}
