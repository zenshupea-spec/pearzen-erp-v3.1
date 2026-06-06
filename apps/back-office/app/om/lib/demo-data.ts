import { DEFAULT_GEOFENCE_RADIUS_M } from '../../../lib/site-geofence';
import type { OmSiteRecord, SectorManagerOption } from '../actions/sites';
import {
  computeGuardRatings,
  type GuardRawMetrics,
} from '../guard-cards/lib/rating';
import type { BlacklistedGuardEntry, GuardCardDisplay } from '../guard-cards/types';
import type {
  OmAllocationSite,
  OmAssignableGuard,
  OmTacticalShort,
} from './field-operations-types';

export const OM_DEMO_NOTE =
  'Preview data — no live Supabase records yet. Seed employees & sites to replace this view.';

/** Use demo fixtures when live lists are empty. */
export function useOmDemo<T>(live: T[], demo: T[]): { data: T[]; isDemo: boolean } {
  if (live.length > 0) return { data: live, isDemo: false };
  return { data: demo, isDemo: true };
}

// ─── Site GPS & SM assignments ───────────────────────────────────────────────

export const DEMO_SITES_PENDING_GPS: OmSiteRecord[] = [
  {
    id: 'demo-site-gps-1',
    site_name: 'BOC Headquarters — Main Lobby',
    address: 'Union Place, Colombo 02',
    assigned_sm_epf: 'SM-002',
    latitude: null,
    longitude: null,
    geofence_radius: DEFAULT_GEOFENCE_RADIUS_M,
    needs_om_gps_capture: true,
    verification_mode: 'B',
    location_captured_at: null,
  },
  {
    id: 'demo-site-gps-2',
    site_name: 'Negombo Fish Market',
    address: 'Negombo',
    assigned_sm_epf: null,
    latitude: null,
    longitude: null,
    geofence_radius: DEFAULT_GEOFENCE_RADIUS_M,
    needs_om_gps_capture: true,
    verification_mode: 'B',
    location_captured_at: null,
  },
];

export const DEMO_SITES_CONFIGURED_GPS: OmSiteRecord[] = [
  {
    id: 'demo-site-gps-3',
    site_name: 'Lanka Hospitals — Gate 3',
    address: 'Narahenpita, Colombo 05',
    assigned_sm_epf: 'SM-001',
    latitude: 6.9147,
    longitude: 79.8736,
    geofence_radius: 85,
    needs_om_gps_capture: false,
    verification_mode: 'B',
    location_captured_at: new Date().toISOString(),
  },
  {
    id: 'demo-site-gps-4',
    site_name: 'Ceylinco Tower — Floor 12',
    address: 'Colombo 03',
    assigned_sm_epf: 'SM-001',
    latitude: 6.9102,
    longitude: 79.8541,
    geofence_radius: 75,
    needs_om_gps_capture: false,
    verification_mode: 'A',
    location_captured_at: new Date().toISOString(),
  },
];

export const DEMO_SM_MANAGERS: SectorManagerOption[] = [
  { emp_number: 'SM-001', full_name: 'Dissanayake K.P.', site_count: 8 },
  { emp_number: 'SM-002', full_name: 'Perera R.S.', site_count: 5 },
  { emp_number: 'SM-003', full_name: 'Fernando L.M.', site_count: 4 },
];

export const DEMO_SITES_PENDING_SM: OmSiteRecord[] = [
  {
    id: 'demo-site-sm-1',
    site_name: 'Ratnapura Gem Exchange',
    address: 'Ratnapura',
    assigned_sm_epf: null,
    latitude: 6.6828,
    longitude: 80.3992,
    geofence_radius: 100,
    needs_om_gps_capture: false,
    verification_mode: 'B',
    location_captured_at: new Date().toISOString(),
  },
  {
    id: 'demo-site-sm-2',
    site_name: 'Arpico Supercentre — Maharagama',
    address: 'Maharagama',
    assigned_sm_epf: null,
    latitude: 6.8512,
    longitude: 79.9268,
    geofence_radius: 90,
    needs_om_gps_capture: false,
    verification_mode: 'B',
    location_captured_at: new Date().toISOString(),
  },
];

