'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { getOmServiceDb } from '../../../lib/om-service-db';
import { fetchActiveSectorManagerRecordsForCompany } from '../../../lib/sector-manager-roster';
import {
  collectSmEpfAliasKeys,
  normalizeSmEpf,
  sectorManagerEpfKey,
} from '../../../../../packages/supabase/sm-epf';
import { CVS_GUARD_OPS_ENABLED } from '../../../lib/cvs-workforce-phase';
import { fetchSectorOmAssignmentsForCompany } from '../../../lib/om-sector-assignment-data';
import type { SectorOmAssignedOm } from '../../../lib/om-sector-assignment-spec';
import {
  isOmSectorScopeEmpty,
  omSectorOwnsGuardEpf,
  omSectorOwnsSiteName,
  omSectorOwnsSmKey,
  resolveOmSectorScopeForSession,
  type OmSectorScope,
} from '../../../lib/om-sector-scope';
import { getOmSiteAllocationData } from './allocation';

export type LiveShiftShort = {
  site: string;
  siteCode: string;
  missingCount: number;
  missingGuards?: string[];
};

/** Sector tile incident modal rows (maps to operations `Incident` UI). */
export type LiveSectorIncident = {
  id: string;
  what: string;
  where: string;
  siteCode: string;
  who: string;
  time: string;
  /** ISO timestamp for sector modal ordering (not shown in UI). */
  reportedAt: string;
  penalty?: string;
  penaltyReason?: string;
};

/** Sector tile penalty modal rows (maps to operations `Penalty` UI). */
export type LiveSectorPenalty = {
  id: string;
  guard: string;
  site: string;
  siteCode: string;
  amount: string;
  reason: string;
  time: string;
  reportedAt: string;
};

/** Sector tile client-complaint modal rows (maps to operations `ClientComplaint` UI). */
export type LiveSectorComplaint = {
  id: string;
  what: string;
  site: string;
  siteCode: string;
  who: string;
  client: string;
  time: string;
  note?: string;
  reportedAt: string;
};

export type LiveContinuationShift = {
  hours: 24 | 36 | 48 | 60;
  guard: string;
  site: string;
  siteCode: string;
};

export type LiveFieldSector = {
  id: string;
  /** Canonical SM EPF — joins sector_role_assignments (OM rows). */
  smEpf: string;
  name: string;
  region: string;
  sm: string;
  smPhone: string;
  assignedOm: SectorOmAssignedOm;
  guardsOnShift: number;
  guardsTotal: number;
  sitesToday: number;
  sitesTotal: number;
  openIncidents: number;
  deficits: number;
  status: 'NOMINAL' | 'ATTENTION' | 'CRITICAL';
  lastUpdate: string;
  incidents: LiveSectorIncident[];
  penalties: LiveSectorPenalty[];
  clientComplaints: LiveSectorComplaint[];
  dayShiftShorts: LiveShiftShort[];
  nightShiftShorts: LiveShiftShort[];
  continuationShifts: LiveContinuationShift[];
};

export type LiveFieldIncident = {
  id: string;
  timestamp: string;
  site: string;
  incidentType:
    | 'SLEEPING_ON_POST'
    | 'CLIENT_COMPLAINT'
    | 'THEFT'
    | 'UNIFORM_VIOLATION'
    | 'UNAUTHORIZED_ABSENCE'
    | 'GUARD_VOICE_REPORT';
  guardName: string;
  guardEmpNo: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  ack: { OM: boolean; SM: boolean; MD: boolean };
  source: 'sm_report' | 'guard_voice';
};

export type LiveFieldRadarPayload = {
  sectors: LiveFieldSector[];
  fieldIncidents: LiveFieldIncident[];
  error?: string;
};

const EMPTY: LiveFieldRadarPayload = { sectors: [], fieldIncidents: [] };

function omScopeAllowsSmKey(omScope: OmSectorScope | null, smKey: string): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  return omSectorOwnsSmKey(omScope, smKey);
}

function omScopeAllowsFieldIncident(
  omScope: OmSectorScope | null,
  incident: LiveFieldIncident,
): boolean {
  if (omScope === null) return true;
  if (isOmSectorScopeEmpty(omScope)) return false;
  if (omSectorOwnsGuardEpf(omScope, incident.guardEmpNo)) return true;
  return omSectorOwnsSiteName(omScope, incident.site);
}

function sectorStatus(coveragePct: number, deficits: number): LiveFieldSector['status'] {
  if (deficits >= 4 || coveragePct < 75) return 'CRITICAL';
  if (deficits >= 2 || coveragePct < 90) return 'ATTENTION';
  return 'NOMINAL';
}

