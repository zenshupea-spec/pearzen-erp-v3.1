'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS,
  loadPortalAfterHoursLoginAlertSettings,
  normalizePortalAfterHoursLoginAlertSettings,
  savePortalAfterHoursLoginAlertSettings,
  type PortalAfterHoursLoginAlertSettings,
} from '../../../lib/portal-after-hours-login-alerts';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';
import { writeSettingsAuditLogForAction } from './settings-audit';

export async function getPortalAfterHoursLoginAlertSettingsAction(): Promise<PortalAfterHoursLoginAlertSettings> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId(supabase);
  const settings = await loadPortalAfterHoursLoginAlertSettings(companyId);
  return settings;
}

export async function savePortalAfterHoursLoginAlertSettingsAction(
  input: PortalAfterHoursLoginAlertSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return {
      ok: false,
      error: 'Only MD or OD can change after-hours login alerts.',
    };
  }

  const normalized = normalizePortalAfterHoursLoginAlertSettings(input);
  if (
    normalized.startTime === normalized.endTime &&
    normalized.enabled
  ) {
    return {
      ok: false,
      error: 'Start and end times must differ when alerts are enabled.',
    };
  }

  const companyId = await resolveExecutiveCompanyId(supabase);
  const saved = await savePortalAfterHoursLoginAlertSettings(companyId, normalized);
  if (!saved.ok) return saved;

  const audit = await writeSettingsAuditLogForAction(
    'UPDATE_PORTAL_AFTER_HOURS_LOGIN_ALERTS',
    normalized,
  );
  if (!audit.ok) return { ok: false, error: audit.error };

  revalidatePath('/executive/access');
  revalidatePath('/executive/settings');
  return { ok: true };
}

export async function getPortalAfterHoursLoginAlertDefaultsAction(): Promise<PortalAfterHoursLoginAlertSettings> {
  return DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS;
}
