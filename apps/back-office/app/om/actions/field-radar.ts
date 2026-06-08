'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context';
import { getOmSiteAllocationData } from './allocation';

export type LiveShiftShort = {
  site: string;
  siteCode: string;
  missingCount: number;
  missingGuards?: string[];
};

export type LiveFieldSector = {
  id: string;
  name: string;
  region: string;
  sm: string;
  smPhone: string;
  guardsOnShift: number;
  guardsTotal: number;
  sitesToday: number;
  sitesTotal: number;
  openIncidents: number;
  deficits: number;
  status: 'NOMINAL' | 'ATTENTION' | 'CRITICAL';
  lastUpdate: string;
  incidents: never[];
  penalties: never[];
  clientComplaints: never[];
  dayShiftShorts: LiveShiftShort[];
  nightShiftShorts: LiveShiftShort[];
  continuationShifts: never[];
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
    | 'UNAUTHORIZED_ABSENCE';
  guardName: string;
  guardEmpNo: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  ack: { OM: boolean; SM: boolean; MD: boolean };
};

export type LiveFieldRadarPayload = {
  sectors: LiveFieldSector[];
  fieldIncidents: LiveFieldIncident[];
  error?: string;
};

const EMPTY: LiveFieldRadarPayload = { sectors: [], fieldIncidents: [] };

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