export const DEMO_SITES_ASSIGNED_SM: OmSiteRecord[] = [
  {
    id: 'demo-site-sm-3',
    site_name: 'Commercial Bank HQ',
    address: 'Union Place, Colombo 02',
    assigned_sm_epf: 'SM-001',
    latitude: 6.9181,
    longitude: 79.8612,
    geofence_radius: 100,
    needs_om_gps_capture: false,
    verification_mode: 'B',
    location_captured_at: new Date().toISOString(),
  },
  {
    id: 'demo-site-sm-4',
    site_name: 'Dialog Axiata HQ',
    address: 'Thimbirigasyaya Rd, Colombo 05',
    assigned_sm_epf: 'SM-002',
    latitude: 6.8883,
    longitude: 79.8711,
    geofence_radius: 95,
    needs_om_gps_capture: false,
    verification_mode: 'B',
    location_captured_at: new Date().toISOString(),
  },
];

// ─── Roster engine ───────────────────────────────────────────────────────────

export const DEMO_ROSTER_EMPLOYEES = [
  { id: 'demo-emp-1', emp_number: 'G-101', full_name: 'PERERA K.R.S.', company_id: 'demo' },
  { id: 'demo-emp-2', emp_number: 'G-204', full_name: 'FERNANDO J.A.', company_id: 'demo' },
  { id: 'demo-emp-3', emp_number: 'G-318', full_name: 'SILVA D.P.M.', company_id: 'demo' },
  { id: 'demo-emp-4', emp_number: 'G-422', full_name: 'JAYAWARDENA T.M.', company_id: 'demo' },
];

export const DEMO_ROSTER_SITES = [
  { id: 'demo-site-r-1', site_name: 'Lanka Hospitals — Gate 3' },
  { id: 'demo-site-r-2', site_name: 'BOC Headquarters — Main Lobby' },
  { id: 'demo-site-r-3', site_name: 'Ceylinco Tower — Floor 12' },
];

function rosterIso(date: string, hour: number, minute: number) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).toISOString();
}

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export const DEMO_LIVE_ROSTERS = [
  {
    id: 'demo-roster-1',
    shift_date: today,
    planned_start_time: rosterIso(today, 7, 0),
    planned_end_time: rosterIso(today, 19, 0),
    status: 'ACTIVE',
    employees: { emp_number: 'G-101', full_name: 'PERERA K.R.S.' },
    site_profiles: { site_name: 'Lanka Hospitals — Gate 3' },
  },
  {
    id: 'demo-roster-2',
    shift_date: today,
    planned_start_time: rosterIso(today, 19, 0),
    planned_end_time: rosterIso(tomorrow, 7, 0),
    status: 'ACTIVE',
    employees: { emp_number: 'G-204', full_name: 'FERNANDO J.A.' },
    site_profiles: { site_name: 'BOC Headquarters — Main Lobby' },
  },
  {
    id: 'demo-roster-3',
    shift_date: tomorrow,
    planned_start_time: rosterIso(tomorrow, 7, 0),
    planned_end_time: rosterIso(tomorrow, 19, 0),
    status: 'ACTIVE',
    employees: { emp_number: 'G-318', full_name: 'SILVA D.P.M.' },
    site_profiles: { site_name: 'Ceylinco Tower — Floor 12' },
  },
];

// ─── Guard cards ─────────────────────────────────────────────────────────────

