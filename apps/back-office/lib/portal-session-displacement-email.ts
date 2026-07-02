import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  EXECUTIVE_PORTAL_OTP_EMAIL_FROM_DEFAULT,
  isExecutivePortalRank,
} from './executive-portal-auth-policy';
import { PENDING_LOGIN_TIMEOUT_MINUTES } from './portal-pending-login-constants';

export type SessionDisplacementReason =
  | 'auto_timeout'
  | 'approved_elsewhere'
  | 'new_login';

async function resolveDisplacementWorkEmail(input: {
  employeeId?: string | null;
  operatorEmail?: string | null;
}): Promise<{ to: string; portalLabel: string; isForge: boolean } | null> {
  if (input.employeeId) {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from('head_office_portal_auth')
      .select('work_email')
      .eq('employee_id', input.employeeId)
      .maybeSingle();

    const workEmail =
      typeof data?.work_email === 'string' ? data.work_email.trim() : '';
    if (!workEmail) return null;

    const { data: employee } = await service
      .from('employees')
      .select('rank')
      .eq('id', input.employeeId)
      .maybeSingle();
    const rank = typeof employee?.rank === 'string' ? employee.rank : null;
    const portalLabel = isExecutivePortalRank(rank)
      ? 'MD Portal'
      : 'Head Office portal';

    return { to: workEmail, portalLabel, isForge: false };
  }

  if (input.operatorEmail) {
    const normalized = input.operatorEmail.trim().toLowerCase();
    const { getForgePortalAuthRecord } = await import('./forge-portal-auth');
    const record = await getForgePortalAuthRecord(normalized);
    const to = record?.main_email?.trim() || normalized;
    if (!to) return null;

    return { to, portalLabel: 'SaaS Forge', isForge: true };
  }

  return null;
}

export async function notifySignedInElsewhereSessionDisplacement(input: {
  employeeId?: string | null;
  operatorEmail?: string | null;
  reason: SessionDisplacementReason;
}): Promise<void> {
  const resolved = await resolveDisplacementWorkEmail(input);
  if (!resolved) return;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;

  const from = resolved.isForge
    ? (process.env.FORGE_EMAIL_FROM?.trim() ??
      'Pearzen Forge <noreply@pearzen.tech>')
    : (process.env.PORTAL_EMAIL_FROM?.trim() ??
      EXECUTIVE_PORTAL_OTP_EMAIL_FROM_DEFAULT);

  const reasonLine =
    input.reason === 'auto_timeout'
      ? `A sign-in on another device was not confirmed within ${PENDING_LOGIN_TIMEOUT_MINUTES} minutes, so your previous session was ended.`
      : input.reason === 'new_login'
        ? 'A new sign-in on another device ended this session.'
        : 'Your account was signed in on another device and this session was ended.';

  const body = [
    `Your ${resolved.portalLabel} session was ended because your account was opened on another device.`,
    '',
    reasonLine,
    '',
    'If you did not sign in elsewhere, contact your administrator immediately and change your credentials.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [resolved.to],
        subject: `${resolved.portalLabel} — signed in on another device`,
        text: body,
      }),
    });

    if (!response.ok) {
      console.error(
        '[portal-session-displacement-email] Resend failed:',
        await response.text(),
      );
    }
  } catch (err) {
    console.error(
      '[portal-session-displacement-email] delivery error:',
      err instanceof Error ? err.message : err,
    );
  }
}
