import 'server-only';

import { isSingletonHrAssignablePortalRank } from '../../../packages/rank-pay-matrix';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import {
  formatSingletonPortalRankOccupiedMessage,
  isActiveWorkforceStatus,
  occupiedSingletonRanksFromRecords,
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
  type SingletonPortalRankOccupant,
} from './singleton-portal-rank-guard-logic';

export {
  formatSingletonPortalRankOccupiedMessage,
  isActiveWorkforceStatus,
  occupiedSingletonRanksFromRecords,
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
  type SingletonPortalRankOccupant,
} from './singleton-portal-rank-guard-logic';

async function fetchSingletonPortalRankOccupants(
  companyId: string,
  excludeEmployeeId?: string | null,
): Promise<SingletonPortalRankOccupant[]> {
  const trimmedCompanyId = companyId?.trim();
  if (!trimmedCompanyId) return [];

  const supabase = createSupabaseServiceClient();
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id, rank, full_name, status')
    .eq('company_id', trimmedCompanyId);

  if (error) {
    console.error('fetchSingletonPortalRankOccupants employees:', error.message);
    return [];
  }

  const singletonEmployees = (employees ?? []).filter((row) =>
    isSingletonHrAssignablePortalRank(row.rank),
  );
  const activeIds = singletonEmployees
    .filter((row) => isActiveWorkforceStatus(row.status))
    .map((row) => row.id);

  if (activeIds.length === 0) return [];

  const { data: authRows, error: authError } = await supabase
    .from('head_office_portal_auth')
    .select('employee_id, work_email, is_active')
    .in('employee_id', activeIds)
    .eq('is_active', true);

  if (authError) {
    console.error('fetchSingletonPortalRankOccupants auth:', authError.message);
    return [];
  }

  const authByEmployeeId = new Map<
    string,
    { work_email: string; is_active: boolean }
  >();
  for (const row of authRows ?? []) {
    authByEmployeeId.set(row.employee_id, {
      work_email: row.work_email,
      is_active: row.is_active,
    });
  }

  return occupiedSingletonRanksFromRecords(
    singletonEmployees,
    authByEmployeeId,
    excludeEmployeeId,
  );
}

/** Rank codes (MD / OD / FM) with an active employee and provisioned portal work email. */
export async function getOccupiedSingletonPortalRanks(
  companyId: string,
): Promise<string[]> {
  const occupants = await fetchSingletonPortalRankOccupants(companyId);
  return occupants.map((occupant) => occupant.rankCode);
}

export async function assertSingletonPortalRankAvailable(
  rank: string | null | undefined,
  companyId: string,
  excludeEmployeeId?: string | null,
): Promise<void> {
  const rankCode = (rank || '').trim().toUpperCase();
  if (!isSingletonHrAssignablePortalRank(rankCode)) return;

  const occupants = await fetchSingletonPortalRankOccupants(
    companyId,
    excludeEmployeeId,
  );
  const blocking = occupants.find((occupant) => occupant.rankCode === rankCode);
  if (blocking) {
    throw new Error(formatSingletonPortalRankOccupiedMessage(blocking));
  }
}
