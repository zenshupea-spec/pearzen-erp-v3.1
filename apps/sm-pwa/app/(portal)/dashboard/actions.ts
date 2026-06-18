'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';
import { getCurrentSmEpf } from '../../../lib/sm-assignments';

export type TriRoleAck = { OM: boolean; SM: boolean; MD: boolean };

export type SmFieldIncident = {
  id: string;
  timestamp: string;
  site: string;
  incidentType: string;
  guardName: string;
  guardEmpNo: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: string;
  ack: TriRoleAck;
};

export type SmVisitLog = {
  id: string;
  site_name: string | null;
  created_at: string;
  notes: string | null;
};

function mapSeverity(sev: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (sev === 'CRITICAL' || sev === 'HIGH') return 'HIGH';
  if (sev === 'LOW') return 'LOW';
  return 'MEDIUM';
}

function rowToIncident(
  row: Record<string, unknown>,
  guardNames: Map<string, string>,
): SmFieldIncident {
  const guards = (row.guards_involved as string[] | null) ?? [];
  const empNo = guards[0] ?? '—';
  return {
    id: String(row.id),
    timestamp: String(row.created_at),
    site: String(row.site_name ?? 'Unknown site'),
    incidentType: String(row.incident_type),
    guardName: guardNames.get(empNo) ?? empNo,
    guardEmpNo: empNo,
    severity: mapSeverity(String(row.severity ?? 'MEDIUM')),
    status: String(row.status ?? 'OPEN'),
    ack: {
      OM: Boolean(row.ack_om),
      SM: Boolean(row.ack_sm),
      MD: Boolean(row.ack_md),
    },
  };
}

export async function getVisitsForDateAction(dateIso: string): Promise<SmVisitLog[]> {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');
  const dayStart = `${dateIso}T00:00:00`;
  const dayEnd = `${dateIso}T23:59:59.999`;

  const { data } = await supabase
    .from('sm_visit_logs')
    .select('id, site_name, created_at, notes')
    .eq('sm_epf', epf)
    .eq('visit_type', 'VISIT')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
    .order('created_at', { ascending: false });

  return (data ?? []) as SmVisitLog[];
}

export async function getIncidentsAction(): Promise<SmFieldIncident[]> {
  const supabase = await createSupabaseServerClient();
  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');

  const { data: assignedSites } = await supabase
    .from('site_profiles')
    .select('site_name')
    .eq('assigned_sm_epf', epf);

  const siteNames = (assignedSites ?? []).map((s: { site_name: string }) => s.site_name);

  const byEpf = await supabase
    .from('sm_incident_reports')
    .select('*')
    .eq('sm_epf', epf);

  const bySite =
    siteNames.length > 0
      ? await supabase.from('sm_incident_reports').select('*').in('site_name', siteNames)
      : { data: [] as Record<string, unknown>[] };

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byEpf.data ?? []), ...(bySite.data ?? [])]) {
    merged.set(String(row.id), row as Record<string, unknown>);
  }
  const rows = [...merged.values()].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  );
  if (!rows.length) return [];

  const allGuards = new Set<string>();
  for (const row of rows) {
    const g = (row.guards_involved as string[] | null) ?? [];
    if (g[0]) allGuards.add(g[0]);
  }

  const guardNames = new Map<string, string>();
  if (allGuards.size > 0) {
    const { data: employees } = await supabase
      .from('employees')
      .select('emp_number, full_name')
      .in('emp_number', [...allGuards]);
    for (const e of employees ?? []) {
      guardNames.set(e.emp_number, e.full_name ?? e.emp_number);
    }
  }

  return rows.map((row) => rowToIncident(row as Record<string, unknown>, guardNames));
}

export async function acknowledgeIncidentAction(id: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const epf = await getCurrentSmEpf();
  if (!epf) redirect('/login');

  const { error } = await supabase
    .from('sm_incident_reports')
    .update({ ack_sm: true })
    .eq('id', id);

  if (error) {
    console.error('[SM Dashboard] Ack error:', error.message);
    return { error: 'Failed to acknowledge incident.' };
  }
  return {};
}
