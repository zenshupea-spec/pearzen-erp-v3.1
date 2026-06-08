import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffAuditPortal = 'fm' | 'hr' | 'hq' | 'om' | 'cafe';

type RecordStaffAuditInput = {
  supabase: SupabaseClient;
  companyId: string;
  profileId: string;
  portal: StaffAuditPortal;
  action: string;
  targetEntity?: string;
  actorName?: string;
  actorRole?: string;
  details?: Record<string, unknown>;
};

/** Append a staff-portal action to the immutable audit_logs ledger. */
export async function recordStaffAudit({
  supabase,
  companyId,
  profileId,
  portal,
  action,
  targetEntity,
  actorName,
  actorRole,
  details = {},
}: RecordStaffAuditInput) {
  const { error } = await supabase.from('audit_logs').insert({
    company_id: companyId,
    profile_id: profileId,
    portal,
    action,
    target_entity: targetEntity ?? null,
    actor_name: actorName ?? null,
    actor_role: actorRole ?? null,
    details,
  });

  if (error) {
    console.error('❌ staff audit insert failed:', error.message);
  }
}