async function fetchSites(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name, assigned_sm_epf, required_guards, address')
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

async function fetchGuards(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, site, group, status')
    .in('group', [...GUARD_GROUPS])
    .ilike('status', 'active');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

async function fetchManagers(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, site')
    .eq('group', 'SECTOR_MANAGER')
    .ilike('status', 'active')
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

async function fetchOpenIncidents(): Promise<
  { id: string; sm_epf: string; site_name: string | null; severity: string; incident_type: string; description: string; created_at: string; guards_involved: string[] | null }[]
> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('sm_incident_reports')
      .select('id, sm_epf, site_name, severity, incident_type, description, created_at, guards_involved')
      .in('status', ['OPEN', 'UNDER_REVIEW', 'ESCALATED'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as typeof data;
  } catch {
    return [];
  }
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export async function getLiveFieldRadar(): Promise<LiveFieldRadarPayload> {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);

    const [allocation, sites, guards, managers, openIncidents] = await Promise.all([
      getOmSiteAllocationData(),
      fetchWithRosterCompanyFallback(fetchSites, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchGuards, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchManagers, sessionCompanyId),
      fetchOpenIncidents(),
    ]);

    const guardsBySite = new Map<string, { emp_number: string; full_name: string | null }[]>();
    for (const guard of guards) {
      const key = normalizeSiteKey(guard.site as string | null);
      if (!key) continue;
      const list = guardsBySite.get(key) ?? [];
      list.push({
        emp_number: String(guard.emp_number),
        full_name: guard.full_name as string | null,
      });
      guardsBySite.set(key, list);
    }

    const incidentsBySm = new Map<string, number>();
    const fieldIncidents: LiveFieldIncident[] = openIncidents.map((row) => {
      const smEpf = String(row.sm_epf);
      incidentsBySm.set(smEpf, (incidentsBySm.get(smEpf) ?? 0) + 1);
      const guardEpf = row.guards_involved?.[0] ?? smEpf;
      return {
        id: String(row.id),
        timestamp: String(row.created_at),
        site: String(row.site_name ?? 'Unknown site'),
        incidentType: mapIncidentType(String(row.incident_type)),
        guardName: guardEpf,
        guardEmpNo: guardEpf,
        severity: mapSeverity(String(row.severity)),
        ack: { OM: false, SM: false, MD: false },
      };
    });

    const sitesBySm = new Map<string, typeof sites>();
    for (const site of sites) {
      const smEpf = site.assigned_sm_epf ? String(site.assigned_sm_epf) : '__unassigned__';
      const list = sitesBySm.get(smEpf) ?? [];
      list.push(site);
      sitesBySm.set(smEpf, list);
    }

    const managerEpfs = new Set(managers.map((m) => String(m.emp_number)));
    for (const smEpf of sitesBySm.keys()) {
      if (smEpf !== '__unassigned__') managerEpfs.add(smEpf);
    }

    const nowLabel = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const sectors: LiveFieldSector[] = [];

    for (const smEpf of managerEpfs) {
      const manager = managers.find((m) => String(m.emp_number) === smEpf);
      const smSites = sitesBySm.get(smEpf) ?? [];
      if (!manager && smSites.length === 0) continue;

      let guardsOnShift = 0;
      let guardsTotal = 0;
      const dayShiftShorts: LiveShiftShort[] = [];

      for (const site of smSites) {
        const required = Math.max(1, Number(site.required_guards ?? 1));
        const deployed = (guardsBySite.get(normalizeSiteKey(String(site.site_name))) ?? []).length;
        guardsOnShift += deployed;
        guardsTotal += required;
        const gap = required - deployed;
        if (gap > 0) {
          dayShiftShorts.push({
            site: String(site.site_name),
            siteCode: String(site.id).slice(0, 8).toUpperCase(),
            missingCount: gap,
          });
        }
      }

      const deficits = dayShiftShorts.reduce((sum, row) => sum + row.missingCount, 0);
      const coveragePct =
        guardsTotal > 0 ? Math.round((guardsOnShift / guardsTotal) * 100) : 100;

      sectors.push({
        id: smEpf,
        name: manager?.site?.trim()
          ? String(manager.site)
          : manager
            ? `${manager.full_name ?? smEpf} sector`
            : 'Unassigned sites',
        region: manager?.site?.trim() ? 'Assigned sector' : 'Field operations',
        sm: String(manager?.full_name ?? smEpf),
        smPhone: '—',
        guardsOnShift,
        guardsTotal,
        sitesToday: smSites.length,
        sitesTotal: smSites.length,
        openIncidents: incidentsBySm.get(smEpf) ?? 0,
        deficits,
        status: sectorStatus(coveragePct, deficits),
        lastUpdate: nowLabel,
        incidents: [],
        penalties: [],
        clientComplaints: [],
        dayShiftShorts,
        nightShiftShorts: [],
        continuationShifts: [],
      });
    }

    if ((sitesBySm.get('__unassigned__') ?? []).length > 0) {
      const unassigned = sitesBySm.get('__unassigned__') ?? [];
      let guardsOnShift = 0;
      let guardsTotal = 0;
      const dayShiftShorts: LiveShiftShort[] = [];
      for (const site of unassigned) {
        const required = Math.max(1, Number(site.required_guards ?? 1));
        const deployed = (guardsBySite.get(normalizeSiteKey(String(site.site_name))) ?? []).length;
        guardsOnShift += deployed;
        guardsTotal += required;
        const gap = required - deployed;
        if (gap > 0) {
          dayShiftShorts.push({
            site: String(site.site_name),
            siteCode: String(site.id).slice(0, 8).toUpperCase(),
            missingCount: gap,
          });
        }
      }
      const deficits = dayShiftShorts.reduce((sum, row) => sum + row.missingCount, 0);
      const coveragePct =
        guardsTotal > 0 ? Math.round((guardsOnShift / guardsTotal) * 100) : 100;
      sectors.push({
        id: '__unassigned__',
        name: 'Pending SM assignment',
        region: 'Unassigned portfolio',
        sm: '—',
        smPhone: '—',
        guardsOnShift,
        guardsTotal,
        sitesToday: unassigned.length,
        sitesTotal: unassigned.length,
        openIncidents: 0,
        deficits,
        status: sectorStatus(coveragePct, deficits),
        lastUpdate: nowLabel,
        incidents: [],
        penalties: [],
        clientComplaints: [],
        dayShiftShorts,
        nightShiftShorts: [],
        continuationShifts: [],
      });
    }

    sectors.sort((a, b) => {
      const order = { CRITICAL: 0, ATTENTION: 1, NOMINAL: 2 };
      return order[a.status] - order[b.status];
    });

    return {
      sectors,
      fieldIncidents,
      error: allocation.error,
    };
  } catch {
    return { ...EMPTY, error: 'Failed to load live field radar.' };
  }
}