const DEMO_GUARD_RAW: (GuardRawMetrics & {
  employeeId: string;
  fullName: string;
  rank: string;
})[] = [
  {
    employeeId: 'demo-guard-1',
    empNumber: 'G-101',
    fullName: 'PERERA K.R.S.',
    rank: 'CSO',
    penaltyCount12m: 0,
    penaltyAmount12m: 0,
    lateCheckIns12m: 1,
    shiftsPerMonth: 22,
    maxConsecutiveMissedDays: 0,
    deductionTotal12m: 0,
  },
  {
    employeeId: 'demo-guard-2',
    empNumber: 'G-204',
    fullName: 'FERNANDO J.A.',
    rank: 'OIC',
    penaltyCount12m: 1,
    penaltyAmount12m: 2500,
    lateCheckIns12m: 3,
    shiftsPerMonth: 20,
    maxConsecutiveMissedDays: 1,
    deductionTotal12m: 2500,
  },
  {
    employeeId: 'demo-guard-3',
    empNumber: 'G-318',
    fullName: 'SILVA D.P.M.',
    rank: 'SSO',
    penaltyCount12m: 2,
    penaltyAmount12m: 5000,
    lateCheckIns12m: 6,
    shiftsPerMonth: 18,
    maxConsecutiveMissedDays: 2,
    deductionTotal12m: 7500,
  },
  {
    employeeId: 'demo-guard-4',
    empNumber: 'G-422',
    fullName: 'JAYAWARDENA T.M.',
    rank: 'JSO',
    penaltyCount12m: 4,
    penaltyAmount12m: 12000,
    lateCheckIns12m: 11,
    shiftsPerMonth: 14,
    maxConsecutiveMissedDays: 4,
    deductionTotal12m: 18500,
  },
  {
    employeeId: 'demo-guard-5',
    empNumber: 'G-509',
    fullName: 'KUMARA A.L.',
    rank: 'JSO',
    penaltyCount12m: 3,
    penaltyAmount12m: 8000,
    lateCheckIns12m: 8,
    shiftsPerMonth: 16,
    maxConsecutiveMissedDays: 3,
    deductionTotal12m: 11000,
  },
  {
    employeeId: 'demo-guard-6',
    empNumber: 'G-611',
    fullName: 'DISSANAYAKE R.P.',
    rank: 'LSO',
    penaltyCount12m: 0,
    penaltyAmount12m: 0,
    lateCheckIns12m: 0,
    shiftsPerMonth: 24,
    maxConsecutiveMissedDays: 0,
    deductionTotal12m: 1500,
  },
];

export function getDemoGuardCards(): GuardCardDisplay[] {
  const metrics = DEMO_GUARD_RAW.map(
    ({ employeeId, fullName, rank, empNumber, ...m }) => m,
  );
  const rated = computeGuardRatings(metrics);
  return rated.map((row, i) => {
    const meta = DEMO_GUARD_RAW[i];
    return {
      ...row,
      employeeId: meta.employeeId,
      fullName: meta.fullName,
      rank: meta.rank,
      idPhotoUrl: null,
      isBlacklisted: false,
    };
  });
}

