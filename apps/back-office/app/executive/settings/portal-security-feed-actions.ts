'use server';

import { revalidatePath } from 'next/cache';

import {
  listRecentPortalSecurityNotifications,
  markPortalSecurityNotificationRead,
} from '../../../lib/head-office-portal-notifications';
import { listPortalLoginEventsForCompanyPaged } from '../../../lib/portal-login-events';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

async function assertExecutiveActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { error: 'Only MD or OD can view security feed.' };
  }

  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { error: portalGate.error };

  return { profile };
}

export async function listPortalSecurityNotificationsAction() {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const companyId = await resolveExecutiveCompanyId();
  const notifications = await listRecentPortalSecurityNotifications(companyId, 50);
  return { notifications };
}

export async function markPortalSecurityNotificationReadAction(
  notificationId: string,
) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  await markPortalSecurityNotificationRead(notificationId);
  revalidatePath('/executive/access');
  return { success: true as const };
}

export async function listCompanyPortalLoginEventsAction(page = 1, pageSize = 10) {
  const actor = await assertExecutiveActor();
  if ('error' in actor) return { error: actor.error };

  const companyId = await resolveExecutiveCompanyId();
  const payload = await listPortalLoginEventsForCompanyPaged(
    companyId,
    page,
    pageSize,
  );
  return payload;
}