function mapIncidentType(raw: string): LiveFieldIncident['incidentType'] {
  const normalized = raw.toUpperCase();
  if (normalized.includes('THEFT')) return 'THEFT';
  if (normalized.includes('UNIFORM')) return 'UNIFORM_VIOLATION';
  if (normalized.includes('ABSENCE')) return 'UNAUTHORIZED_ABSENCE';
  if (normalized.includes('SLEEP')) return 'SLEEPING_ON_POST';
  return 'CLIENT_COMPLAINT';
}

function mapSeverity(raw: string): LiveFieldIncident['severity'] {
  const normalized = raw.toUpperCase();
  if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'HIGH';
  if (normalized === 'LOW') return 'LOW';
  return 'MEDIUM';
}

async function fetchSites(companyId: string | null): Promise<{
  sites: FieldRadarSiteRow[];
  error?: string;
}> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name, site_code, assigned_sm_epf, required_guards, address')
    .neq('site_status', 'ARCHIVED')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[field-radar] site_profiles:', error.message);
    return { sites: [], error: `Sites: ${error.message}` };
  }
  return { sites: (data ?? []) as FieldRadarSiteRow[] };
}

const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

async function fetchGuards(companyId: string | null): Promise<{
  guards: { emp_number: string; full_name: string | null; site: string | null }[];
  error?: string;
}> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, site, group, status')
    .in('group', [...GUARD_GROUPS])
    .eq('status', 'ACTIVE');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[field-radar] employees (guards):', error.message);
    return { guards: [], error: `Guards: ${error.message}` };
  }
  return {
    guards: (data ?? []).map((row) => ({
      emp_number: String(row.emp_number),
      full_name: row.full_name as string | null,
      site: row.site as string | null,
    })),
  };
}

type FieldRadarManager = {
  canonicalKey: string;
  full_name: string | null;
  site: string | null;
  phone: string | null;
  aliasKeys: string[];
};

type FieldRadarSiteRow = {
  id: string;
  site_name: string;
  site_code: string | null;
  assigned_sm_epf: string | null;
  required_guards: number | null;
  address: string | null;
};

function registerSiteAlias(map: Map<string, string>, siteId: string, raw: string) {
  const key = normalizeSiteKey(raw);
  if (!key || key.startsWith('unassigned')) return;
  map.set(key, siteId);
}

function buildSiteAliasIndex(sites: FieldRadarSiteRow[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const site of sites) {
    const siteId = String(site.id);
    registerSiteAlias(aliases, siteId, site.site_name);
    if (site.site_code) registerSiteAlias(aliases, siteId, site.site_code);
    for (const part of site.site_name.split(/\s*[—–-]\s*/)) {
      registerSiteAlias(aliases, siteId, part);
    }
  }
  return aliases;
}

function countGuardsBySiteId(
  sites: FieldRadarSiteRow[],
  guards: { site: string | null }[],
): Map<string, number> {
  const aliasIndex = buildSiteAliasIndex(sites);
  const counts = new Map<string, number>();
  for (const guard of guards) {
    const siteId = aliasIndex.get(normalizeSiteKey(guard.site));
    if (!siteId) continue;
    counts.set(siteId, (counts.get(siteId) ?? 0) + 1);
  }
  return counts;
}

function resolveSmSectorLabel(manager: FieldRadarManager | undefined): string {
  const sector = manager?.site?.trim() ?? '';
  return sector;
}

function resolveSmPhone(manager: FieldRadarManager | undefined): string {
  const phone = manager?.phone?.trim();
  return phone || '—';
}

async function fetchManagers(companyId: string | null): Promise<{
  managers: FieldRadarManager[];
  error?: string;
}> {
  const supabase = getOmServiceDb();
  const managers = await fetchActiveSectorManagerRecordsForCompany(
    supabase,
    companyId,
    'emp_number, epf_no, epf_num, full_name, site, phone, group, rank, status',
  );
  return {
    managers: managers
      .map((row) => {
        const canonicalKey = sectorManagerEpfKey(row);
        if (!canonicalKey) return null;
        return {
          canonicalKey,
          full_name: row.full_name ?? null,
          site: row.site ?? null,
          phone: row.phone != null ? String(row.phone) : null,
          aliasKeys: collectSmEpfAliasKeys(row),
        };
      })
      .filter((row): row is FieldRadarManager => row != null),
  };
}

function buildManagerLookup(managers: FieldRadarManager[]) {
  const byKey = new Map<string, FieldRadarManager>();
  for (const manager of managers) {
    byKey.set(manager.canonicalKey, manager);
    for (const alias of manager.aliasKeys) {
      byKey.set(alias, manager);
    }
  }
  return byKey;
}

