'use server';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { getDeductionMonthLockStatus } from '../app/hq/deductions/actions';
import { getSmProxyDashboard } from '../app/hq/sm-proxy/actions';
import { getAttendanceStream } from '../app/hq/guard-proxy/actions';
import { GUARD_FIELD_PORTAL_ROUTE } from './master-hub-pillars';
import { getOmSiteAllocationData } from '../app/om/actions/allocation';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from './company-context';

export type MasterHubBadges = Record<string, string | undefined>;

function vettingDaysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function isVettingExpiring(modExpiry: string | null, policeExpiry: string | null): boolean {
  const modDays = vettingDaysLeft(modExpiry);
  const polDays = vettingDaysLeft(policeExpiry);
  return (
    (modDays !== null && modDays <= 45 && modDays >= 0) ||
    (polDays !== null && polDays <= 45 && polDays >= 0)
  );
}

async function countExpiringClearances(companyId: string | null): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('mod_expiry, police_expiry, status')
    .ilike('status', 'active');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  return data.filter((row) =>
    isVettingExpiring(
      (row.mod_expiry as string | null) ?? null,
      (row.police_expiry as string | null) ?? null,
    ),
  ).length;
}

export async function getMasterHubBadges(): Promise<MasterHubBadges> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  const [allocation, smProxy, attendance, deductionStatus, expiringClearances] =
    await Promise.all([
      getOmSiteAllocationData(),
      getSmProxyDashboard(),
      getAttendanceStream(80),
      getDeductionMonthLockStatus(),
      fetchWithRosterCompanyFallback(countExpiringClearances, companyId),
    ]);

  const sitesShort = allocation.tacticalShorts.length;
  const missedScans = attendance.filter(
    (row) =>
      row.actionType === 'CHECK_IN' &&
      (!row.status || row.status === 'PENDING'),
  ).length;

  const badges: MasterHubBadges = {};

  if (sitesShort > 0) {
    badges['/om'] = `${sitesShort} Site${sitesShort === 1 ? '' : 's'} Short`;
  }
  if (smProxy.pendingRosters > 0) {
    badges['/hq/sm-proxy'] = `${smProxy.pendingRosters} Roster${smProxy.pendingRosters === 1 ? '' : 's'} Pending`;
  }
  if (missedScans > 0) {
    badges[GUARD_FIELD_PORTAL_ROUTE] = `${missedScans} Missed Scan${missedScans === 1 ? '' : 's'}`;
  }
  if (deductionStatus.draftEntryCount > 0) {
    badges['/hq/deductions'] = `${deductionStatus.draftEntryCount} Unapproved`;
  }
  if (expiringClearances > 0) {
    badges['/hr'] = `${expiringClearances} Expiring Clearance${expiringClearances === 1 ? '' : 's'}`;
  }

  return badges;
}
