import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type PortalSecurityNotification = {
  id: string;
  eventType: string;
  message: string;
  subjectEmployeeId: string | null;
  targetEmployeeId: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function createPortalSecurityNotification(input: {
  companyId: string | null;
  subjectEmployeeId: string;
  targetEmployeeId?: string | null;
  eventType: string;
  message: string;
}): Promise<void> {
  const service = createSupabaseServiceClient();
  await service.from('portal_security_notifications').insert({
    company_id: input.companyId,
    subject_employee_id: input.subjectEmployeeId,
    target_employee_id: input.targetEmployeeId ?? null,
    event_type: input.eventType,
    message: input.message,
  });
}

export async function notifyExecutivesOfOtpProvision(input: {
  companyId: string | null;
  subjectEmployeeId: string;
  subjectName: string;
  subjectRank: string | null;
  provisionedByName: string;
  provisionedByRank: string | null;
  emailed?: boolean;
}): Promise<void> {
  const rank = input.subjectRank?.toUpperCase() ?? 'STAFF';
  const message = input.emailed
    ? `${input.provisionedByName} (${input.provisionedByRank ?? 'Staff'}) issued a new portal OTP for ${input.subjectName} (${rank}). Code was emailed to their work address. Previous password and 2FA were invalidated.`
    : `${input.provisionedByName} (${input.provisionedByRank ?? 'Staff'}) issued a new portal OTP for ${input.subjectName} (${rank}). Previous password and 2FA were invalidated.`;

  await createPortalSecurityNotification({
    companyId: input.companyId,
    subjectEmployeeId: input.subjectEmployeeId,
    eventType: 'otp_provisioned',
    message,
  });
}

export async function listUnreadPortalSecurityNotifications(
  companyId: string | null,
  limit = 50,
): Promise<PortalSecurityNotification[]> {
  const service = createSupabaseServiceClient();
  let query = service
    .from('portal_security_notifications')
    .select(
      'id, event_type, message, subject_employee_id, target_employee_id, created_at, read_at',
    )
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data } = await query;
  if (!data?.length) return [];

  return data.map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    message: String(row.message),
    subjectEmployeeId:
      typeof row.subject_employee_id === 'string' ? row.subject_employee_id : null,
    targetEmployeeId:
      typeof row.target_employee_id === 'string' ? row.target_employee_id : null,
    createdAt: String(row.created_at),
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
  }));
}

export async function listRecentPortalSecurityNotifications(
  companyId: string | null,
  limit = 50,
): Promise<PortalSecurityNotification[]> {
  const service = createSupabaseServiceClient();
  let query = service
    .from('portal_security_notifications')
    .select(
      'id, event_type, message, subject_employee_id, target_employee_id, created_at, read_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data } = await query;
  if (!data?.length) return [];

  return data.map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    message: String(row.message),
    subjectEmployeeId:
      typeof row.subject_employee_id === 'string' ? row.subject_employee_id : null,
    targetEmployeeId:
      typeof row.target_employee_id === 'string' ? row.target_employee_id : null,
    createdAt: String(row.created_at),
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
  }));
}

export async function markPortalSecurityNotificationRead(
  notificationId: string,
): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from('portal_security_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
}