async function fetchOpenSmIncidents(
  supabase: ReturnType<typeof getOmServiceDb>,
  companyId: string | null,
): Promise<
  {
    id: string;
    sm_epf: string;
    site_name: string | null;
    severity: string;
    incident_type: string;
    description: string;
    created_at: string;
    guards_involved: string[] | null;
    ack_om: boolean;
    ack_sm: boolean;
    ack_md: boolean;
    action_taken: string | null;
  }[]
> {
  try {
    let query = supabase
      .from('sm_incident_reports')
      .select(
        'id, sm_epf, site_name, severity, incident_type, description, created_at, guards_involved, ack_om, ack_sm, ack_md, action_taken, company_id',
      )
      .in('status', ['OPEN', 'UNDER_REVIEW', 'ESCALATED'])
      .order('created_at', { ascending: false })
      .limit(80);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as typeof data;
  } catch {
    return [];
  }
}

async function fetchGuardVoiceIncidents(
  supabase: ReturnType<typeof getOmServiceDb>,
  companyId: string | null,
): Promise<
  {
    id: string;
    emp_number: string;
    description: string;
    severity: string | null;
    status: string;
    created_at: string;
  }[]
> {
  try {
    let query = supabase
      .from('incidents')
      .select('id, emp_number, description, severity, status, created_at, company_id')
      .in('status', ['PENDING', 'OPEN'])
      .order('created_at', { ascending: false })
      .limit(40);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as typeof data;
  } catch {
    return [];
  }
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveSiteCodeForName(
  siteName: string | null | undefined,
  smSites: FieldRadarSiteRow[],
): string {
  const normalized = normalizeSiteKey(siteName);
  if (!normalized) return '—';

  for (const site of smSites) {
    if (normalizeSiteKey(site.site_name) === normalized) {
      const code = site.site_code?.trim();
      return code || String(site.id).slice(0, 8).toUpperCase();
    }
    for (const part of site.site_name.split(/\s*[—–-]\s*/)) {
      if (normalizeSiteKey(part) === normalized) {
        const code = site.site_code?.trim();
        return code || String(site.id).slice(0, 8).toUpperCase();
      }
    }
  }

  return String(siteName).slice(0, 8).toUpperCase();
}

function mapSmReportToSectorIncident(
  row: {
    id: string;
    site_name: string | null;
    incident_type: string;
    description: string;
    created_at: string;
  },
  guardLabel: string,
  siteCode: string,
): LiveSectorIncident {
  const incidentType = String(row.incident_type ?? '').trim();
  const description = String(row.description ?? '').trim();
  return {
    id: String(row.id),
    what: description || incidentType || 'Incident reported',
    where: String(row.site_name ?? 'Unknown site'),
    siteCode,
    who: guardLabel,
    time: new Date(String(row.created_at)).toLocaleString('en-GB'),
    reportedAt: String(row.created_at),
  };
}

function resolveSectorIncidents(
  smKey: string,
  manager: FieldRadarManager | undefined,
  incidentsBySmList: Map<string, LiveSectorIncident[]>,
): LiveSectorIncident[] {
  const keys = new Set<string>([smKey]);
  if (manager?.canonicalKey) keys.add(manager.canonicalKey);
  for (const alias of manager?.aliasKeys ?? []) keys.add(alias);

  const seen = new Set<string>();
  const rows: LiveSectorIncident[] = [];
  for (const key of keys) {
    for (const incident of incidentsBySmList.get(key) ?? []) {
      if (seen.has(incident.id)) continue;
      seen.add(incident.id);
      rows.push(incident);
    }
  }

  return rows.sort(
    (a, b) =>
      new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime() ||
      b.id.localeCompare(a.id),
  );
}

function countOpenIncidentsForSm(
  smKey: string,
  manager: FieldRadarManager | undefined,
  incidentsBySm: Map<string, number>,
): number {
  const keys = new Set<string>([smKey]);
  if (manager?.canonicalKey) keys.add(manager.canonicalKey);
  for (const alias of manager?.aliasKeys ?? []) keys.add(alias);

  let total = 0;
  for (const key of keys) {
    total += incidentsBySm.get(key) ?? 0;
  }
  return total;
}

function smLookupKeys(smKey: string, manager: FieldRadarManager | undefined): Set<string> {
  const keys = new Set<string>([smKey]);
  if (manager?.canonicalKey) keys.add(manager.canonicalKey);
  for (const alias of manager?.aliasKeys ?? []) keys.add(alias);
  return keys;
}

function resolveSectorRows<T extends { id: string; reportedAt: string }>(
  smKey: string,
  manager: FieldRadarManager | undefined,
  rowsBySm: Map<string, T[]>,
): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const key of smLookupKeys(smKey, manager)) {
    for (const row of rowsBySm.get(key) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows.sort(
    (a, b) =>
      new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime() ||
      b.id.localeCompare(a.id),
  );
}

function splitDayNightRequired(required: number): { day: number; night: number } {
  const total = Math.max(1, required);
  if (total <= 1) return { day: total, night: 0 };
  const night = Math.floor(total / 2);
  return { day: total - night, night };
}

function continuationBucketHours(elapsedHours: number): 24 | 36 | 48 | 60 | null {
  if (elapsedHours < 24) return null;
  if (elapsedHours >= 60) return 60;
  if (elapsedHours >= 48) return 48;
  if (elapsedHours >= 36) return 36;
  return 24;
}

type SmGuardAttendanceRow = {
  sm_epf: string;
  shift_date: string;
  shift_type: string;
  site_name: string;
  guard_epf: string;
  status: string;
};

type SmPenaltyRow = {
  id: string;
  sm_epf: string;
  guard_epf: string;
  guard_name: string | null;
  reason: string;
  site_name: string | null;
  deduction_amount: number | null;
  created_at: string;
  status: string;
};

type AttendanceLogRow = {
  emp_number: string;
  action_type: string;
  device_time: string;
};

async function fetchRecentPenalties(
  supabase: ReturnType<typeof getOmServiceDb>,
): Promise<SmPenaltyRow[]> {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const { data, error } = await supabase
      .from('sm_guard_penalties')
      .select(
        'id, sm_epf, guard_epf, guard_name, reason, site_name, deduction_amount, created_at, status',
      )
      .gte('created_at', since.toISOString())
      .neq('status', 'REJECTED')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data as SmPenaltyRow[];
  } catch {
    return [];
  }
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchSmGuardAttendanceForDate(
  supabase: ReturnType<typeof getOmServiceDb>,
  shiftDate: string,
): Promise<SmGuardAttendanceRow[]> {
  try {
    const { data, error } = await supabase
      .from('sm_guard_attendance')
      .select('sm_epf, shift_date, shift_type, site_name, guard_epf, status')
      .eq('shift_date', shiftDate)
      .neq('status', 'CANCELLED');
    if (error || !data) return [];
    return data as SmGuardAttendanceRow[];
  } catch {
    return [];
  }
}

async function fetchAttendanceLogsForContinuation(
  supabase: ReturnType<typeof getOmServiceDb>,
  companyId: string | null,
): Promise<AttendanceLogRow[]> {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 3);
    let query = supabase
      .from('attendance_logs')
      .select('emp_number, action_type, device_time, company_id')
      .gte('device_time', since.toISOString())
      .in('action_type', ['CHECK_IN', 'CHECK_OUT'])
      .order('device_time', { ascending: true })
      .limit(2000);
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data as AttendanceLogRow[];
  } catch {
    return [];
  }
}

