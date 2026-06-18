'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  CLASSIC_VENTURE_COMPANY_ID,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { employeeStoredEpfNo, resolveGuardRosterKey } from '../../../lib/employee-epf';
import { getOmServiceDb, normalizeSmEpf } from '../../../lib/om-service-db';
import { auditStaffAction } from '../../../lib/staff-audit';
import type { SectorManagerOption } from './sites';
import { getSectorManagersForAssignment } from './sites';

const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

export type SmGuardLinkStatus = 'linked' | 'unlinked' | 'mismatch';

export type OmSmGuardLinkRow = {
  guardId: string;
  guardEpf: string;
  guardName: string;
  rank: string;
  siteName: string | null;
  siteSmEpf: string | null;
  siteSmName: string | null;
  linkedSmEpf: string | null;
  linkedSmName: string | null;
  status: SmGuardLinkStatus;
};

export type OmSmGuardAssignmentPayload = {
  rows: OmSmGuardLinkRow[];
  managers: SectorManagerOption[];
  counts: {
    linked: number;
    unlinked: number;
    mismatch: number;
  };
};

type GuardRow = {
  id: string;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
  rank: string | null;
  site: string | null;
};

function guardEpfAliases(row: GuardRow): string[] {
  const keys = new Set<string>();
  const canonical = resolveGuardRosterKey(row);
  if (canonical) keys.add(canonical);
  const stored = employeeStoredEpfNo(row);
  if (stored) keys.add(stored.toUpperCase());
  if (row.emp_number) keys.add(String(row.emp_number).trim().toUpperCase());
  if (row.id) keys.add(String(row.id).trim().toUpperCase());
  return [...keys].filter(Boolean);
}

function linkedSmForGuard(
  guard: GuardRow,
  guardSmLinks: Map<string, string>,
): string | null {
  for (const alias of guardEpfAliases(guard)) {
    const linked = guardSmLinks.get(alias);
    if (linked) return linked;
  }
  return null;
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function smNameFromMap(smEpf: string | null, smNames: Map<string, string>): string | null {
  if (!smEpf) return null;
  return smNames.get(smEpf) ?? smEpf;
}

function resolveLinkStatus(
  linkedSmEpf: string | null,
  siteSmEpf: string | null,
): SmGuardLinkStatus {
  if (!linkedSmEpf) return 'unlinked';
  if (siteSmEpf && linkedSmEpf !== siteSmEpf) return 'mismatch';
  return 'linked';
}

async function fetchGuardRows(companyId: string | null): Promise<GuardRow[]> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, rank, site')
    .eq('status', 'ACTIVE')
    .in('group', [...GUARD_GROUPS])
    .order('full_name', { ascending: true });

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM sm-guard] employees:', error.message);
    return [];
  }

  const { decryptEmployeePiiRecord } = await import('../../../lib/employee-pii');
  return (data ?? []).map((row) => decryptEmployeePiiRecord(row)) as GuardRow[];
}

async function fetchSiteSmMap(
  companyId: string | null,
): Promise<Map<string, string>> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('site_profiles')
    .select('site_name, assigned_sm_epf')
    .neq('site_status', 'ARCHIVED');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM sm-guard] site_profiles:', error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const smEpf = normalizeSmEpf(row.assigned_sm_epf);
    if (!smEpf) continue;
    map.set(normalizeSiteKey(String(row.site_name)), smEpf);
  }
  return map;
}

async function fetchSmGuardLinks(): Promise<Map<string, string>> {
  const supabase = getOmServiceDb();
  const { data, error } = await supabase
    .from('sm_guard_assignments')
    .select('sm_epf, guard_epf');

  if (error) {
    console.error('[OM sm-guard] sm_guard_assignments:', error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const guardEpf = String(row.guard_epf).trim().toUpperCase();
    const smEpf = normalizeSmEpf(row.sm_epf);
    if (!guardEpf || !smEpf) continue;
    map.set(guardEpf, smEpf);
  }
  return map;
}

async function fetchSmNameMap(companyId: string | null): Promise<Map<string, string>> {
  const supabase = getOmServiceDb();
  let query = supabase
    .from('employees')
    .select('emp_number, epf_no, epf_num, full_name')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[OM sm-guard] sector managers:', error.message);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const name = String(row.full_name ?? row.emp_number);
    for (const key of [
      row.emp_number,
      row.epf_no,
      row.epf_num != null ? String(row.epf_num) : '',
    ]) {
      const normalized = String(key).trim().toUpperCase();
      if (normalized) map.set(normalized, name);
    }
  }
  return map;
}

