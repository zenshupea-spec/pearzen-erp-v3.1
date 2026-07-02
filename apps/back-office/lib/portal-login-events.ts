import { createSupabaseServiceClient } from '../../../packages/supabase/service';

export type PortalLoginEventType =
  | 'password_login_success'
  | 'password_login_failure'
  | 'totp_success'
  | 'totp_failure'
  | 'google_login_success'
  | 'unlock_code_success'
  | 'unlock_code_failure'
  | 'daily_signout'
  | 'session_challenge_auto'
  | 'otp_provisioned'
  | 'otp_emailed'
  | 'otp_email_failed'
  | 'otp_self_service_requested'
  | 'executive_login_notification'
  | 'after_hours_login_alert';

export async function recordPortalLoginEvent(input: {
  employeeId?: string | null;
  portalAuthEmail?: string | null;
  eventType: PortalLoginEventType;
  success: boolean;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  detail?: string | null;
}): Promise<void> {
  const service = createSupabaseServiceClient();
  await service.from('portal_login_events').insert({
    employee_id: input.employeeId ?? null,
    portal_auth_email: input.portalAuthEmail ?? null,
    event_type: input.eventType,
    device_label: input.deviceLabel ?? null,
    ip_address: input.ipAddress ?? null,
    success: input.success,
    detail: input.detail ?? null,
  });
}

export async function listPortalLoginEventsForEmployee(
  employeeId: string,
  limit = 40,
): Promise<
  Array<{
    id: string;
    eventType: string;
    success: boolean;
    deviceLabel: string | null;
    ipAddress: string | null;
    detail: string | null;
    createdAt: string;
  }>
> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('portal_login_events')
    .select('id, event_type, success, device_label, ip_address, detail, created_at')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data?.length) return [];

  return data.map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    success: Boolean(row.success),
    deviceLabel: typeof row.device_label === 'string' ? row.device_label : null,
    ipAddress: typeof row.ip_address === 'string' ? row.ip_address : null,
    detail: typeof row.detail === 'string' ? row.detail : null,
    createdAt: String(row.created_at),
  }));
}

export type CompanyPortalLoginEvent = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeRank: string | null;
  portalAuthEmail: string | null;
  eventType: string;
  success: boolean;
  deviceLabel: string | null;
  ipAddress: string | null;
  detail: string | null;
  createdAt: string;
};

function mapCompanyPortalLoginEventRows(
  rows: Array<Record<string, unknown>>,
  employeeById: Map<string, { name: string | null; rank: string | null }>,
): CompanyPortalLoginEvent[] {
  return rows.map((row) => {
    const employeeId =
      typeof row.employee_id === 'string' ? row.employee_id : null;
    const meta = employeeId ? employeeById.get(employeeId) : undefined;
    return {
      id: String(row.id),
      employeeId,
      employeeName: meta?.name ?? null,
      employeeRank: meta?.rank ?? null,
      portalAuthEmail:
        typeof row.portal_auth_email === 'string' ? row.portal_auth_email : null,
      eventType: String(row.event_type),
      success: Boolean(row.success),
      deviceLabel: typeof row.device_label === 'string' ? row.device_label : null,
      ipAddress: typeof row.ip_address === 'string' ? row.ip_address : null,
      detail: typeof row.detail === 'string' ? row.detail : null,
      createdAt: String(row.created_at),
    };
  });
}

async function headOfficeEmployeeLookup(companyId: string) {
  const service = createSupabaseServiceClient();
  const { data: employees } = await service
    .from('employees')
    .select('id, full_name, rank')
    .eq('company_id', companyId)
    .ilike('group', 'HEAD_OFFICE');

  if (!employees?.length) {
    return { employeeIds: [] as string[], employeeById: new Map() };
  }

  const employeeIds = employees.map((row) => String(row.id));
  const employeeById = new Map(
    employees.map((row) => [
      String(row.id),
      {
        name: typeof row.full_name === 'string' ? row.full_name : null,
        rank: typeof row.rank === 'string' ? row.rank : null,
      },
    ]),
  );

  return { employeeIds, employeeById };
}

const PORTAL_LOGIN_EVENT_COLUMNS =
  'id, employee_id, portal_auth_email, event_type, success, device_label, ip_address, detail, created_at';

export async function listPortalLoginEventsForCompany(
  companyId: string,
  limit = 80,
): Promise<CompanyPortalLoginEvent[]> {
  const { employeeIds, employeeById } = await headOfficeEmployeeLookup(companyId);
  if (!employeeIds.length) return [];

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('portal_login_events')
    .select(PORTAL_LOGIN_EVENT_COLUMNS)
    .in('employee_id', employeeIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data?.length) return [];

  return mapCompanyPortalLoginEventRows(data, employeeById);
}

export async function listPortalLoginEventsForCompanyPaged(
  companyId: string,
  page = 1,
  pageSize = 10,
): Promise<{
  events: CompanyPortalLoginEvent[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(50, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { employeeIds, employeeById } = await headOfficeEmployeeLookup(companyId);
  if (!employeeIds.length) {
    return { events: [], total: 0, page: safePage, pageSize: safePageSize };
  }

  const service = createSupabaseServiceClient();
  const { data, count } = await service
    .from('portal_login_events')
    .select(PORTAL_LOGIN_EVENT_COLUMNS, { count: 'exact' })
    .in('employee_id', employeeIds)
    .order('created_at', { ascending: false })
    .range(from, to);

  return {
    events: data?.length ? mapCompanyPortalLoginEventRows(data, employeeById) : [],
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function recordHeadOfficeOtpProvisionEvents(input: {
  employeeId: string;
  portalAuthEmail: string;
  subjectRank: string | null;
  provisionedByName?: string | null;
  provisionedByRank?: string | null;
  emailed: boolean;
  emailError?: string;
}): Promise<void> {
  const detailBase = {
    subjectRank: input.subjectRank,
    provisionedBy: input.provisionedByName ?? null,
    provisionedByRank: input.provisionedByRank ?? null,
  };

  await recordPortalLoginEvent({
    employeeId: input.employeeId,
    portalAuthEmail: input.portalAuthEmail,
    eventType: 'otp_provisioned',
    success: true,
    detail: JSON.stringify({ ...detailBase, delivery: input.emailed ? 'email' : 'on_screen' }),
  });

  if (input.emailed) {
    await recordPortalLoginEvent({
      employeeId: input.employeeId,
      portalAuthEmail: input.portalAuthEmail,
      eventType: 'otp_emailed',
      success: true,
      detail: JSON.stringify(detailBase),
    });
    return;
  }

  if (input.emailError) {
    await recordPortalLoginEvent({
      employeeId: input.employeeId,
      portalAuthEmail: input.portalAuthEmail,
      eventType: 'otp_email_failed',
      success: false,
      detail: JSON.stringify({ ...detailBase, error: input.emailError }),
    });
  }
}
