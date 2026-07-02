'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  getOmServiceDb,
} from '../../../lib/om-service-db';
import { fetchActiveSectorManagerRecordsForCompany } from '../../../lib/sector-manager-roster';
import { normalizeSmEpf, sectorManagerEpfKey } from '../../../../../packages/supabase/sm-epf';
import {
  filterSectorManagersForOmScope,
  filterSitesForOmScope,
  omScopeIncludesSmEpf,
  resolveOmSectorScopeForSession,
} from '../../../lib/om-sector-scope';

export type SmVisitCapsProfile = {
  smId: string;
  name: string;
  empNo: string;
  phone: string;
  sector: string;
};

export type SmVisitCapsSiteRow = {
  siteId: string;
  siteName: string;
  client: string;
  location: string;
  dailyCap: number;
  weeklyCap: number;
  monthlyTarget: number;
};

export type SmVisitLogEntry = {
  siteId: string;
  smId: string;
  date: string;
};

export type SmVisitCapsPayload = {
  roster: SmVisitCapsProfile[];
  siteFreqs: Record<string, SmVisitCapsSiteRow[]>;
  visitLogs: SmVisitLogEntry[];
  error?: string;
};

type SmManagerRow = {
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
  site: string | null;
};

type AssignedSiteRow = {
  id: string;
  site_name: string;
  address: string | null;
  assigned_sm_epf: string | null;
};

const EMPTY: SmVisitCapsPayload = {
  roster: [],
  siteFreqs: {},
  visitLogs: [],
};

async function fetchCompanyName(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}

function clientLabel(siteName: string, companyName: string | null): string {
  if (companyName?.trim()) return companyName.trim();
  const parts = siteName.split(/\s*[—–-]\s+/);
  return (parts[0] ?? siteName).trim();
}

function buildSmAliasMap(managers: SmManagerRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const manager of managers) {
    const canonical = sectorManagerEpfKey(manager);
    if (!canonical) continue;
    for (const key of [manager.emp_number, manager.epf_no, manager.epf_num]) {
      const normalized = normalizeSmEpf(key);
      if (normalized) map.set(normalized, canonical);
    }
  }
  return map;
}

async function fetchManagers(companyId: string | null): Promise<SmManagerRow[]> {
  const supabase = getOmServiceDb();
  return fetchActiveSectorManagerRecordsForCompany(
    supabase,
    companyId,
    'emp_number, epf_no, epf_num, full_name, site',
  ) as Promise<SmManagerRow[]>;
}

async function fetchAssignedSites(companyId: string | null): Promise<AssignedSiteRow[]> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name, address, assigned_sm_epf')
    .neq('site_status', 'ARCHIVED')
    .not('assigned_sm_epf', 'is', null)
    .order('site_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (getSmVisitCaps sites):', error.message);
    return [];
  }
  return (data ?? []) as AssignedSiteRow[];
}

async function fetchVisitLogs(smAliasMap: Map<string, string>): Promise<SmVisitLogEntry[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('sm_visit_logs')
      .select('sm_epf, site_name, created_at')
      .eq('visit_type', 'VISIT')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data?.length) return [];

    return data.map((row) => {
      const rawSm = normalizeSmEpf(row.sm_epf) ?? String(row.sm_epf ?? '');
      return {
        smId: smAliasMap.get(rawSm) ?? rawSm,
        siteId: String(row.site_name ?? ''),
        date: String(row.created_at).slice(0, 10),
      };
    });
  } catch {
    return [];
  }
}

export async function getSmVisitCapsData(): Promise<SmVisitCapsPayload> {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);

    const [managers, sites, companyName, omScope] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchManagers, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchAssignedSites, sessionCompanyId),
      fetchCompanyName(companyId),
      resolveOmSectorScopeForSession(),
    ]);

    const scopedManagers = filterSectorManagersForOmScope(
      managers
        .map((manager) => {
          const smId = sectorManagerEpfKey(manager);
          if (!smId) return null;
          return {
            smId,
            manager,
          };
        })
        .filter((row): row is { smId: string; manager: SmManagerRow } => row !== null)
        .map((row) => ({
          emp_number: row.smId,
          full_name: row.manager.full_name,
          site: row.manager.site,
        })),
      omScope,
    );

    const scopedManagerRows = managers.filter((manager) => {
      const smId = sectorManagerEpfKey(manager);
      return smId && scopedManagers.some((entry) => entry.emp_number === smId);
    });

    const scopedSites = filterSitesForOmScope(sites, omScope);

    const smAliasMap = buildSmAliasMap(scopedManagerRows);
    const visitLogs = await fetchVisitLogs(smAliasMap);

    const siteNameToId = new Map<string, string>();
    for (const site of scopedSites) {
      siteNameToId.set(String(site.site_name), String(site.id));
    }

    const siteFreqs: Record<string, SmVisitCapsSiteRow[]> = {};
    for (const manager of scopedManagerRows) {
      const smId = sectorManagerEpfKey(manager);
      if (!smId) continue;
      siteFreqs[smId] = [];
    }

    for (const site of scopedSites) {
      const smId = normalizeSmEpf(site.assigned_sm_epf);
      if (!smId || !siteFreqs[smId]) continue;
      const siteName = String(site.site_name);
      siteFreqs[smId].push({
        siteId: String(site.id),
        siteName,
        client: clientLabel(siteName, companyName),
        location: site.address?.trim() || 'Address not on file',
        dailyCap: 1,
        weeklyCap: 1,
        monthlyTarget: 2,
      });
    }

    const roster: SmVisitCapsProfile[] = scopedManagerRows
      .map((manager) => {
        const smId = sectorManagerEpfKey(manager);
        if (!smId) return null;
        const assignedCount = siteFreqs[smId]?.length ?? 0;
        const sector = manager.site?.trim()
          ? String(manager.site)
          : assignedCount > 0
            ? `${assignedCount} assigned site${assignedCount === 1 ? '' : 's'}`
            : '';
        return {
          smId,
          name: String(manager.full_name ?? smId),
          empNo: smId,
          phone: '—',
          sector,
        };
      })
      .filter((row): row is SmVisitCapsProfile => row !== null);

    const visitLogsNormalized = visitLogs
      .filter((log) => omScope === null || omScopeIncludesSmEpf(omScope, log.smId))
      .map((log) => ({
      ...log,
      siteId: siteNameToId.get(log.siteId) ?? log.siteId,
    }));

    return {
      roster,
      siteFreqs,
      visitLogs: visitLogsNormalized,
      error: !sessionCompanyId ? 'No company context for this session.' : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ getSmVisitCapsData:', message);
    return { ...EMPTY, error: 'Failed to load sector managers and site assignments.' };
  }
}