function buildRosterCountBySiteShift(
  rows: SmGuardAttendanceRow[],
): Map<string, { day: number; night: number }> {
  const map = new Map<string, { day: number; night: number }>();
  for (const row of rows) {
    const key = normalizeSiteKey(row.site_name);
    if (!key) continue;
    const bucket = map.get(key) ?? { day: 0, night: 0 };
    if (String(row.shift_type).toUpperCase() === 'NIGHT') {
      bucket.night += 1;
    } else {
      bucket.day += 1;
    }
    map.set(key, bucket);
  }
  return map;
}

function mapSmReportToSectorComplaint(
  row: {
    id: string;
    site_name: string | null;
    incident_type: string;
    description: string;
    created_at: string;
    action_taken: string | null;
  },
  guardLabel: string,
  siteCode: string,
): LiveSectorComplaint {
  const description = String(row.description ?? '').trim();
  const incidentType = String(row.incident_type ?? '').trim();
  return {
    id: String(row.id),
    what: description || incidentType || 'Client complaint',
    site: String(row.site_name ?? 'Unknown site'),
    siteCode,
    who: guardLabel,
    client: 'Client report',
    time: new Date(String(row.created_at)).toLocaleString('en-GB'),
    reportedAt: String(row.created_at),
    note: row.action_taken?.trim() || undefined,
  };
}

function mapPenaltyToSectorRow(
  row: SmPenaltyRow,
  siteCode: string,
): LiveSectorPenalty {
  const amount = Number(row.deduction_amount) || 0;
  return {
    id: String(row.id),
    guard: String(row.guard_name?.trim() || row.guard_epf),
    site: String(row.site_name ?? '—'),
    siteCode,
    amount: `LKR ${amount.toLocaleString('en-GB')}`,
    reason: String(row.reason ?? 'Penalty'),
    time: new Date(String(row.created_at)).toLocaleString('en-GB'),
    reportedAt: String(row.created_at),
  };
}