export const DEMO_BLACKLISTED: BlacklistedGuardEntry[] = [
  {
    id: 'demo-vault-1',
    employeeId: 'demo-guard-blacklisted',
    empNumber: 'G-887',
    guardName: 'PRADEEP L.S.',
    guardRank: 'JSO',
    reason: 'Repeated post abandonment — pending MD review for reinstatement.',
    blacklistedByName: 'OM Preview',
    blacklistedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
];

// ─── Discrepancies ───────────────────────────────────────────────────────────

export const DEMO_DISCREPANCIES = [
  {
    id: 'demo-disc-1',
    guard_id: 'demo-guard-4',
    shift_date: today,
    rostered_start: rosterIso(today, 7, 0),
    biometric_check_in: rosterIso(today, 8, 12),
    is_overlap_conflict: false,
    employees: {
      first_name: 'JAYAWARDENA',
      last_name: 'T.M.',
      rank_enum: 'JSO',
      basic_salary: 30000,
    },
    site_profiles: { site_name: 'Ceylinco Tower — Floor 12' },
  },
  {
    id: 'demo-disc-2',
    guard_id: 'demo-guard-3',
    shift_date: today,
    rostered_start: rosterIso(today, 19, 0),
    biometric_check_in: rosterIso(today, 18, 40),
    is_overlap_conflict: true,
    employees: {
      first_name: 'SILVA',
      last_name: 'D.P.M.',
      rank_enum: 'SSO',
      basic_salary: 32000,
    },
    site_profiles: { site_name: 'Lanka Hospitals — Gate 3' },
  },
];

export function isDemoId(id: string) {
  return id.startsWith('demo-');
}

// ─── Site allocation (OM command center preview) ───────────────────────────

export const DEMO_ALLOC_GUARD_POOL: OmAssignableGuard[] = [
  { empNo: 'E-0041', name: 'W.K. Samaraweera', rank: 'SSO', rankKey: 'SSO', clearance: 'valid' },
  { empNo: 'E-0044', name: 'D.S. Rajapaksa', rank: 'OIC', rankKey: 'OIC', clearance: 'valid' },
  { empNo: 'E-0052', name: 'R.M. Perera', rank: 'JSO', rankKey: 'JSO', clearance: 'valid' },
  { empNo: 'E-0063', name: 'A.L. Fernando', rank: 'LSO', rankKey: 'LSO', clearance: 'expired' },
  { empNo: 'E-0071', name: 'K.G. Dissanayake', rank: 'JSO', rankKey: 'JSO', clearance: 'expired' },
  { empNo: 'E-0088', name: 'P.B. Wickramasinghe', rank: 'SSO', rankKey: 'SSO', clearance: 'valid' },
  { empNo: 'E-0092', name: 'T.M. Jayasuriya', rank: 'JSO', rankKey: 'JSO', clearance: 'valid' },
  { empNo: 'E-0105', name: 'N.R. Bandara', rank: 'OIC', rankKey: 'OIC', clearance: 'valid' },
  { empNo: 'E-0118', name: 'S.L. Seneviratne', rank: 'SSO', rankKey: 'SSO', clearance: 'valid' },
  { empNo: 'E-0123', name: 'R.P. Gunasekara', rank: 'JSO', rankKey: 'JSO', clearance: 'valid' },
];

export const DEMO_UNASSIGNED_SITES: OmAllocationSite[] = [
  {
    siteId: 'ua-001',
    clientName: 'Dialog Axiata PLC',
    siteName: 'Dialog — Headquarters Tower',
    location: '475 Union Pl, Colombo 02',
    slots: [
      { slotId: 'ua-001-a', rank: 'SSO', shiftType: 'day', label: 'Open slot 1', currentEmpNo: null },
      { slotId: 'ua-001-b', rank: 'SSO', shiftType: 'day', label: 'Open slot 2', currentEmpNo: null },
      { slotId: 'ua-001-c', rank: 'OIC', shiftType: 'night', label: 'Open slot 3', currentEmpNo: null },
    ],
  },
  {
    siteId: 'ua-002',
    clientName: 'Dialog Axiata PLC',
    siteName: 'Dialog — Regional Office Kandy',
    location: 'Kandy City Centre, Kandy',
    slots: [
      { slotId: 'ua-002-a', rank: 'JSO', shiftType: 'both', label: 'Open slot 1', currentEmpNo: null },
      { slotId: 'ua-002-b', rank: 'JSO', shiftType: 'night', label: 'Open slot 2', currentEmpNo: null },
    ],
  },
  {
    siteId: 'ua-003',
    clientName: 'HNB Bank PLC',
    siteName: 'HNB — Nugegoda Branch',
    location: '12 High Level Rd, Nugegoda',
    slots: [
      { slotId: 'ua-003-a', rank: 'JSO', shiftType: 'day', label: 'Open slot 1', currentEmpNo: null },
      { slotId: 'ua-003-b', rank: 'LSO', shiftType: 'night', label: 'Open slot 2', currentEmpNo: null },
    ],
  },
  {
    siteId: 'ua-004',
    clientName: 'HNB Bank PLC',
    siteName: 'HNB — Borella Branch',
    location: '22 Baseline Rd, Colombo 08',
    slots: [
      { slotId: 'ua-004-a', rank: 'JSO', shiftType: 'both', label: 'Open slot 1', currentEmpNo: null },
      { slotId: 'ua-004-b', rank: 'JSO', shiftType: 'day', label: 'Open slot 2', currentEmpNo: null },
      { slotId: 'ua-004-c', rank: 'SSO', shiftType: 'night', label: 'Open slot 3', currentEmpNo: null },
    ],
  },
];

export const DEMO_ALLOCATED_SITES: OmAllocationSite[] = [
  {
    siteId: 'al-001',
    clientName: 'Lanka Hospitals Corp',
    siteName: 'Lanka Hospitals — Main Gate',
    location: '578 Elvitigala Mawatha, Colombo 05',
    slots: [
      { slotId: 'al-001-a', rank: 'SSO', shiftType: 'day', label: 'P.B. Wickramasinghe', currentEmpNo: 'E-0088' },
      { slotId: 'al-001-b', rank: 'SSO', shiftType: 'day', label: 'S.L. Seneviratne', currentEmpNo: 'E-0118' },
      { slotId: 'al-001-c', rank: 'OIC', shiftType: 'night', label: 'D.S. Rajapaksa', currentEmpNo: 'E-0044' },
    ],
    changeRequest:
      'Client requests replacement of SSO on Day Shift 2 — performance concerns raised via email.',
    changeRequestDate: '2026-05-26',
  },
  {
    siteId: 'al-002',
    clientName: 'Lanka Hospitals Corp',
    siteName: 'Lanka Hospitals — Blood Bank',
    location: '578 Elvitigala Mawatha, Colombo 05 (Block B)',
    slots: [
      { slotId: 'al-002-a', rank: 'JSO', shiftType: 'day', label: 'R.M. Perera', currentEmpNo: 'E-0052' },
      { slotId: 'al-002-b', rank: 'JSO', shiftType: 'day', label: 'T.M. Jayasuriya', currentEmpNo: 'E-0092' },
      { slotId: 'al-002-c', rank: 'SSO', shiftType: 'night', label: 'W.K. Samaraweera', currentEmpNo: 'E-0041' },
    ],
  },
  {
    siteId: 'al-003',
    clientName: 'Sampath Bank PLC',
    siteName: 'Sampath — Union Place',
    location: '330 Union Pl, Colombo 02',
    slots: [
      { slotId: 'al-003-a', rank: 'JSO', shiftType: 'day', label: 'R.P. Gunasekara', currentEmpNo: 'E-0123' },
      { slotId: 'al-003-b', rank: 'LSO', shiftType: 'night', label: 'N.R. Bandara', currentEmpNo: 'E-0105' },
    ],
  },
];

export const DEMO_TACTICAL_SHORTS: OmTacticalShort[] = [
  {
    shortId: 'SHT-001',
    site: 'Lanka Hospitals',
    client: 'Lanka Hospitals PLC',
    sector: 'Colombo North',
    required: 4,
    deployed: 2,
    smName: 'SM Dissanayake',
    shiftTime: '22:00 – 06:00',
    loanerStatus: 'IDLE',
    siteLat: 6.902,
    siteLng: 79.8607,
  },
  {
    shortId: 'SHT-002',
    site: 'Dialog Axiata HQ',
    client: 'Dialog Axiata PLC',
    sector: 'Colombo Central',
    required: 5,
    deployed: 3,
    smName: 'SM Fernando',
    shiftTime: '14:00 – 22:00',
    loanerStatus: 'FOUND',
    siteLat: 6.911,
    siteLng: 79.85,
  },
];
