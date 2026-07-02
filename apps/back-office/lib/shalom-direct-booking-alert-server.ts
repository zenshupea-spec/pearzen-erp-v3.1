import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import { createPortalSecurityNotification } from './head-office-portal-notifications';
import { normalizeShalomEpfNo, shalomEmployeeEpfKey } from './shalom-front-auth-shared';
import {
  buildShalomDirectBookingAlertEmailContent,
  buildShalomDirectBookingAlertMessage,
  normalizeShalomBookingAlertRecipients,
  resolveShalomBookingsAlertEmail,
  SHALOM_BOOKING_RECEIVED_ALERT_EVENT,
  SHALOM_DIRECT_BOOKING_ALERT_EVENT,
  type ShalomDirectBookingAlertDetails,
} from './shalom-direct-booking-alert';
import {
  resolveResendApiKey,
  shalomStayInvoiceEmailFrom,
} from './portal-resend';

const BOOKING_SELECT =
  'id, company_id, property_id, guest_name, guest_email, check_in, check_out, nights, total_revenue, paid, booking_status, channel, booking_alert_sent_at, shalom_properties!inner(name, public_headline, location, caretaker_epf, booking_alert_email)';

const EXECUTIVE_SHALOM_URL = '/executive/shalom';

function isGuestStayChannel(channel: string): boolean {
  const normalized = channel.trim().toUpperCase();
  return normalized === 'DIRECT' || normalized === 'AIRBNB' || normalized === 'BOOKING';
}

function mapAlertBookingRow(row: Record<string, unknown>): Omit<
  ShalomDirectBookingAlertDetails,
  'caretakerName'
> & {
  bookingAlertSentAt: string | null;
  propertyBookingAlertEmail: string | null;
} | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const companyId = typeof row.company_id === 'string' ? row.company_id : null;
  const propertyId = typeof row.property_id === 'string' ? row.property_id : null;
  if (!id || !companyId || !propertyId) return null;

  const propertyRaw = row.shalom_properties;
  const property = Array.isArray(propertyRaw) ? propertyRaw[0] : propertyRaw;
  if (!property || typeof property !== 'object') return null;

  const propertyRecord = property as Record<string, unknown>;
  const headline =
    typeof propertyRecord.public_headline === 'string'
      ? propertyRecord.public_headline.trim()
      : '';
  const name = typeof propertyRecord.name === 'string' ? propertyRecord.name.trim() : '';
  const location =
    typeof propertyRecord.location === 'string' ? propertyRecord.location.trim() : '';
  const caretakerEpf =
    propertyRecord.caretaker_epf != null && String(propertyRecord.caretaker_epf).trim()
      ? normalizeShalomEpfNo(String(propertyRecord.caretaker_epf))
      : '';
  const propertyBookingAlertEmail =
    typeof propertyRecord.booking_alert_email === 'string'
      ? propertyRecord.booking_alert_email.trim().toLowerCase()
      : null;

  return {
    bookingId: id,
    companyId,
    propertyId,
    guestName: typeof row.guest_name === 'string' ? row.guest_name.trim() : 'Guest',
    guestEmail:
      typeof row.guest_email === 'string' ? row.guest_email.trim().toLowerCase() : '',
    propertyName: headline || name || 'Shalom stay',
    propertySlug: '',
    propertyLocation: location,
    checkIn: typeof row.check_in === 'string' ? row.check_in.slice(0, 10) : '',
    checkOut: typeof row.check_out === 'string' ? row.check_out.slice(0, 10) : '',
    nights: Number(row.nights) || 0,
    totalLkr: Number(row.total_revenue) || 0,
    paid: Boolean(row.paid),
    bookingStatus: typeof row.booking_status === 'string' ? row.booking_status : '',
    channel: typeof row.channel === 'string' ? row.channel : '',
    caretakerEpf,
    bookingAlertSentAt:
      typeof row.booking_alert_sent_at === 'string' ? row.booking_alert_sent_at : null,
    propertyBookingAlertEmail,
  };
}

async function resolveExecutiveSubjectEmployeeId(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
): Promise<string | null> {
  for (const rank of ['MD', 'OD'] as const) {
    const { data } = await db
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('rank', rank)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (typeof data?.id === 'string' && data.id.trim()) {
      return data.id.trim();
    }
  }

  return null;
}

async function resolveCaretakerEmployee(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  caretakerEpf: string,
): Promise<{ employeeId: string; fullName: string; email: string | null } | null> {
  const normalizedEpf = normalizeShalomEpfNo(caretakerEpf);
  if (!normalizedEpf) return null;

  const { data: employees } = await db
    .from('employees')
    .select('id, full_name, epf_no, epf_num, emp_number, email, status')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  for (const row of employees ?? []) {
    const record = row as Record<string, unknown>;
    const epfNo = record.epf_no != null ? String(record.epf_no) : null;
    const epfNum = record.epf_num != null ? String(record.epf_num) : epfNo;
    const employee = {
      id: String(record.id ?? ''),
      full_name: (record.full_name as string | null) ?? null,
      emp_number: (record.emp_number as string | null) ?? null,
      epf_no: epfNo,
      epf_num: epfNum,
      status: (record.status as string | null) ?? null,
      group: null,
      rank: null,
      site: null,
      company_id: companyId,
    };
    const epfKey = shalomEmployeeEpfKey(employee);
    if (epfKey !== normalizedEpf) continue;

    const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
    return {
      employeeId: employee.id,
      fullName: employee.full_name?.trim() || normalizedEpf,
      email: email || null,
    };
  }

  return null;
}

function resolveExecutiveShalomUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BACK_OFFICE_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    'http://127.0.0.1:3002';
  const withProtocol = base.startsWith('http') ? base : `https://${base}`;
  return `${withProtocol.replace(/\/$/, '')}${EXECUTIVE_SHALOM_URL}`;
}

async function sendShalomBookingAlertEmail(
  booking: ShalomDirectBookingAlertDetails,
  propertyAlertEmail: string | null,
  caretakerEmail: string | null,
): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const recipients = normalizeShalomBookingAlertRecipients(
    propertyAlertEmail,
    resolveShalomBookingsAlertEmail(),
    caretakerEmail,
  );
  if (recipients.length === 0) {
    return { ok: true, emailed: false };
  }

  const { subject, text } = buildShalomDirectBookingAlertEmailContent(
    booking,
    resolveExecutiveShalomUrl(),
  );

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: shalomStayInvoiceEmailFrom(),
        to: recipients,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    return { ok: true, emailed: true };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export type ShalomDirectBookingAlertResult = {
  ok: boolean;
  notified: boolean;
  emailed: boolean;
  error?: string;
};

export async function notifyShalomBookingReceived(
  bookingId: string,
): Promise<ShalomDirectBookingAlertResult> {
  const normalizedId = bookingId.trim();
  if (!normalizedId) {
    return { ok: false, notified: false, emailed: false, error: 'Booking id is required.' };
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('shalom_bookings')
    .select(BOOKING_SELECT)
    .eq('id', normalizedId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      notified: false,
      emailed: false,
      error: error?.message ?? 'Booking not found.',
    };
  }

  const mapped = mapAlertBookingRow(data as Record<string, unknown>);
  if (!mapped) {
    return { ok: false, notified: false, emailed: false, error: 'Could not load booking.' };
  }

  if (!isGuestStayChannel(mapped.channel)) {
    return {
      ok: true,
      notified: false,
      emailed: false,
    };
  }

  if (mapped.channel === 'DIRECT') {
    if (!mapped.paid || mapped.bookingStatus !== 'CONFIRMED') {
      return {
        ok: false,
        notified: false,
        emailed: false,
        error: 'Direct booking is not confirmed yet.',
      };
    }
  }

  if (mapped.bookingAlertSentAt) {
    return { ok: true, notified: false, emailed: false };
  }

  const caretaker = mapped.caretakerEpf
    ? await resolveCaretakerEmployee(db, mapped.companyId, mapped.caretakerEpf)
    : null;

  const booking: ShalomDirectBookingAlertDetails = {
    ...mapped,
    caretakerName: caretaker?.fullName ?? '',
  };

  const subjectEmployeeId =
    (await resolveExecutiveSubjectEmployeeId(db, mapped.companyId)) ?? caretaker?.employeeId;

  if (!subjectEmployeeId) {
    return {
      ok: false,
      notified: false,
      emailed: false,
      error: 'No MD/OD or caretaker employee found for notification.',
    };
  }

  const eventType =
    mapped.channel === 'DIRECT'
      ? SHALOM_DIRECT_BOOKING_ALERT_EVENT
      : SHALOM_BOOKING_RECEIVED_ALERT_EVENT;

  await createPortalSecurityNotification({
    companyId: mapped.companyId,
    subjectEmployeeId,
    targetEmployeeId: caretaker?.employeeId ?? null,
    eventType,
    message: buildShalomDirectBookingAlertMessage(booking),
  });

  const mail = await sendShalomBookingAlertEmail(
    booking,
    mapped.propertyBookingAlertEmail,
    caretaker?.email ?? null,
  );
  if (!mail.ok) {
    console.error('notifyShalomBookingReceived email:', mail.error);
    return {
      ok: false,
      notified: true,
      emailed: false,
      error: mail.error,
    };
  }

  if (mail.emailed) {
    const nowIso = new Date().toISOString();
    const { error: stampError } = await db
      .from('shalom_bookings')
      .update({ booking_alert_sent_at: nowIso, updated_at: nowIso })
      .eq('id', normalizedId)
      .is('booking_alert_sent_at', null);

    if (stampError && !/booking_alert_sent_at/i.test(stampError.message ?? '')) {
      console.error('notifyShalomBookingReceived stamp:', stampError.message);
    }
  }

  return {
    ok: true,
    notified: true,
    emailed: mail.emailed,
    error: mail.error,
  };
}

export async function notifyShalomDirectBookingConfirmed(
  bookingId: string,
): Promise<ShalomDirectBookingAlertResult> {
  return notifyShalomBookingReceived(bookingId);
}