async function buildSmGuardAssignmentPayload(
  companyId: string | null,
): Promise<Omit<OmSmGuardAssignmentPayload, 'managers'>> {
  const [guards, siteSmByKey, guardSmLinks, smNames] = await Promise.all([
    fetchGuardRows(companyId),
    fetchSiteSmMap(companyId),
    fetchSmGuardLinks(),
    fetchSmNameMap(companyId),
  ]);

  const rows: OmSmGuardLinkRow[] = guards.map((guard) => {
    const guardEpf = resolveGuardRosterKey(guard);
    const siteName = guard.site?.trim() || null;
    const siteSmEpf = siteName
      ? siteSmByKey.get(normalizeSiteKey(siteName)) ?? null
      : null;
    const linkedSmEpf = linkedSmForGuard(guard, guardSmLinks);

    return {
      guardId: guard.id,
      guardEpf,
      guardName: String(guard.full_name ?? (guardEpf || guard.id)),
      rank: String(guard.rank ?? 'JSO').trim().toUpperCase(),
      siteName,
      siteSmEpf,
      siteSmName: smNameFromMap(siteSmEpf, smNames),
      linkedSmEpf,
      linkedSmName: smNameFromMap(linkedSmEpf, smNames),
      status: resolveLinkStatus(linkedSmEpf, siteSmEpf),
    };
  });

  const counts = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { linked: 0, unlinked: 0, mismatch: 0 },
  );

  return { rows, counts };
}

async function buildSmGuardPayloadWithCompanyFallback(
  sessionCompanyId: string | null,
): Promise<Omit<OmSmGuardAssignmentPayload, 'managers'>> {
  const preferred = rosterCompanyId(sessionCompanyId);
  let payload = await buildSmGuardAssignmentPayload(preferred);
  if (!payload.rows.length && preferred !== CLASSIC_VENTURE_COMPANY_ID) {
    payload = await buildSmGuardAssignmentPayload(CLASSIC_VENTURE_COMPANY_ID);
  }
  if (!payload.rows.length) {
    payload = await buildSmGuardAssignmentPayload(null);
  }
  return payload;
}

export async function getOmSmGuardAssignmentData(): Promise<OmSmGuardAssignmentPayload> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);

  const [payload, managers] = await Promise.all([
    buildSmGuardPayloadWithCompanyFallback(sessionCompanyId),
    getSectorManagersForAssignment(),
  ]);

  return { ...payload, managers };
}

async function fetchActiveGuardRow(
  companyId: string | null,
  input: { guardEpf?: string; guardId?: string },
): Promise<GuardRow | null> {
  const db = getOmServiceDb();
  const { decryptEmployeePiiRecord } = await import('../../../lib/employee-pii');
  const guardEpf = input.guardEpf?.trim().toUpperCase() ?? '';
  const guardId = input.guardId?.trim() ?? '';

  if (guardId) {
    let query = db
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, full_name, rank, site')
      .eq('id', guardId)
      .eq('status', 'ACTIVE')
      .in('group', [...GUARD_GROUPS]);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return decryptEmployeePiiRecord(data) as GuardRow;
  }

  if (!guardEpf) return null;

  for (const column of ['emp_number', 'epf_no', 'epf_num', 'id'] as const) {
    let query = db
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, full_name, rank, site')
      .eq(column, column === 'id' ? guardEpf : guardEpf)
      .eq('status', 'ACTIVE')
      .in('group', [...GUARD_GROUPS]);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return decryptEmployeePiiRecord(data) as GuardRow;
  }

  return null;
}

async function resolveGuardEpfForWrite(
  companyId: string | null,
  input: { guardEpf?: string; guardId?: string },
): Promise<string | null> {
  const guard = await fetchActiveGuardRow(companyId, input);
  if (guard) {
    const key = resolveGuardRosterKey(guard);
    return key || null;
  }

  const direct = input.guardEpf?.trim().toUpperCase() ?? '';
  return direct || null;
}

