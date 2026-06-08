'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context';

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

async function fetchManagers(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('emp_number, full_name, site')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (getSmVisitCaps managers):', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchAssignedSites(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name, address, assigned_sm_epf')
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
  return data ?? [];
}

async function fetchVisitLogs(): Promise<SmVisitLogEntry[]> {
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

    return data.map((row) => ({
      smId: String(row.sm_epf),
      siteId: String(row.site_name ?? ''),
      date: String(row.created_at).slice(0, 10),
    }));
  } catch {
    return [];
  }
}

export async function getSmVisitCapsData(): Promise<SmVisitCapsPayload> {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);

    const [managers, sites, companyName, visitLogs] = await Promise.all([
      fetchWithRosterCompanyFallback(fetchManagers, sessionCompanyId),
      fetchWithRosterCompanyFallback(fetchAssignedSites, sessionCompanyId),
      fetchCompanyName(companyId),
      fetchVisitLogs(),
    ]);

    const siteNameToId = new Map<string, string>();
    for (const site of sites) {
      siteNameToId.set(String(site.site_name), String(site.id));
    }

    const siteFreqs: Record<string, SmVisitCapsSiteRow[]> = {};
    for (const manager of managers) {
      const smId = String(manager.emp_number);
      siteFreqs[smId] = [];
    }

    for (const site of sites) {
      const smId = String(site.assigned_sm_epf ?? '');
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

    const roster: SmVisitCapsProfile[] = managers.map((manager) => {
      const smId = String(manager.emp_number);
      const assignedCount = siteFreqs[smId]?.length ?? 0;
      const sector = manager.site?.trim()
        ? String(manager.site)
        : assignedCount > 0
          ? `${assignedCount} assigned site${assignedCount === 1 ? '' : 's'}`
          : '';
      return {
        smId,
        name: String(manager.full_name ?? manager.emp_number),
        empNo: smId,
        phone: '—',
        sector,
      };
    });

    const visitLogsNormalized = visitLogs.map((log) => ({
      ...log,
      siteId: siteNameToId.get(log.siteId) ?? log.siteId,
    }));

    return {
      roster,
      siteFreqs,
      visitLogs: visitLogsNormalized,
      error: !sessionCompanyId ? 'No company context for this session.' : undefined,
    };
  } catch {
    return { ...EMPTY, error: 'Failed to load sector managers and site assignments.' };
  }
}
