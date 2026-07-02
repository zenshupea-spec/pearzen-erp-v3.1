import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  loadSettingEnvelope,
  MD_SETTINGS_ENVELOPE_KEYS,
  mergeSettingEnvelope,
} from '../../../packages/supabase/md-settings-envelope';
import { executivePortalOtpEmailFrom } from './executive-portal-auth-policy';
import { headOfficePortalOtpLabel } from './head-office-portal-email';
import { createPortalSecurityNotification } from './head-office-portal-notifications';
import type { StaffPortalId } from './portal-isolation';
import { recordPortalLoginEvent } from './portal-login-events';
import {
  DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS,
  isWithinAfterHoursWindow,
  normalizeEmailList,
  normalizePortalAfterHoursLoginAlertSettings,
  type PortalAfterHoursLoginAlertSettings,
} from './portal-after-hours-login-alerts-policy';

export {
  DEFAULT_PORTAL_AFTER_HOURS_LOGIN_ALERT_SETTINGS,
  isWithinAfterHoursWindow,
  normalizePortalAfterHoursLoginAlertSettings,
  parsePortalAlertTimeToMinutes,
  type PortalAfterHoursLoginAlertSettings,
} from './portal-after-hours-login-alerts-policy';

export async function loadPortalAfterHoursLoginAlertSettings(
  companyId: string,
): Promise<PortalAfterHoursLoginAlertSettings> {
  const service = createSupabaseServiceClient();
  const envelope = await loadSettingEnvelope(service, companyId);
  return normalizePortalAfterHoursLoginAlertSettings(
    envelope[MD_SETTINGS_ENVELOPE_KEYS.portalAfterHoursLoginAlerts],
  );
}

export async function savePortalAfterHoursLoginAlertSettings(
  companyId: string,
  settings: PortalAfterHoursLoginAlertSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizePortalAfterHoursLoginAlertSettings(settings);
  const service = createSupabaseServiceClient();
  const result = await mergeSettingEnvelope(service, companyId, {
    [MD_SETTINGS_ENVELOPE_KEYS.portalAfterHoursLoginAlerts]: normalized,
  });

  if (!result.success) {
    return { ok: false, error: result.error ?? 'Could not save after-hours alert settings.' };
  }

  return { ok: true };
}

async function resolveDefaultOdNotifyEmails(companyId: string): Promise<string[]> {
  const service = createSupabaseServiceClient();
  const { data: employees } = await service
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('rank', 'OD');

  const employeeIds = (employees ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((id): id is string => Boolean(id));

  if (!employeeIds.length) return [];

  const { data: authRows } = await service
    .from('head_office_portal_auth')
    .select('work_email')
    .in('employee_id', employeeIds)
    .eq('is_active', true);

  return normalizeEmailList(
    (authRows ?? [])
      .map((row) => (typeof row.work_email === 'string' ? row.work_email : ''))
      .filter(Boolean),
  );
}

function portalLabelForStaffPortal(staffPortal: StaffPortalId | null): string {
  if (!staffPortal) return 'Head Office portal';
  return headOfficePortalOtpLabel(staffPortal);
}

function formatAlertTimestamp(timestamp: Date): string {
  return timestamp.toLocaleString('en-LK', {
    timeZone: 'Asia/Colombo',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function sendAfterHoursPortalLoginEmail(input: {
  recipients: string[];
  employeeName: string;
  employeeRank: string;
  workEmail: string;
  portalLabel: string;
  timestamp: Date;
  ipAddress?: string | null;
  deviceLabel?: string | null;
  windowLabel: string;
}): Promise<{ emailed: boolean; error?: string }> {
  const recipients = normalizeEmailList(input.recipients);
  if (!recipients.length) return { emailed: false };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { emailed: false };

  const subject = `After-hours sign-in — ${input.portalLabel}`;
  const text = [
    'An employee signed into a head-office portal outside configured office hours.',
    '',
    `Employee: ${input.employeeName} (${input.employeeRank})`,
    `Work email: ${input.workEmail}`,
    `Portal: ${input.portalLabel}`,
    `Time (Asia/Colombo): ${formatAlertTimestamp(input.timestamp)}`,
    `Alert window: ${input.windowLabel}`,
    `IP address: ${input.ipAddress?.trim() || 'Unknown'}`,
    `Device: ${input.deviceLabel?.trim() || 'Unknown'}`,
    '',
    'Review this activity in MD Portal → Security & Access if it looks unexpected.',
    '',
    '— Classic Venture Security',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: executivePortalOtpEmailFrom(),
        to: recipients,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      return {
        emailed: false,
        error: (await response.text()) || `Email API returned ${response.status}.`,
      };
    }

    return { emailed: true };
  } catch (err) {
    return {
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export async function notifyIfAfterHoursPortalLogin(input: {
  companyId: string | null;
  employeeId: string;
  employeeName?: string | null;
  employeeRank?: string | null;
  workEmail: string;
  portalAuthEmail: string;
  staffPortal: StaffPortalId | null;
  ipAddress?: string | null;
  deviceLabel?: string | null;
  timestamp?: Date;
}): Promise<void> {
  if (!input.companyId || !input.staffPortal) return;

  const settings = await loadPortalAfterHoursLoginAlertSettings(input.companyId);
  const timestamp = input.timestamp ?? new Date();
  if (!isWithinAfterHoursWindow(settings, timestamp.getTime())) return;

  const employeeName = input.employeeName?.trim() || 'Unknown employee';
  const employeeRank = input.employeeRank?.trim().toUpperCase() || 'STAFF';
  const portalLabel = portalLabelForStaffPortal(input.staffPortal);
  const windowLabel = `${settings.startTime}–${settings.endTime} (Asia/Colombo)`;

  const notifyEmails = settings.notifyEmails.length
    ? settings.notifyEmails
    : await resolveDefaultOdNotifyEmails(input.companyId);

  const message = `${employeeName} (${employeeRank}) signed into ${portalLabel} at ${formatAlertTimestamp(timestamp)} — outside office hours (${windowLabel}).`;

  await createPortalSecurityNotification({
    companyId: input.companyId,
    subjectEmployeeId: input.employeeId,
    eventType: 'after_hours_login',
    message,
  });

  const mail = await sendAfterHoursPortalLoginEmail({
    recipients: notifyEmails,
    employeeName,
    employeeRank,
    workEmail: input.workEmail.trim(),
    portalLabel,
    timestamp,
    ipAddress: input.ipAddress,
    deviceLabel: input.deviceLabel,
    windowLabel,
  });

  await recordPortalLoginEvent({
    employeeId: input.employeeId,
    portalAuthEmail: input.portalAuthEmail,
    eventType: 'after_hours_login_alert',
    success: true,
    ipAddress: input.ipAddress ?? null,
    deviceLabel: input.deviceLabel ?? null,
    detail: JSON.stringify({
      portal: input.staffPortal,
      emailed: mail.emailed,
      recipients: notifyEmails,
      error: mail.error ?? null,
    }),
  });
}
