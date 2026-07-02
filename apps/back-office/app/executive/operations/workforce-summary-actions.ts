'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from '../../../lib/company-context-server';
import { normalizeEpfNo } from '../../../lib/employee-epf';

export type InternalWorkforceMember = {
  id: string;
  fullName: string;
  rank: string | null;
  epf: string | null;
  site: string | null;
};

export type InternalWorkforceSummary = {
  headOfficeCount: number;
  headOfficeStaff: InternalWorkforceMember[];
  cafeCount: number;
  cafeStaff: InternalWorkforceMember[];
  lastSynced: string;
  error?: string;
};

const TERMINATED_STATUSES = new Set(['RESIGNED', 'TERMINATED']);

function isActiveWorkforceStatus(status: unknown): boolean {
  const normalized = String(status ?? 'ACTIVE').trim().toUpperCase();
  return normalized.length > 0 && !TERMINATED_STATUSES.has(normalized);
}

function memberEpf(row: {
  epf_no?: unknown;
  epf_num?: unknown;
}): string | null {
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  const normalized = normalizeEpfNo(epf);
  return normalized || null;
}

function mapMember(row: {
  id: unknown;
  full_name?: unknown;
  rank?: unknown;
  epf_no?: unknown;
  epf_num?: unknown;
  site?: unknown;
}): InternalWorkforceMember {
  return {
    id: String(row.id),
    fullName:
      typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : 'Unnamed staff',
    rank:
      typeof row.rank === 'string' && row.rank.trim()
        ? row.rank.trim().toUpperCase()
        : null,
    epf: memberEpf(row),
    site:
      typeof row.site === 'string' && row.site.trim() ? row.site.trim() : null,
  };
}

async function fetchInternalWorkforceRows(companyId: string | null) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('id, full_name, rank, epf_no, epf_num, site, group, status')
    .in('group', ['HEAD_OFFICE', 'CAFE'])
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter((row) => isActiveWorkforceStatus(row.status));
}

export async function getInternalWorkforceSummary(): Promise<InternalWorkforceSummary> {
  const lastSynced = new Date().toISOString();

  try {
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const rows = await fetchWithRosterCompanyFallback(
      fetchInternalWorkforceRows,
      sessionCompanyId,
    );

    const headOfficeStaff = rows
      .filter((row) => String(row.group ?? '').trim().toUpperCase() === 'HEAD_OFFICE')
      .map(mapMember);
    const cafeStaff = rows
      .filter((row) => String(row.group ?? '').trim().toUpperCase() === 'CAFE')
      .map(mapMember);

    return {
      headOfficeCount: headOfficeStaff.length,
      headOfficeStaff,
      cafeCount: cafeStaff.length,
      cafeStaff,
      lastSynced,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load internal workforce.';
    console.error('[operations] getInternalWorkforceSummary:', message);
    return {
      headOfficeCount: 0,
      headOfficeStaff: [],
      cafeCount: 0,
      cafeStaff: [],
      lastSynced,
      error: 'Could not load Head Office and café staff counts.',
    };
  }
}
