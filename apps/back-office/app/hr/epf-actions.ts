'use server';

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  assertEpfNoUnique,
  employeeStoredEpfNo,
  normalizeEpfNo,
} from '../../lib/employee-epf';
import { decryptEmployeePiiRecord } from '../../lib/employee-pii';
import {
  isNicLookupReady,
  nicRecordsMatch,
  normalizeNic,
} from '../../lib/employee-nic';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { getGuardRatingMapByEmployeeId } from '../om/guard-cards/actions';

export type PriorEmployeeMatch = {
  id: string;
  fullName: string;
  epfNo: string;
  previousEpfNo: string | null;
  status: string;
  rank: string | null;
  group: string | null;
  dateJoined: string | null;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  guardRating: number | null;
  guardTier: string | null;
};

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);
  return { supabase, profile };
}

const EMPLOYEE_NIC_LOOKUP_SELECT =
  'id, full_name, nic, epf_no, epf_num, previous_epf_no, status, rank, group, date_joined, company_id';

const EMPLOYEE_NIC_LOOKUP_SELECT_LEGACY =
  'id, full_name, nic, epf_no, epf_num, status, rank, group, date_joined, company_id';

function isMissingPreviousEpfColumnError(message: string): boolean {
  return /previous_epf_no/i.test(message) && /does not exist|column/i.test(message);
}

async function fetchCompanyEmployeeRows(companyId: string | null) {
  const db = createSupabaseServiceClient();
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  let selectColumns = EMPLOYEE_NIC_LOOKUP_SELECT;

  for (let from = 0; ; from += pageSize) {
    let query = db
      .from('employees')
      .select(selectColumns)
      .order('date_joined', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    const { data, error } = await query;
    if (error) {
      if (
        from === 0 &&
        selectColumns === EMPLOYEE_NIC_LOOKUP_SELECT &&
        isMissingPreviousEpfColumnError(error.message)
      ) {
        selectColumns = EMPLOYEE_NIC_LOOKUP_SELECT_LEGACY;
        from = 0;
        all.length = 0;
        continue;
      }
      throw new Error(error.message);
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export async function lookupPriorRecordsByNic(
  nicInput: string,
  excludeEmployeeId?: string,
): Promise<{ matches: PriorEmployeeMatch[] }> {
  const normNic = normalizeNic(nicInput);
  if (!isNicLookupReady(normNic)) {
    return { matches: [] };
  }

  const { supabase } = await requireHrEditor();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) {
    return { matches: [] };
  }

  const rows = await fetchWithRosterCompanyFallback(
    fetchCompanyEmployeeRows,
    sessionCompanyId,
  );

  const matched = rows
    .filter((row) => {
      if (excludeEmployeeId && String(row.id) === excludeEmployeeId) return false;
      const decrypted = decryptEmployeePiiRecord(row);
      return nicRecordsMatch(decrypted.nic, normNic);
    })
    .map((row) => decryptEmployeePiiRecord(row));

  if (!matched.length) {
    return { matches: [] };
  }

  const db = createSupabaseServiceClient();
  const employeeIds = matched.map((row) => String(row.id));

  const [{ data: blacklistRows }, guardRatingByEmployeeId] = await Promise.all([
    db
      .from('guard_blacklist_vault')
      .select('employee_id, reason')
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE')
      .in('employee_id', employeeIds),
    getGuardRatingMapByEmployeeId(employeeIds),
  ]);

  const blacklistById: Record<string, string> = {};
  for (const row of blacklistRows ?? []) {
    blacklistById[String(row.employee_id)] = String(row.reason ?? '');
  }

  const matches: PriorEmployeeMatch[] = matched.map((row) => {
    const id = String(row.id);
    const epfNo = normalizeEpfNo(employeeStoredEpfNo(row));
    const rating = guardRatingByEmployeeId[id];
    return {
      id,
      fullName: String(row.full_name ?? ''),
      epfNo,
      previousEpfNo:
        row.previous_epf_no != null && String(row.previous_epf_no).trim()
          ? String(row.previous_epf_no).trim()
          : null,
      status: String(row.status ?? ''),
      rank: row.rank != null ? String(row.rank) : null,
      group: row.group != null ? String(row.group) : null,
      dateJoined: row.date_joined != null ? String(row.date_joined) : null,
      isBlacklisted: id in blacklistById,
      blacklistReason: blacklistById[id] ?? null,
      guardRating: rating?.rating ?? null,
      guardTier: rating?.tier ?? null,
    };
  });

  return { matches };
}

export async function checkEpfNoAvailable(
  epfInput: string,
  excludeEmployeeId?: string,
): Promise<{ available: boolean; usedBy?: string }> {
  const norm = normalizeEpfNo(epfInput);
  if (!norm) {
    return { available: true };
  }

  const { supabase } = await requireHrEditor();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);

  try {
    await assertEpfNoUnique(supabase, epfInput, {
      excludeEmployeeId,
      companyId,
    });
    return { available: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'EPF number is already in use.';
    const usedBy = message.match(/^EPF number is already in use by (.+)\./)?.[1];
    return { available: false, usedBy };
  }
}
