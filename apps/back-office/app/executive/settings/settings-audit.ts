'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

export async function writeSettingsAuditLog(
  supabase: SupabaseClient,
  companyId: string,
  actionType: string,
  details: Record<string, unknown> = {},
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorEmail = user?.email || 'SYSTEM_ADMIN';

  const { error } = await supabase.from('executive_audit_logs').insert({
    company_id: companyId,
    actor_email: actorEmail,
    action_type: actionType,
    entity: 'MD_SETTINGS',
    details,
  });

  if (error) {
    console.error('writeSettingsAuditLog:', error.message);
  }
}

export async function writeSettingsAuditLogForAction(
  actionType: string,
  details: Record<string, unknown> = {},
) {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId();
  await writeSettingsAuditLog(supabase, companyId, actionType, details);
}
