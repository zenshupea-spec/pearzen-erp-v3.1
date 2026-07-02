'use server';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { getDeductionMonthLockStatus } from '../app/hq/deductions/actions';
import { getSmProxyDashboard } from '../app/hq/sm-proxy/actions';
import { getAttendanceStream } from '../app/hq/guard-proxy/actions';
import { GUARD_FIELD_PORTAL_ROUTE, SM_PORTAL_ROUTE } from './master-hub-pillars';
import { CVS_GUARD_OPS_ENABLED } from './cvs-workforce-phase';
import { getOmSiteAllocationData } from '../app/om/actions/allocation';
import { getGuardVacanciesDesk } from '../app/hr/vacancies/actions';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
} from './company-context-server';

export type MasterHubBadges = Record<string, string | undefined>;

function vettingDaysLeft(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function isVettingExpiring(gramaNiladariExpiry: string | null): boolean {
  const gramaDays = vettingDaysLeft(gramaNiladariExpiry);
  return gramaDays !== null && gramaDays <= 45 && gramaDays >= 0;
}

async function countExpiringClearances(companyId: string | null): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select('grama_niladari_expiry, status')
    .ilike('status', 'active');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  return data.filter((row) =>
    isVettingExpiring((row.grama_niladari_expiry as string | null) ?? null),
  ).length;
}

export async function getMasterHubBadges(): Promise<MasterHubBadges> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);

  const [allocation, smProxy, attendance, deductionStatus, expiringClearances, vacancies] =
    await Promise.all([
      CVS_GUARD_OPS_ENABLED
        ? getOmSiteAllocationData()
        : Promise.resolve({ tacticalShorts: [] as { siteId: string }[] }),
      CVS_GUARD_OPS_ENABLED
        ? getSmProxyDashboard()
        : Promise.resolve({ pendingRosters: 0 }),
      CVS_GUARD_OPS_ENABLED ? getAttendanceStream(80) : Promise.resolve([]),
      getDeductionMonthLockStatus(),
      fetchWithRosterCompanyFallback(countExpiringClearances, companyId),
      CVS_GUARD_OPS_ENABLED
        ? getGuardVacanciesDesk()
        : Promise.resolve({ totalGuardsNeeded: 0 }),
    ]);

  const sitesShort = allocation.tacticalShorts.length;
  const missedScans = attendance.filter(
    (row) =>
      row.actionType === 'CHECK_IN' &&
      (!row.status || row.status === 'PENDING'),
  ).length;

  const badges: MasterHubBadges = {};

  if (CVS_GUARD_OPS_ENABLED && sitesShort > 0) {
    badges['/om'] = `${sitesShort} Site${sitesShort === 1 ? '' : 's'} Short`;
  }
  if (CVS_GUARD_OPS_ENABLED && smProxy.pendingRosters > 0) {
    badges[SM_PORTAL_ROUTE] = `${smProxy.pendingRosters} Roster${smProxy.pendingRosters === 1 ? '' : 's'} Pending`;
  }
  if (CVS_GUARD_OPS_ENABLED && missedScans > 0) {
    badges[GUARD_FIELD_PORTAL_ROUTE] = `${missedScans} Missed Scan${missedScans === 1 ? '' : 's'}`;
  }
  if (deductionStatus.draftEntryCount > 0) {
    badges['/hq/deductions'] = `${deductionStatus.draftEntryCount} Unapproved`;
  }
  if (expiringClearances > 0) {
    badges['/hr'] = `${expiringClearances} Expiring Clearance${expiringClearances === 1 ? '' : 's'}`;
  }
  if (CVS_GUARD_OPS_ENABLED && vacancies.totalGuardsNeeded > 0) {
    badges['/hr/vacancies'] = `${vacancies.totalGuardsNeeded} Guard${vacancies.totalGuardsNeeded === 1 ? '' : 's'} Needed`;
  }

  return badges;
}
