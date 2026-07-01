import type { SupabaseClient, User } from '@supabase/supabase-js';

import { resolveAuthUserCompanyId } from '../../../packages/supabase/auth-tenant-metadata';
import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { resolveCompanyIdForSession } from './company-context-server';
import {
  canAccessFrontOfficeAsExecutive,
  shalomEmployeeFromExecutiveProfile,
} from './front-office-executive-access';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';

export {
  SHALOM_FRONT_AUTH_EMAIL_DOMAIN,
  SHALOM_FRONT_EPF_MAX_LENGTH,
  SHALOM_FRONT_OTP_MAX_LENGTH,
  SHALOM_FRONT_PIN_LENGTH,
  SHALOM_PORTAL_OTP_LIFETIME_MS,
  isShalomEmployeeActive,
  isShalomFrontAuthEmail,
  isShalomStaff,
  normalizeShalomEpfNo,
  shalomEmployeeEpfKey,
  shalomFrontAuthEmail,
  shalomPortalLoginDateColombo,
  type ShalomEmployeeRow,
} from './shalom-front-auth-shared';

import {
  isShalomEmployeeActive,
  isShalomFrontAuthEmail,
  normalizeShalomEpfNo,
  shalomEmployeeEpfKey,
  type ShalomEmployeeRow,
} from './shalom-front-auth-shared';

const FULL_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_no, epf_num, status, group, rank, site, company_id';

const LEGACY_EMPLOYEE_SELECT =
  'id, full_name, emp_number, epf_num, status, group, rank, site, company_id';

function mapEmployeeRow(
  row: Record<string, unknown> | null,
): ShalomEmployeeRow | null {
  if (!row || typeof row.id !== 'string') return null;
  const epfNum = row.epf_num != null ? String(row.epf_num) : null;
  const epfNo = row.epf_no != null ? String(row.epf_no) : epfNum;
  return {
    id: row.id,
    full_name: (row.full_name as string | null) ?? null,
    emp_number: (row.emp_number as string | null) ?? null,
    epf_no: epfNo,
    epf_num: epfNum,
    status: (row.status as string | null) ?? null,
    group: (row.group as string | null) ?? null,
    rank: (row.rank as string | null) ?? null,
    site: (row.site as string | null) ?? null,
    company_id: row.company_id != null ? String(row.company_id) : null,
  };
}

function applyShalomEmployeeScope<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  companyId?: string | null,
): T {
  if (companyId) return query.eq('company_id', companyId);
  return query;
}

async function findShalomEmployeeByColumn(
  supabase: SupabaseClient,
  column: 'epf_no' | 'epf_num' | 'emp_number',
  value: string,
  companyId?: string | null,
): Promise<ShalomEmployeeRow | null> {
  let query = supabase.from('employees').select(FULL_EMPLOYEE_SELECT).eq(column, value);
  query = applyShalomEmployeeScope(query, companyId);
  const { data, error } = await query.maybeSingle();
  if (!error && data) {
    return mapEmployeeRow(data as Record<string, unknown>);
  }

  let legacyQuery = supabase.from('employees').select(LEGACY_EMPLOYEE_SELECT).eq(column, value);
  legacyQuery = applyShalomEmployeeScope(legacyQuery, companyId);
  const { data: legacy, error: legacyError } = await legacyQuery.maybeSingle();
  if (!legacyError && legacy) {
    return mapEmployeeRow(legacy as Record<string, unknown>);
  }

  return null;
}

