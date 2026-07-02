import type { SupabaseClient } from '@supabase/supabase-js';

export type ForgeAuditLogInput = {
  actorEmail: string;
  actionType: string;
  targetCompanyId?: string | null;
  details?: Record<string, unknown>;
};

/** Append one row to forge_audit_log (service role). Non-blocking on failure. */
export async function writeForgeAuditLog(
  input: ForgeAuditLogInput,
  db: SupabaseClient,
): Promise<void> {
  const actorEmail = input.actorEmail.trim().toLowerCase();
  if (!actorEmail) return;

  const { error } = await db.from('forge_audit_log').insert({
    actor_email: actorEmail,
    action_type: input.actionType,
    target_company_id: input.targetCompanyId ?? null,
    details: input.details ?? {},
  });

  if (error) {
    console.error('writeForgeAuditLog:', error.message);
  }
}