function computeContinuationShifts(
  logs: AttendanceLogRow[],
  guardNameByEpf: Map<string, string>,
  guardSiteByEpf: Map<string, string>,
  sites: FieldRadarSiteRow[],
): LiveContinuationShift[] {
  const byGuard = new Map<string, AttendanceLogRow[]>();
  for (const log of logs) {
    const epf = String(log.emp_number);
    const list = byGuard.get(epf) ?? [];
    list.push(log);
    byGuard.set(epf, list);
  }

  const now = Date.now();
  const results: LiveContinuationShift[] = [];

  for (const [epf, guardLogs] of byGuard) {
    let openCheckIn: string | null = null;
    for (const log of guardLogs) {
      if (log.action_type === 'CHECK_IN') {
        openCheckIn = log.device_time;
      } else if (log.action_type === 'CHECK_OUT') {
        openCheckIn = null;
      }
    }
    if (!openCheckIn) continue;

    const elapsedHours = (now - new Date(openCheckIn).getTime()) / 3_600_000;
    const bucket = continuationBucketHours(elapsedHours);
    if (!bucket) continue;

    const siteName = guardSiteByEpf.get(epf) ?? 'Field post';
    results.push({
      hours: bucket,
      guard: guardNameByEpf.get(epf) ?? epf,
      site: siteName,
      siteCode: resolveSiteCodeForName(siteName, sites),
    });
  }

  return results.sort((a, b) => b.hours - a.hours || a.guard.localeCompare(b.guard));
}

function computeShiftShortsForSite(
  site: FieldRadarSiteRow,
  rosterBySite: Map<string, { day: number; night: number }>,
): { day: LiveShiftShort[]; night: LiveShiftShort[] } {
  const required = Math.max(1, Number(site.required_guards ?? 1));
  const { day: reqDay, night: reqNight } = splitDayNightRequired(required);
  const roster = rosterBySite.get(normalizeSiteKey(site.site_name)) ?? { day: 0, night: 0 };
  const siteLabel = String(site.site_name);
  const siteCode =
    site.site_code?.trim() || String(site.id).slice(0, 8).toUpperCase();

  const day: LiveShiftShort[] = [];
  const night: LiveShiftShort[] = [];

  const dayGap = Math.max(0, reqDay - roster.day);
  if (dayGap > 0) {
    day.push({ site: siteLabel, siteCode, missingCount: dayGap });
  }

  const nightGap = Math.max(0, reqNight - roster.night);
  if (nightGap > 0) {
    night.push({ site: siteLabel, siteCode, missingCount: nightGap });
  }

  return { day, night };
}

function buildDeployedCountBySiteFromAttendance(
  attendance: SmGuardAttendanceRow[],
  sites: FieldRadarSiteRow[],
): Map<string, number> {
  const siteNameToId = new Map<string, string>();
  for (const site of sites) {
    siteNameToId.set(normalizeSiteKey(site.site_name), String(site.id));
    if (site.site_code) siteNameToId.set(normalizeSiteKey(site.site_code), String(site.id));
  }

  const guardsBySiteId = new Map<string, Set<string>>();
  for (const row of attendance) {
    const siteId = siteNameToId.get(normalizeSiteKey(row.site_name));
    if (!siteId) continue;
    const guards = guardsBySiteId.get(siteId) ?? new Set<string>();
    guards.add(String(row.guard_epf));
    guardsBySiteId.set(siteId, guards);
  }

  const counts = new Map<string, number>();
  for (const [siteId, guards] of guardsBySiteId) {
    counts.set(siteId, guards.size);
  }
  return counts;
}

function continuationShiftsForSm(
  smSites: FieldRadarSiteRow[],
  continuationShifts: LiveContinuationShift[],
): LiveContinuationShift[] {
  const siteKeys = new Set<string>();
  for (const site of smSites) {
    siteKeys.add(normalizeSiteKey(site.site_name));
    if (site.site_code) siteKeys.add(normalizeSiteKey(site.site_code));
    for (const part of site.site_name.split(/\s*[—–-]\s*/)) {
      siteKeys.add(normalizeSiteKey(part));
    }
  }
  return continuationShifts.filter((shift) => siteKeys.has(normalizeSiteKey(shift.site)));
}

