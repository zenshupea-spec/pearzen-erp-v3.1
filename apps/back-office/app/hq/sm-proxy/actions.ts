'use server';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { countActiveSectorManagersForCompany } from '../../../lib/sector-manager-roster';

export type SmVisitStreamRow = {
  id: string;
  smEpf: string;
  smName: string | null;
  siteName: string | null;
  visitTime: string;
  verificationStatus: string;
};

export type SmRosterStreamRow = {
  id: string;
  smEpf: string;
  smName: string | null;
  shiftDate: string;
  shiftType: string;
  siteName: string | null;
  status: string;
};

export type SmProxyDashboard = {
  activeSmCount: number;
  pendingRosters: number;
  pendingVisitVerifications: number;
  recentVisits: SmVisitStreamRow[];
  recentRosters: SmRosterStreamRow[];
};

const EMPTY_DASHBOARD: SmProxyDashboard = {
  activeSmCount: 0,
  pendingRosters: 0,
  pendingVisitVerifications: 0,
  recentVisits: [],
  recentRosters: [],
};

function getServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseServiceClient();
}

async function nameByEpf(
  service: ReturnType<typeof createSupabaseServiceClient>,
  epfs: string[],
): Promise<Map<string, string>> {
  if (!epfs.length) return new Map();

  const { data: employees } = await service
    .from('employees')
    .select('emp_number, full_name')
    .in('emp_number', epfs);

  return new Map(
    (employees ?? []).map((e) => [String(e.emp_number), String(e.full_name ?? e.emp_number)]),
  );
}

export async function getSmProxyDashboard(): Promise<SmProxyDashboard> {
  const service = getServiceClient();
  if (!service) return EMPTY_DASHBOARD;

  try {
    const [
      activeSmCount,
      { count: pendingRosters },
      { count: pendingVisitVerifications },
      { data: visits },
      { data: rosters },
    ] = await Promise.all([
      countActiveSectorManagersForCompany(service),
      service
        .from('sm_attendance_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'SUBMITTED'),
      service
        .from('sm_visit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('visit_type', 'VISIT')
        .eq('verification_status', 'PENDING'),
      service
        .from('sm_visit_logs')
        .select('id, sm_epf, site_name, verification_status, created_at')
        .eq('visit_type', 'VISIT')
        .order('created_at', { ascending: false })
        .limit(40),
      service
        .from('sm_attendance_submissions')
        .select('id, sm_epf, shift_date, shift_type, site_name, status')
        .order('shift_date', { ascending: false })
        .limit(40),
    ]);

    const visitEpfs = [...new Set((visits ?? []).map((v) => String(v.sm_epf)))];
    const rosterEpfs = [...new Set((rosters ?? []).map((r) => String(r.sm_epf)))];
    const names = await nameByEpf(service, [...new Set([...visitEpfs, ...rosterEpfs])]);

    return {
      activeSmCount: activeSmCount ?? 0,
      pendingRosters: pendingRosters ?? 0,
      pendingVisitVerifications: pendingVisitVerifications ?? 0,
      recentVisits: (visits ?? []).map((row) => ({
        id: String(row.id),
        smEpf: String(row.sm_epf),
        smName: names.get(String(row.sm_epf)) ?? null,
        siteName: (row.site_name as string | null) ?? null,
        visitTime: String(row.created_at),
        verificationStatus: String(row.verification_status ?? 'PENDING'),
      })),
      recentRosters: (rosters ?? []).map((row) => ({
        id: String(row.id),
        smEpf: String(row.sm_epf),
        smName: names.get(String(row.sm_epf)) ?? null,
        shiftDate: String(row.shift_date),
        shiftType: String(row.shift_type),
        siteName: (row.site_name as string | null) ?? null,
        status: String(row.status),
      })),
    };
  } catch {
    return EMPTY_DASHBOARD;
  }
}