async function findActiveSectorManager(
  companyId: string | null,
  smEpf: string,
): Promise<boolean> {
  const supabase = getOmServiceDb();
  const key = smEpf.trim();
  const columns = ['emp_number', 'epf_no', 'epf_num'] as const;

  for (const column of columns) {
    let query = supabase
      .from('employees')
      .select('id')
      .eq(column, key)
      .eq('group', 'SECTOR_MANAGER')
      .eq('status', 'ACTIVE');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data?.id) return true;
  }

  return false;
}

function revalidateSmGuardPaths() {
  revalidatePath('/om/guards/sm-assignments');
  revalidatePath('/om');
}

export async function assignGuardToSectorManager(input: {
  guardEpf?: string;
  guardId?: string;
  smEpf: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const smEpf = normalizeSmEpf(input.smEpf);
  if (!smEpf) return { success: false, error: 'Select a Sector Manager.' };

  try {
    const session = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(session);
    const guardEpf = await resolveGuardEpfForWrite(companyId, input);
    if (!guardEpf) {
      return {
        success: false,
        error: 'This guard has no EPF number in MNR — add an EPF No in HR before linking.',
      };
    }

    const supabase = getOmServiceDb();

    const smOk = await findActiveSectorManager(companyId, smEpf);
    if (!smOk) {
      return { success: false, error: `${smEpf} is not an active Sector Manager.` };
    }

    const guard = await fetchActiveGuardRow(companyId, input);
    const aliases = guard ? guardEpfAliases(guard) : [guardEpf];
    for (const alias of aliases) {
      for (const key of [alias, alias.toLowerCase()]) {
        const { error: clearError } = await supabase
          .from('sm_guard_assignments')
          .delete()
          .eq('guard_epf', key);
        if (clearError) throw clearError;
      }
    }

    const { error: upsertError } = await supabase.from('sm_guard_assignments').upsert(
      { sm_epf: smEpf, guard_epf: guardEpf },
      { onConflict: 'sm_epf,guard_epf' },
    );
    if (upsertError) throw upsertError;

    await auditStaffAction({
      supabase: session,
      portal: 'om',
      action: 'Assign Guard to Sector Manager',
      targetEntity: `${guardEpf} → ${smEpf}`,
    });

    revalidateSmGuardPaths();
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to assign guard to SM.';
    console.error('[OM sm-guard] assign:', message);
    return { success: false, error: message };
  }
}

export async function clearGuardSectorManagerLink(input: {
  guardEpf?: string;
  guardId?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await createSupabaseServerClient();
    const companyId = await resolveCompanyIdForSession(session);
    const key = await resolveGuardEpfForWrite(companyId, input);
    if (!key) {
      return {
        success: false,
        error: 'This guard has no EPF number in MNR — add an EPF No in HR before linking.',
      };
    }

    const supabase = getOmServiceDb();
    const guard = await fetchActiveGuardRow(companyId, input);
    const aliases = guard ? guardEpfAliases(guard) : [key];

    for (const alias of aliases) {
      for (const key of [alias, alias.toLowerCase()]) {
        const { error } = await supabase
          .from('sm_guard_assignments')
          .delete()
          .eq('guard_epf', key);
        if (error) throw error;
      }
    }
    await auditStaffAction({
      supabase: session,
      portal: 'om',
      action: 'Clear Guard SM Link',
      targetEntity: key,
    });

    revalidateSmGuardPaths();
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear guard SM link.';
    console.error('[OM sm-guard] clear:', message);
    return { success: false, error: message };
  }
}

export async function linkGuardSmFromSite(input: {
  guardEpf?: string;
  guardId?: string;
}): Promise<{ success: true; smEpf: string } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  const guard = await fetchActiveGuardRow(companyId, input);
  if (!guard) {
    return { success: false, error: 'Guard not found or has no site in MNR.' };
  }

  const site = guard.site?.trim() || null;
  if (!site) {
    return { success: false, error: 'Guard not found or has no site in MNR.' };
  }

  const siteSmMap = await fetchSiteSmMap(companyId);
  const smEpf = siteSmMap.get(normalizeSiteKey(site));
  if (!smEpf) {
    return {
      success: false,
      error: 'This guard’s site has no Sector Manager assigned yet.',
    };
  }

  const result = await assignGuardToSectorManager({
    guardEpf: resolveGuardRosterKey(guard),
    guardId: guard.id,
    smEpf,
  });
  if (!result.success) return result;
  return { success: true, smEpf };
}