async function fetchSitesWithFallback(sessionCompanyId: string | null): Promise<{
  sites: FieldRadarSiteRow[];
  errors: string[];
}> {
  const preferred = rosterCompanyId(sessionCompanyId);
  const errors: string[] = [];

  if (preferred) {
    const scoped = await fetchSites(preferred);
    if (scoped.error) errors.push(scoped.error);
    if (scoped.sites.length > 0) return { sites: scoped.sites, errors };
  }

  const broad = await fetchSites(null);
  if (broad.error) errors.push(broad.error);
  return { sites: broad.sites, errors };
}

async function fetchGuardsWithFallback(sessionCompanyId: string | null): Promise<{
  guards: { emp_number: string; full_name: string | null; site: string | null }[];
  errors: string[];
}> {
  const preferred = rosterCompanyId(sessionCompanyId);
  const errors: string[] = [];

  if (preferred) {
    const scoped = await fetchGuards(preferred);
    if (scoped.error) errors.push(scoped.error);
    if (scoped.guards.length > 0) return { guards: scoped.guards, errors };
  }

  const broad = await fetchGuards(null);
  if (broad.error) errors.push(broad.error);
  return { guards: broad.guards, errors };
}

async function fetchManagersWithFallback(sessionCompanyId: string | null): Promise<{
  managers: FieldRadarManager[];
  errors: string[];
}> {
  const preferred = rosterCompanyId(sessionCompanyId);
  const errors: string[] = [];

  if (preferred) {
    const scoped = await fetchManagers(preferred);
    if (scoped.error) errors.push(scoped.error);
    if (scoped.managers.length > 0) return { managers: scoped.managers, errors };
  }

  const broad = await fetchManagers(null);
  if (broad.error) errors.push(broad.error);
  return { managers: broad.managers, errors };
}

