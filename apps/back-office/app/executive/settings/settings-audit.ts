'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { mergeSettingEnvelope } from '../../../../../packages/supabase/md-settings-envelope';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { getMdSettingsDb, resolveExecutiveCompanyId } from './lib/executive-md-settings-db';

export type SettingsAuditResult = { ok: true } | { ok: false; error: string };

export async function writeSettingsAuditLog(
  supabase: SupabaseClient,
  companyId: string,
  actionType: string,
  details: Record<string, unknown> = {},
  options?: { failClosed?: boolean },
): Promise<SettingsAuditResult> {
  const failClosed = options?.failClosed ?? true;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorEmail = user?.email || 'SYSTEM_ADMIN';

  // Service role — session client INSERT fails RLS when slug tenant != JWT company scope.
  const auditDb = getMdSettingsDb();
  const { error } = await auditDb.from('executive_audit_logs').insert({
    company_id: companyId,
    actor_email: actorEmail,
    action_type: actionType,
    entity: 'MD_SETTINGS',
    details,
  });

  if (error) {
    console.error('writeSettingsAuditLog:', error.message);
    if (failClosed) {
      return {
        ok: false,
        error: error.message || 'Settings were saved but the audit ledger could not be updated.',
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

export async function writeSettingsAuditLogForAction(
  actionType: string,
  details: Record<string, unknown> = {},
): Promise<SettingsAuditResult> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveExecutiveCompanyId();
  return writeSettingsAuditLog(supabase, companyId, actionType, details);
}

/** Persist envelope-only md_settings keys and require an audit row (fail-closed). */
export async function persistMdSettingEnvelopeWithAudit(
  supabase: SupabaseClient,
  companyId: string,
  patch: Record<string, unknown>,
  actionType: string,
  details: Record<string, unknown> = {},
  scalar?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const res = await mergeSettingEnvelope(supabase, companyId, patch, scalar);
  if (!res.success) return res;

  const session = await createSupabaseServerClient();
  const audit = await writeSettingsAuditLog(session, companyId, actionType, details);
  if (!audit.ok) {
    return { success: false, error: audit.error };
  }

  return { success: true };
}
