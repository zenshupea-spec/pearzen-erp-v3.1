import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { resolveCompanyIdForSession } from './company-context-server';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';

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
  | 'cafe-front';

export type StaffAuditContext = {
  companyId: string;
  profileId: string | null;
  actorName: string;
  actorRole: string;
  ipAddress: string | null;
};

type RecordStaffAuditInput = {
  companyId: string;
  profileId: string | null;
  portal: StaffAuditPortal;
  action: string;
  targetEntity?: string;
  actorName?: string;
  actorRole?: string;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
};

/** Resolve signed-in actor + tenant for audit ledger writes. */
export async function resolveStaffAuditContext(
  supabase: SupabaseClient,
): Promise<StaffAuditContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return null;

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const actorName =
    profile.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email ||
    'Staff';
  const actorRole = profile.role || 'Staff';

  let ipAddress: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      null;
  } catch {
    // headers() unavailable outside a request
  }

  return {
    companyId,
    profileId: null,
    actorName,
    actorRole,
    ipAddress,
  };
}

/** Append a staff-portal action to the immutable audit_logs ledger. */
export async function recordStaffAudit({
  companyId,
  profileId,
  portal,
  action,
  targetEntity,
  actorName,
  actorRole,
  ipAddress = null,
  details = {},
}: RecordStaffAuditInput) {
  const db = createSupabaseServiceClient();
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
    console.error('❌ staff audit insert failed:', error.message);
  }
}

type AuditStaffActionInput = {
  portal: StaffAuditPortal;
  action: string;
  targetEntity?: string;
  details?: Record<string, unknown>;
  supabase?: SupabaseClient;
} & Partial<StaffAuditContext>;

/** Resolve session context (when omitted) and append one audit ledger row. */
export async function auditStaffAction(input: AuditStaffActionInput) {
  let ctx: StaffAuditContext | null = null;

  if (input.companyId && input.actorName) {
    ctx = {
      companyId: input.companyId,
      profileId: input.profileId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole ?? 'Staff',
      ipAddress: input.ipAddress ?? null,
    };
  } else {
    const supabase = input.supabase ?? (await createSupabaseServerClient());
    ctx = await resolveStaffAuditContext(supabase);
  }

  if (!ctx) return;

  await recordStaffAudit({
    ...ctx,
    portal: input.portal,
    action: input.action,
    targetEntity: input.targetEntity,
    details: input.details,
  });
}