/** Tenant-scoped MNR employee lookup by EPF (any group/rank). */
export async function findShalomEmployeeByEpf(
  supabase: SupabaseClient,
  epfInput: string,
  companyId?: string | null,
): Promise<ShalomEmployeeRow | null> {
  const key = normalizeShalomEpfNo(epfInput);
  if (!key) return null;

  const byNo = await findShalomEmployeeByColumn(supabase, 'epf_no', key, companyId);
  if (byNo) return byNo;

  const byNum = await findShalomEmployeeByColumn(supabase, 'epf_num', key, companyId);
  if (byNum) return byNum;

  const byEmp = await findShalomEmployeeByColumn(supabase, 'emp_number', key, companyId);
  if (byEmp) return byEmp;

  let ilikeNoQuery = supabase.from('employees').select(FULL_EMPLOYEE_SELECT).ilike('epf_no', key);
  ilikeNoQuery = applyShalomEmployeeScope(ilikeNoQuery, companyId);
  const { data: ilikeNo, error: ilikeNoErr } = await ilikeNoQuery;
  if (!ilikeNoErr && ilikeNo?.length === 1) {
    return mapEmployeeRow(ilikeNo[0] as Record<string, unknown>);
  }

  let ilikeNumQuery = supabase.from('employees').select(LEGACY_EMPLOYEE_SELECT).ilike('epf_num', key);
  ilikeNumQuery = applyShalomEmployeeScope(ilikeNumQuery, companyId);
  const { data: ilikeNum, error: ilikeNumErr } = await ilikeNumQuery;
  if (!ilikeNumErr && ilikeNum?.length === 1) {
    return mapEmployeeRow(ilikeNum[0] as Record<string, unknown>);
  }

  return null;
}

function isMissingShalomTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  return code === '42P01' || msg.includes('does not exist') || msg.includes('shalom_');
}

/** EPF numbers assigned to Shalom properties via the MD portfolio desk. */
export async function loadAssignedShalomCaretakerEpfs(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Set<string>> {
  const epfs = new Set<string>();

  const [propsResult, assignResult] = await Promise.all([
    supabase
      .from('shalom_properties')
      .select('caretaker_epf')
      .eq('company_id', companyId)
      .not('caretaker_epf', 'is', null),
    supabase
      .from('shalom_caretaker_property_assignments')
      .select('epf_number')
      .eq('company_id', companyId),
  ]);

  if (!propsResult.error || isMissingShalomTable(propsResult.error)) {
    for (const row of propsResult.data ?? []) {
      const epf = normalizeShalomEpfNo(String(row.caretaker_epf ?? ''));
      if (epf) epfs.add(epf);
    }
  }

  if (!assignResult.error || isMissingShalomTable(assignResult.error)) {
    for (const row of assignResult.data ?? []) {
      const epf = normalizeShalomEpfNo(String(row.epf_number ?? ''));
      if (epf) epfs.add(epf);
    }
  }

  return epfs;
}

export async function resolveShalomEmployeeForUser(
  user: User,
): Promise<ShalomEmployeeRow | null> {
  if (!user.email || !isShalomFrontAuthEmail(user.email)) return null;
  const localPart = user.email.split('@')[0]?.trim();
  if (!localPart) return null;

  const service = createSupabaseServiceClient();
  const companyId = resolveAuthUserCompanyId(user);
  const employee = await findShalomEmployeeByEpf(service, localPart, companyId);
  if (!employee || !isShalomEmployeeActive(employee)) {
    return null;
  }
  return employee;
}

export async function requireShalomSession(): Promise<{
  employee: ShalomEmployeeRow;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const employee = await resolveShalomEmployeeForUser(user);
  if (employee) return { employee };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canAccessFrontOfficeAsExecutive(profile)) return null;

  const companyId = await resolveCompanyIdForSession(supabase);
  return { employee: shalomEmployeeFromExecutiveProfile(profile, companyId) };
}

export async function getShalomPortalAuthRecord(
  supabase: SupabaseClient,
  epf: string,
): Promise<{
  needs_pin_setup: boolean;
  is_active: boolean;
  current_otp_hash: string | null;
  otp_expires_at: string | null;
} | null> {
  const key = normalizeShalomEpfNo(epf);
  if (!key) return null;

  const { data } = await supabase
    .from('shalom_portal_auth')
    .select('needs_pin_setup, is_active, current_otp_hash, otp_expires_at')
    .eq('epf_number', key)
    .maybeSingle();

  if (!data) return null;
  return {
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
    current_otp_hash:
      typeof data.current_otp_hash === 'string' ? data.current_otp_hash : null,
    otp_expires_at:
      typeof data.otp_expires_at === 'string' ? data.otp_expires_at : null,
  };
}

