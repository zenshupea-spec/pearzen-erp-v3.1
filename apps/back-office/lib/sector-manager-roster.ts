import type { SupabaseClient } from '@supabase/supabase-js';

import { sectorManagerEpfKey } from '../../../packages/supabase/sm-epf';
import { isSectorManagerEmployee } from './hr-sectors';

/** PostgREST `.or()` filter — legacy SECTOR_MANAGER group or Head Office + SM rank. */
export const SECTOR_MANAGER_EMPLOYEE_OR_FILTER =
  'group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)';

export function sectorManagerEmployeeOrFilter(): string {
  return SECTOR_MANAGER_EMPLOYEE_OR_FILTER;
}

const SECTOR_MANAGER_SELECT =
  'id, emp_number, epf_no, epf_num, full_name, rank, status, group, site, company_id';

export type SectorManagerRosterRow = {
  epf_number: string;
  full_name: string;
  site: string;
};

export type SectorManagerEmployeeRecord = {
  id?: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
  full_name?: string | null;
  rank?: string | null;
  status?: string | null;
  group?: string | null;
  site?: string | null;
  company_id?: string | null;
};

export function mapSectorManagerRosterRow(
  row: SectorManagerEmployeeRecord,
): SectorManagerRosterRow | null {
  if (!isSectorManagerEmployee(row)) return null;
  const epf = sectorManagerEpfKey(row);
  if (!epf) return null;
  const site = row.site != null ? String(row.site).trim() : '';
  return {
    epf_number: epf,
    full_name: String(row.full_name ?? epf).trim() || epf,
    site: site || '—',
  };
}

export async function fetchActiveSectorManagerRecordsForCompany(
  supabase: SupabaseClient,
  companyId?: string | null,
  select: string = SECTOR_MANAGER_SELECT,
): Promise<SectorManagerEmployeeRecord[]> {
  let query = supabase
    .from('employees')
    .select(select)
    .eq('status', 'ACTIVE')
    .or(sectorManagerEmployeeOrFilter())
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[sector-manager-roster] fetch failed:', error.message);
    return [];
  }

  return (data ?? []).filter((row) =>
    isSectorManagerEmployee(row as SectorManagerEmployeeRecord),
  ) as SectorManagerEmployeeRecord[];
}

export async function fetchActiveSectorManagersForCompany(
  supabase: SupabaseClient,
  companyId?: string | null,
): Promise<SectorManagerRosterRow[]> {
  const records = await fetchActiveSectorManagerRecordsForCompany(
    supabase,
    companyId,
    SECTOR_MANAGER_SELECT,
  );
  return records
    .map((row) => mapSectorManagerRosterRow(row))
    .filter((row): row is SectorManagerRosterRow => row != null);
}

export async function findActiveSectorManagerByEpf(
  supabase: SupabaseClient,
  epfInput: string,
  companyId?: string | null,
  select: string = SECTOR_MANAGER_SELECT,
): Promise<SectorManagerEmployeeRecord | null> {
  const key = epfInput.trim();
  if (!key) return null;

  for (const column of ['emp_number', 'epf_no', 'epf_num'] as const) {
    let query = supabase
      .from('employees')
      .select(select)
      .eq(column, key)
      .eq('status', 'ACTIVE')
      .or(sectorManagerEmployeeOrFilter());

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data && isSectorManagerEmployee(data as SectorManagerEmployeeRecord)) {
      return data as SectorManagerEmployeeRecord;
    }
  }

  return null;
}

export async function countActiveSectorManagersForCompany(
  supabase: SupabaseClient,
  companyId?: string | null,
): Promise<number> {
  let query = supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')
    .or(sectorManagerEmployeeOrFilter());

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { count, error } = await query;
  if (error) {
    console.error('[sector-manager-roster] count failed:', error.message);
    return 0;
  }
  return count ?? 0;
}
