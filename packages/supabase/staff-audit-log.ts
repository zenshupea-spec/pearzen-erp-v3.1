import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServiceClient } from './service';

export type StaffAuditPortal =
  | 'fm'
  | 'hr'
  | 'hq'
  | 'om'
  | 'tm'
  | 'sm'
  | 'field'
  | 'guard'
  | 'checkin'
  | 'invoice'
  | 'cafe'
  | 'cafe-front'
  | 'shalom-front';

export type RecordStaffAuditLogInput = {
  companyId: string;
  profileId?: string | null;
  portal: StaffAuditPortal;
  action: string;
  targetEntity?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
  supabase?: SupabaseClient;
};

/** Append one row to the tenant-scoped audit_logs ledger (service role). */
export async function recordStaffAuditLog({
  companyId,
  profileId = null,
  portal,
  action,
  targetEntity,
  actorName,
  actorRole,
  ipAddress = null,
  details = {},
  supabase,
}: RecordStaffAuditLogInput): Promise<void> {
  const db = supabase ?? createSupabaseServiceClient();
  const { error } = await db.from('audit_logs').insert({
    company_id: companyId,
    profile_id: profileId,
    portal,
    action,
    target_entity: targetEntity ?? null,
    actor_name: actorName ?? null,
    actor_role: actorRole ?? null,
    ip_address: ipAddress,
    details,
  });

  if (error) {
    console.error('recordStaffAuditLog:', error.message);
  }
}