export async function getLiveFieldRadar(options?: {
  shiftDate?: string;
}): Promise<LiveFieldRadarPayload> {
  if (!CVS_GUARD_OPS_ENABLED) {
    return EMPTY;
  }

  const shiftDate = options?.shiftDate ?? todayUtcDate();
  const isLiveDay = shiftDate === todayUtcDate();

  try {
    const supabase = await createSupabaseServerClient();
    const omDb = getOmServiceDb();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);

    const [allocation, sitesResult, guardsResult, managersResult, openSmIncidents, guardVoiceIncidents, recentPenalties, shiftAttendance, continuationLogs, sectorOmAssignments, omScope] =
      await Promise.all([
      getOmSiteAllocationData(),
      fetchSitesWithFallback(sessionCompanyId),
      fetchGuardsWithFallback(sessionCompanyId),
      fetchManagersWithFallback(sessionCompanyId),
      fetchOpenSmIncidents(omDb, companyId),
      fetchGuardVoiceIncidents(omDb, companyId),
      fetchRecentPenalties(omDb),
      fetchSmGuardAttendanceForDate(omDb, shiftDate),
      isLiveDay
        ? fetchAttendanceLogsForContinuation(omDb, companyId)
        : Promise.resolve([] as AttendanceLogRow[]),
      companyId
        ? fetchSectorOmAssignmentsForCompany(companyId)
        : Promise.resolve({} as Record<string, NonNullable<SectorOmAssignedOm>>),
      resolveOmSectorScopeForSession(),
    ]);

    const sites = sitesResult.sites;
    const guards = guardsResult.guards;
    const managers = managersResult.managers;
    const loadErrors = [
      ...sitesResult.errors,
      ...guardsResult.errors,
      ...managersResult.errors,
      allocation.error,
    ].filter((message): message is string => Boolean(message));

    const guardsBySiteId = countGuardsBySiteId(sites, guards);
    const deployedBySiteId = isLiveDay
      ? guardsBySiteId
      : buildDeployedCountBySiteFromAttendance(shiftAttendance, sites);

    const guardNameByEpf = new Map<string, string>();
    const guardSiteByEpf = new Map<string, string>();
    for (const guard of guards) {
      const epf = String(guard.emp_number);
      const name = guard.full_name?.trim();
      if (name) guardNameByEpf.set(epf, name);
      const site = guard.site?.trim();
      if (site) guardSiteByEpf.set(epf, site);
    }

    const incidentsBySm = new Map<string, number>();
    const incidentsBySmList = new Map<string, LiveSectorIncident[]>();
    const complaintsBySmList = new Map<string, LiveSectorComplaint[]>();
    const penaltiesBySmList = new Map<string, LiveSectorPenalty[]>();
    const rosterBySite = buildRosterCountBySiteShift(shiftAttendance);
    const continuationShifts = isLiveDay
      ? computeContinuationShifts(
          continuationLogs,
          guardNameByEpf,
          guardSiteByEpf,
          sites,
        )
      : [];

    for (const row of recentPenalties) {
      const smEpf = normalizeSmEpf(row.sm_epf) ?? String(row.sm_epf);
      if (!omScopeAllowsSmKey(omScope, smEpf)) continue;
      const penalty = mapPenaltyToSectorRow(
        row,
        resolveSiteCodeForName(row.site_name, sites),
      );
      const list = penaltiesBySmList.get(smEpf) ?? [];
      list.push(penalty);
      penaltiesBySmList.set(smEpf, list);
    }

    const smFieldIncidents: LiveFieldIncident[] = [];
    for (const row of openSmIncidents) {
      const smEpf = normalizeSmEpf(row.sm_epf) ?? String(row.sm_epf);
      if (!omScopeAllowsSmKey(omScope, smEpf)) continue;
      const guardEpf = row.guards_involved?.[0] ?? smEpf;
      const guardLabel = guardNameByEpf.get(guardEpf) ?? guardEpf;
      const siteCode = resolveSiteCodeForName(row.site_name, sites);
      const isClientComplaint =
        String(row.incident_type).toUpperCase() === 'CLIENT_COMPLAINT';

      if (isClientComplaint) {
        const complaint = mapSmReportToSectorComplaint(row, guardLabel, siteCode);
        const complaintList = complaintsBySmList.get(smEpf) ?? [];
        complaintList.push(complaint);
        complaintsBySmList.set(smEpf, complaintList);
      } else {
        incidentsBySm.set(smEpf, (incidentsBySm.get(smEpf) ?? 0) + 1);
        const sectorIncident = mapSmReportToSectorIncident(row, guardLabel, siteCode);
        const incidentList = incidentsBySmList.get(smEpf) ?? [];
        incidentList.push(sectorIncident);
        incidentsBySmList.set(smEpf, incidentList);
      }

      smFieldIncidents.push({
        id: String(row.id),
        timestamp: String(row.created_at),
        site: String(row.site_name ?? 'Unknown site'),
        incidentType: mapIncidentType(String(row.incident_type)),
        guardName: guardLabel,
        guardEmpNo: guardEpf,
        severity: mapSeverity(String(row.severity)),
        ack: {
          OM: Boolean(row.ack_om),
          SM: Boolean(row.ack_sm),
          MD: Boolean(row.ack_md),
        },
        source: 'sm_report' as const,
      });
    }

    const guardFieldIncidents: LiveFieldIncident[] = guardVoiceIncidents
      .map((row) => {
      const empNo = String(row.emp_number);
      return {
        id: String(row.id),
        timestamp: String(row.created_at),
        site: guardSiteByEpf.get(empNo) ?? 'Field voice report',
        incidentType: 'GUARD_VOICE_REPORT' as const,
        guardName: guardNameByEpf.get(empNo) ?? empNo,
        guardEmpNo: empNo,
        severity: mapSeverity(String(row.severity ?? 'MEDIUM')),
        ack: {
          OM: row.status === 'ACKNOWLEDGED',
          SM: false,
          MD: row.status === 'ACKNOWLEDGED',
        },
        source: 'guard_voice' as const,
      };
    })
      .filter((incident) => omScopeAllowsFieldIncident(omScope, incident));

    const fieldIncidents = [...smFieldIncidents, ...guardFieldIncidents]
      .filter((incident) => omScopeAllowsFieldIncident(omScope, incident))
      .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const managerLookup = buildManagerLookup(managers);

    const sitesBySm = new Map<string, typeof sites>();
    for (const site of sites) {
      const smKey = normalizeSmEpf(site.assigned_sm_epf);
      if (!smKey) {
        const list = sitesBySm.get('__unassigned__') ?? [];
        list.push(site);
        sitesBySm.set('__unassigned__', list);
        continue;
      }
      const bucketKey = managerLookup.get(smKey)?.canonicalKey ?? smKey;
      const list = sitesBySm.get(bucketKey) ?? [];
      list.push(site);
      sitesBySm.set(bucketKey, list);
    }

    const managerKeys = new Set<string>(managers.map((m) => m.canonicalKey));
    for (const smKey of sitesBySm.keys()) {
      if (smKey !== '__unassigned__') managerKeys.add(smKey);
    }

    const nowLabel = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const sectors: LiveFieldSector[] = [];

    for (const smKey of managerKeys) {
      if (!omScopeAllowsSmKey(omScope, smKey)) continue;
      const manager = managerLookup.get(smKey);
      const smSites = sitesBySm.get(smKey) ?? [];
      if (!manager && smSites.length === 0) continue;

      let guardsOnShift = 0;
      let guardsTotal = 0;
      let sitesStaffedToday = 0;
      const dayShiftShorts: LiveShiftShort[] = [];
      const nightShiftShorts: LiveShiftShort[] = [];

      for (const site of smSites) {
        const required = Math.max(1, Number(site.required_guards ?? 1));
        const siteId = String(site.id);
        const deployed = deployedBySiteId.get(siteId) ?? 0;
        guardsOnShift += deployed;
        guardsTotal += required;
        if (deployed > 0) sitesStaffedToday += 1;

        const shorts = computeShiftShortsForSite(site, rosterBySite);
        dayShiftShorts.push(...shorts.day);
        nightShiftShorts.push(...shorts.night);
      }

      const deficits =
        dayShiftShorts.reduce((sum, row) => sum + row.missingCount, 0) +
        nightShiftShorts.reduce((sum, row) => sum + row.missingCount, 0);
      const coveragePct =
        guardsTotal > 0 ? Math.round((guardsOnShift / guardsTotal) * 100) : 100;

      const smDisplayName =
        String(manager?.full_name ?? managerLookup.get(smKey)?.full_name ?? smKey).trim() || smKey;
      const canonicalSmEpf = manager?.canonicalKey ?? smKey;

      sectors.push({
        id: canonicalSmEpf,
        smEpf: canonicalSmEpf,
        // Cards are per sector manager (OM PRD), not geographic sector labels.
        name: smDisplayName,
        region: resolveSmSectorLabel(manager),
        sm: smDisplayName,
        smPhone: resolveSmPhone(manager),
        assignedOm: sectorOmAssignments[canonicalSmEpf] ?? null,
        guardsOnShift,
        guardsTotal,
        sitesToday: sitesStaffedToday,
        sitesTotal: smSites.length,
        openIncidents: isLiveDay
          ? countOpenIncidentsForSm(smKey, manager, incidentsBySm)
          : 0,
        deficits,
        status: sectorStatus(coveragePct, deficits),
        lastUpdate: nowLabel,
        incidents: isLiveDay
          ? resolveSectorIncidents(smKey, manager, incidentsBySmList)
          : [],
        penalties: resolveSectorRows(smKey, manager, penaltiesBySmList),
        clientComplaints: resolveSectorRows(smKey, manager, complaintsBySmList),
        dayShiftShorts,
        nightShiftShorts,
        continuationShifts: isLiveDay
          ? continuationShiftsForSm(smSites, continuationShifts)
          : [],
      });
    }

    if (omScope === null && (sitesBySm.get('__unassigned__') ?? []).length > 0) {
      const unassigned = sitesBySm.get('__unassigned__') ?? [];
      let guardsOnShift = 0;
      let guardsTotal = 0;
      let sitesStaffedToday = 0;
      const dayShiftShorts: LiveShiftShort[] = [];
      const nightShiftShorts: LiveShiftShort[] = [];
      for (const site of unassigned) {
        const required = Math.max(1, Number(site.required_guards ?? 1));
        const siteId = String(site.id);
        const deployed = deployedBySiteId.get(siteId) ?? 0;
        guardsOnShift += deployed;
        guardsTotal += required;
        if (deployed > 0) sitesStaffedToday += 1;
        const shorts = computeShiftShortsForSite(site, rosterBySite);
        dayShiftShorts.push(...shorts.day);
        nightShiftShorts.push(...shorts.night);
      }
      const deficits =
        dayShiftShorts.reduce((sum, row) => sum + row.missingCount, 0) +
        nightShiftShorts.reduce((sum, row) => sum + row.missingCount, 0);
      const coveragePct =
        guardsTotal > 0 ? Math.round((guardsOnShift / guardsTotal) * 100) : 100;
      sectors.push({
        id: '__unassigned__',
        smEpf: '__unassigned__',
        name: 'Pending SM assignment',
        region: 'Unassigned portfolio',
        sm: '—',
        smPhone: '—',
        assignedOm: null,
        guardsOnShift,
        guardsTotal,
        sitesToday: sitesStaffedToday,
        sitesTotal: unassigned.length,
        openIncidents: 0,
        deficits,
        status: sectorStatus(coveragePct, deficits),
        lastUpdate: nowLabel,
        incidents: [],
        penalties: [],
        clientComplaints: [],
        dayShiftShorts,
        nightShiftShorts,
        continuationShifts: isLiveDay
          ? continuationShiftsForSm(unassigned, continuationShifts)
          : [],
      });
    }

    return {
      sectors,
      fieldIncidents,
      error: loadErrors.length > 0 ? loadErrors.join(' · ') : allocation.error,
    };
  } catch {
    return { ...EMPTY, error: 'Failed to load live field radar.' };
  }
}
