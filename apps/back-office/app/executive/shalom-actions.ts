'use server';

import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import {
  countRawIcalEvents,
  isAllowedOtaIcalUrl,
  isIcalCalendarDocument,
  otaUidMatchesFeed,
  parseIcalEvents,
  resolveOtaImport,
} from './shalom/shalom-ical-import';
import { appendIcalCancellation, pearzenIcalUid } from './shalom/shalom-ical-cancel';
import { SHALOM_ICAL_EXPORT_CHANNELS } from './shalom/shalom-ical-export';
import {
  findShalomEmployeeByEpf,
  getShalomPortalAuthRecord,
  isShalomEmployeeActive,
  normalizeShalomEpfNo,
  shalomEmployeeEpfKey,
  type ShalomEmployeeRow,
} from '../../lib/shalom-front-auth';
import { signShalomGuestIdRef } from '../../../../packages/supabase/shalom-guest-id-storage';
import { provisionShalomPortalOtp } from '../../lib/shalom-front-auth-server';
import { shalomMonthRange } from '../../lib/shalom-calendar';
import {
  mapShalomBookingStayOpsFromRow,
  normalizeCollectInquiryPhone,
  parseShalomStayOpsSettings,
  sanitizeShalomDamagePresetsInput,
  sanitizeShalomHandoverRoomsInput,
  type ShalomDamagePreset,
  type ShalomHandoverRoom,
  type ShalomPreHandoverPhoto,
  type ShalomRecordedDamage,
} from '../../lib/shalom-stay-ops';
import { normalizeShalomPublicSlug } from '../../lib/shalom-public-listings';
import { normalizeShalomBookingAlertEmail } from '../../lib/shalom-direct-booking-alert';
import { notifyShalomBookingReceived } from '../../lib/shalom-direct-booking-alert-server';

export type ShalomCaretakerOption = {
  epf: string;
  fullName: string;
  site: string;
};

export type ShalomChannel = 'AIRBNB' | 'BOOKING' | 'DIRECT' | 'BLOCKED' | 'AUTO_BLOCK';

export type ShalomBookingRecord = {
  id: string;
  guestName: string;
  channel: ShalomChannel;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: number;
  totalRevenue: number;
  paid: boolean;
  notes?: string;
  enriched?: boolean;
  enrichedContact?: string;
  otaIcalUid?: string;
  otaImported?: boolean;
  /** Amount caretaker should collect; null = personnel use only */
  caretakerCollectLkr?: number | null;
  damages: ShalomRecordedDamage[];
  guestIdDocumentUrl: string | null;
  invoiceEmail: string | null;
  invoiceSentAt: string | null;
  invoiceReference: string | null;
  preHandoverPhotos: Array<ShalomPreHandoverPhoto & { signedUrl?: string | null }>;
  preHandoverVerifiedAt: string | null;
};

export type ShalomOtaFeedEvent = {
  checkIn: string;
  checkOut: string;
  summary: string;
  isBlock: boolean;
};

export type ShalomOtaFeedSummary = {
  channel: 'AIRBNB' | 'BOOKING';
  rawCount: number;
  parsedCount: number;
  events: ShalomOtaFeedEvent[];
};

export type ShalomPropertyRecord = {
  id: string;
  name: string;
  location: string;
  bedrooms: number;
  overhead: number;
  occupancyTarget: number;
  otaChannels: ('AIRBNB' | 'BOOKING')[];
  airbnbIcalUrl: string;
  bookingIcalUrl: string;
  settings: Record<string, unknown>;
  collectInquiryPhone: string;
  damagePresets: ShalomDamagePreset[];
  handoverRooms: ShalomHandoverRoom[];
  caretakerEpf: string | null;
  caretakerName: string | null;
  bookingAlertEmail: string | null;
  publicPublished: boolean;
  publicSlug: string;
  bookings: ShalomBookingRecord[];
};

const SHALOM_PATH = '/executive/shalom';
const SHALOM_FRONT_PATH = '/shalom-front';

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /shalom_/i.test(error.message ?? '');
}

async function resolveCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function requireExecutiveRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD') throw new Error('Forbidden');
  return user;
}

function rowToBooking(row: Record<string, unknown>): ShalomBookingRecord {
  const stayOps = mapShalomBookingStayOpsFromRow(row);
  return {
    id: String(row.id),
    guestName: String(row.guest_name ?? ''),
    channel: row.channel as ShalomChannel,
    checkIn: String(row.check_in).slice(0, 10),
    checkOut: String(row.check_out).slice(0, 10),
    nights: Number(row.nights ?? 0),
    ratePerNight: Number(row.rate_per_night ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    paid: Boolean(row.paid),
    notes: row.notes ? String(row.notes) : undefined,
    enriched: Boolean(row.enriched),
    enrichedContact: row.enriched_contact ? String(row.enriched_contact) : undefined,
    otaIcalUid: row.ota_ical_uid ? String(row.ota_ical_uid) : undefined,
    otaImported: Boolean(row.ota_imported),
    caretakerCollectLkr: stayOps.caretakerCollectLkr,
    damages: stayOps.damages,
    guestIdDocumentUrl: stayOps.guestIdDocumentUrl,
    invoiceEmail: stayOps.invoiceEmail,
    invoiceSentAt: stayOps.invoiceSentAt,
    invoiceReference: stayOps.invoiceReference,
    preHandoverPhotos: stayOps.preHandoverPhotos,
    preHandoverVerifiedAt: stayOps.preHandoverVerifiedAt,
  };
}

async function enrichPreHandoverPhotoUrls(
  db: ReturnType<typeof createSupabaseServiceClient>,
  photos: ShalomPreHandoverPhoto[],
): Promise<Array<ShalomPreHandoverPhoto & { signedUrl?: string | null }>> {
  return Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      signedUrl: await signShalomGuestIdRef(db, photo.photoUrl),
    })),
  );
}

async function rowToBookingWithSignedPhotos(
  db: ReturnType<typeof createSupabaseServiceClient>,
  row: Record<string, unknown>,
): Promise<ShalomBookingRecord> {
  const booking = rowToBooking(row);
  if (booking.preHandoverPhotos.length === 0) return booking;
  return {
    ...booking,
    preHandoverPhotos: await enrichPreHandoverPhotoUrls(db, booking.preHandoverPhotos),
  };
}

function rowToProperty(
  row: Record<string, unknown>,
  bookings: ShalomBookingRecord[],
  caretakerName: string | null,
): ShalomPropertyRecord {
  const ota = row.ota_channels;
  const rawCaretakerEpf = row.caretaker_epf;
  const caretakerEpf =
    rawCaretakerEpf != null && String(rawCaretakerEpf).trim()
      ? normalizeShalomEpfNo(String(rawCaretakerEpf))
      : null;
  const stayOps = parseShalomStayOpsSettings(row.settings);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    location: String(row.location ?? ''),
    bedrooms: Number(row.bedrooms ?? 0),
    overhead: Number(row.overhead_lkr ?? 0),
    occupancyTarget: Number(row.occupancy_target_pct ?? 60),
    otaChannels: Array.isArray(ota)
      ? (ota.filter((c) => c === 'AIRBNB' || c === 'BOOKING') as ('AIRBNB' | 'BOOKING')[])
      : ['AIRBNB', 'BOOKING'],
    airbnbIcalUrl: String(row.airbnb_ical_url ?? ''),
    bookingIcalUrl: String(row.booking_ical_url ?? ''),
    settings: (row.settings as Record<string, unknown>) ?? {},
    collectInquiryPhone: stayOps.collectInquiryPhone,
    damagePresets: stayOps.damagePresets,
    handoverRooms: stayOps.handoverRooms,
    caretakerEpf,
    caretakerName,
    bookingAlertEmail:
      typeof row.booking_alert_email === 'string'
        ? normalizeShalomBookingAlertEmail(row.booking_alert_email)
        : null,
    publicPublished: Boolean(row.public_published),
    publicSlug:
      typeof row.public_slug === 'string' ? normalizeShalomPublicSlug(row.public_slug) : '',
    bookings,
  };
}

function mapShalomEmployeeRow(row: Record<string, unknown>): ShalomEmployeeRow {
  const epfNum = row.epf_num != null ? String(row.epf_num) : null;
  const epfNo = row.epf_no != null ? String(row.epf_no) : epfNum;
  return {
    id: String(row.id ?? ''),
    full_name: (row.full_name as string | null) ?? null,
    emp_number: (row.emp_number as string | null) ?? null,
    epf_no: epfNo,
    epf_num: epfNum,
    status: (row.status as string | null) ?? null,
    group: (row.group as string | null) ?? null,
    rank: (row.rank as string | null) ?? null,
    site: (row.site as string | null) ?? null,
    company_id: row.company_id != null ? String(row.company_id) : null,
  };
}

async function loadShalomCaretakerNameMap(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
  epfs: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(epfs.map((epf) => normalizeShalomEpfNo(epf)).filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const { data: employees } = await db
    .from('employees')
    .select('full_name, epf_no, epf_num, emp_number, group, rank, status')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  for (const row of employees ?? []) {
    const employee = mapShalomEmployeeRow(row as Record<string, unknown>);
    const epf = shalomEmployeeEpfKey(employee);
    if (!epf || !unique.includes(epf)) continue;
    out.set(epf, employee.full_name?.trim() || epf);
  }

  return out;
}

export async function fetchShalomProperties(): Promise<{
  properties: ShalomPropertyRecord[];
  tableReady: boolean;
  error?: string;
}> {
  noStore();
  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return { properties: [], tableReady: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: props, error: propError } = await db
      .from('shalom_properties')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    if (isMissingTable(propError)) {
      return { properties: [], tableReady: false, error: 'Shalom tables not applied yet.' };
    }
    if (propError) {
      return { properties: [], tableReady: false, error: propError.message };
    }

    const propIds = (props ?? []).map((p) => p.id);
    let bookings: Record<string, unknown>[] = [];
    if (propIds.length > 0) {
      const { data: bookingRows, error: bookingError } = await db
        .from('shalom_bookings')
        .select('*')
        .in('property_id', propIds)
        .order('check_in', { ascending: true });
      if (bookingError) {
        return { properties: [], tableReady: false, error: bookingError.message };
      }
      bookings = bookingRows ?? [];
    }

    const bookingsByProp = new Map<string, ShalomBookingRecord[]>();
    for (const row of bookings) {
      const pid = String(row.property_id);
      const list = bookingsByProp.get(pid) ?? [];
      list.push(await rowToBookingWithSignedPhotos(db, row as Record<string, unknown>));
      bookingsByProp.set(pid, list);
    }

    const caretakerEpfs = (props ?? [])
      .map((row) => row.caretaker_epf)
      .filter((epf): epf is string => epf != null && String(epf).trim().length > 0)
      .map((epf) => normalizeShalomEpfNo(String(epf)));
    const caretakerNames = await loadShalomCaretakerNameMap(db, companyId, caretakerEpfs);

    return {
      properties: (props ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const epf =
          record.caretaker_epf != null && String(record.caretaker_epf).trim()
            ? normalizeShalomEpfNo(String(record.caretaker_epf))
            : null;
        return rowToProperty(
          record,
          bookingsByProp.get(String(row.id)) ?? [],
          epf ? (caretakerNames.get(epf) ?? null) : null,
        );
      }),
      tableReady: true,
    };
  } catch (err) {
    return {
      properties: [],
      tableReady: false,
      error: err instanceof Error ? err.message : 'Failed to load properties',
    };
  }
}

export type ShalomPropertyGlance = {
  id: string;
  name: string;
  occupancyPct: number;
  occupancyTarget: number;
  paidRevenue: number;
  pendingRevenue: number;
  bookedNights: number;
};

export type ShalomHostGlance = {
  properties: ShalomPropertyGlance[];
  totalPaidRevenue: number;
  totalPendingRevenue: number;
  portfolioOccupancyPct: number;
  totalBookedNights: number;
  daysInMonth: number;
  checkInsToday: number;
  checkInsNext7d: number;
  unenrichedBookings: number;
  tableReady: boolean;
  error?: string;
};

function caretakerOptionFromEmployee(employee: ShalomEmployeeRow): ShalomCaretakerOption | null {
  const epf = shalomEmployeeEpfKey(employee);
  if (!epf) return null;
  return {
    epf,
    fullName: employee.full_name?.trim() || epf,
    site: employee.site?.trim() || '—',
  };
}

export async function fetchShalomCaretakerOptions(): Promise<{
  caretakers: ShalomCaretakerOption[];
  error?: string;
}> {
  noStore();
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { caretakers: [], error: 'No company context' };

    const db = createSupabaseServiceClient();
    const [{ data: employees, error }, { data: authRows, error: authError }] =
      await Promise.all([
        db
          .from('employees')
          .select('id, full_name, epf_no, epf_num, emp_number, site, group, rank, status')
          .eq('company_id', companyId)
          .order('full_name', { ascending: true }),
        db.from('shalom_portal_auth').select('epf_number').eq('is_active', true),
      ]);

    if (error) return { caretakers: [], error: error.message };
    if (authError && !isMissingTable(authError)) {
      return { caretakers: [], error: authError.message };
    }

    const byEpf = new Map<string, ShalomCaretakerOption>();

    for (const row of employees ?? []) {
      const employee = mapShalomEmployeeRow(row as Record<string, unknown>);
      if (!isShalomEmployeeActive(employee)) continue;
      const option = caretakerOptionFromEmployee(employee);
      if (option) byEpf.set(option.epf, option);
    }

    for (const row of authRows ?? []) {
      const epf = normalizeShalomEpfNo(String(row.epf_number ?? ''));
      if (!epf || byEpf.has(epf)) continue;
      const employee = await findShalomEmployeeByEpf(db, epf, companyId);
      if (!employee || !isShalomEmployeeActive(employee)) continue;
      const option = caretakerOptionFromEmployee(employee);
      if (option) byEpf.set(option.epf, option);
    }

    const caretakers = [...byEpf.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }),
    );

    return { caretakers };
  } catch (err) {
    return {
      caretakers: [],
      error: err instanceof Error ? err.message : 'Failed to load caretakers',
    };
  }
}

export async function fetchShalomCaretakerLoginDates(
  caretakerEpf: string,
  year: number,
  month: number,
): Promise<{ loginDates: string[]; error?: string }> {
  noStore();
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { loginDates: [], error: 'No company context' };

    const epf = normalizeShalomEpfNo(caretakerEpf);
    if (!epf) return { loginDates: [] };

    const { monthStart, monthEndExclusive } = shalomMonthRange(year, month);
    const db = createSupabaseServiceClient();
    const { data, error } = await db
      .from('shalom_portal_daily_logins')
      .select('login_date')
      .eq('company_id', companyId)
      .eq('epf_number', epf)
      .gte('login_date', monthStart)
      .lt('login_date', monthEndExclusive);

    if (error) {
      if (isMissingTable(error)) return { loginDates: [] };
      return { loginDates: [], error: error.message };
    }

    return {
      loginDates: (data ?? []).map((row) => String(row.login_date).slice(0, 10)),
    };
  } catch (err) {
    return {
      loginDates: [],
      error: err instanceof Error ? err.message : 'Failed to load caretaker logins',
    };
  }
}

export async function assignShalomCaretakerAction(
  propertyId: string,
  caretakerEpfInput: string | null,
): Promise<{
  success: boolean;
  error?: string;
  provisionedOtp?: string;
  provisionedEpf?: string;
}> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: property, error: propertyError } = await db
      .from('shalom_properties')
      .select('id, name')
      .eq('id', propertyId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (propertyError) return { success: false, error: propertyError.message };
    if (!property) return { success: false, error: 'Property not found.' };

    const caretakerEpf = caretakerEpfInput?.trim()
      ? normalizeShalomEpfNo(caretakerEpfInput)
      : null;

    let provisionedOtp: string | undefined;
    let provisionedEpf: string | undefined;

    if (caretakerEpf) {
      const employee = await findShalomEmployeeByEpf(db, caretakerEpf, companyId);
      if (!employee) {
        return { success: false, error: `Employee EPF ${caretakerEpf} not found on the MNR.` };
      }
      if (!isShalomEmployeeActive(employee)) {
        return { success: false, error: `${caretakerEpf} is not an active employee.` };
      }

      const auth = await getShalomPortalAuthRecord(db, caretakerEpf);
      if (!auth?.is_active) {
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const provision = await provisionShalomPortalOtp(db, employee, otp);
        if (!provision.ok) {
          return {
            success: false,
            error: provision.error ?? 'Failed to provision Shalom front-office access.',
          };
        }
        provisionedOtp = otp;
        provisionedEpf = caretakerEpf;
      }
    }

    const { error: updateError } = await db
      .from('shalom_properties')
      .update({
        caretaker_epf: caretakerEpf,
        updated_at: new Date().toISOString(),
      })
      .eq('id', propertyId)
      .eq('company_id', companyId);

    if (updateError) return { success: false, error: updateError.message };

    await db
      .from('shalom_caretaker_property_assignments')
      .delete()
      .eq('property_id', propertyId)
      .eq('company_id', companyId);

    if (caretakerEpf) {
      const { error: assignError } = await db.from('shalom_caretaker_property_assignments').upsert(
        {
          epf_number: caretakerEpf,
          property_id: propertyId,
          company_id: companyId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'epf_number,property_id' },
      );
      if (assignError) {
        if (isMissingTable(assignError)) {
          return {
            success: false,
            error: 'Shalom caretaker tables not applied yet. Run the Shalom portal migration on Supabase.',
          };
        }
        return { success: false, error: assignError.message };
      }
    }

    revalidatePath(SHALOM_PATH);
    return { success: true, provisionedOtp, provisionedEpf };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to assign caretaker',
    };
  }
}

export async function updateShalomPropertyBookingAlertEmailAction(
  propertyId: string,
  bookingAlertEmailInput: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const bookingAlertEmail = bookingAlertEmailInput?.trim()
      ? normalizeShalomBookingAlertEmail(bookingAlertEmailInput)
      : null;
    if (bookingAlertEmailInput?.trim() && !bookingAlertEmail) {
      return { success: false, error: 'Enter a valid email address for booking alerts.' };
    }

    const db = createSupabaseServiceClient();
    const { data: property, error: propertyError } = await db
      .from('shalom_properties')
      .select('id')
      .eq('id', propertyId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (propertyError) return { success: false, error: propertyError.message };
    if (!property) return { success: false, error: 'Property not found.' };

    const { error: updateError } = await db
      .from('shalom_properties')
      .update({
        booking_alert_email: bookingAlertEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', propertyId)
      .eq('company_id', companyId);

    if (updateError) {
      if (/booking_alert_email/i.test(updateError.message ?? '')) {
        return {
          success: false,
          error: 'Booking alert email column missing — apply Supabase migration 20260702170000_shalom_booking_alert_email.',
        };
      }
      return { success: false, error: updateError.message };
    }

    revalidatePath(SHALOM_PATH);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save booking alert email',
    };
  }
}

export async function upsertShalomProperty(input: {
  id?: string;
  name: string;
  location: string;
  bedrooms: number;
  overhead: number;
  occupancyTarget: number;
  otaChannels: ('AIRBNB' | 'BOOKING')[];
  airbnbIcalUrl?: string;
  bookingIcalUrl?: string;
  settings?: Record<string, unknown>;
  caretakerEpf?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const row: Record<string, unknown> = {
      company_id: companyId,
      name: input.name.trim(),
      location: input.location.trim(),
      bedrooms: input.bedrooms,
      overhead_lkr: input.overhead,
      occupancy_target_pct: input.occupancyTarget,
      ota_channels: input.otaChannels,
      airbnb_ical_url: input.airbnbIcalUrl ?? '',
      booking_ical_url: input.bookingIcalUrl ?? '',
      settings: input.settings ?? {},
      updated_at: new Date().toISOString(),
    };
    if (input.caretakerEpf !== undefined) {
      row.caretaker_epf = input.caretakerEpf?.trim()
        ? normalizeShalomEpfNo(input.caretakerEpf)
        : null;
    }

    if (input.id) {
      const { data: existing, error: existsError } = await db
        .from('shalom_properties')
        .select('id')
        .eq('id', input.id)
        .eq('company_id', companyId)
        .maybeSingle();
      if (existsError) return { success: false, error: existsError.message };

      if (existing) {
        const { error } = await db.from('shalom_properties').update(row).eq('id', input.id);
        if (error) return { success: false, error: error.message };
        revalidatePath(SHALOM_PATH);
        return { success: true, id: input.id };
      }

      const { error } = await db.from('shalom_properties').insert({ id: input.id, ...row });
      if (error) return { success: false, error: error.message };
      revalidatePath(SHALOM_PATH);
      return { success: true, id: input.id };
    }

    const { data, error } = await db.from('shalom_properties').insert(row).select('id').single();
    if (error) return { success: false, error: error.message };
    revalidatePath(SHALOM_PATH);
    return { success: true, id: String(data.id) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function upsertShalomBooking(input: {
  id?: string;
  propertyId: string;
  guestName: string;
  channel: ShalomChannel;
  checkIn: string;
  checkOut: string;
  nights: number;
  ratePerNight: number;
  totalRevenue: number;
  paid: boolean;
  notes?: string;
  enriched?: boolean;
  enrichedContact?: string;
  caretakerCollectLkr?: number | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const row = {
      property_id: input.propertyId,
      company_id: companyId,
      guest_name: input.guestName.trim(),
      channel: input.channel,
      check_in: input.checkIn,
      check_out: input.checkOut,
      nights: input.nights,
      rate_per_night: input.ratePerNight,
      total_revenue: input.totalRevenue,
      paid: input.paid,
      notes: input.notes ?? '',
      enriched: Boolean(input.enriched),
      enriched_contact: input.enrichedContact ?? '',
      caretaker_collect_lkr:
        input.caretakerCollectLkr != null && input.caretakerCollectLkr > 0
          ? input.caretakerCollectLkr
          : null,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await db.from('shalom_bookings').update(row).eq('id', input.id);
      if (error) return { success: false, error: error.message };
      revalidatePath(SHALOM_PATH);
      revalidatePath(SHALOM_FRONT_PATH);
      return { success: true, id: input.id };
    }

    const { data, error } = await db.from('shalom_bookings').insert(row).select('id, channel').single();
    if (error) return { success: false, error: error.message };
    const bookingId = String(data.id);
    if (input.channel !== 'BLOCKED') {
      void notifyShalomBookingReceived(bookingId).then((alertResult) => {
        if (!alertResult.ok && alertResult.error) {
          console.error('upsertShalomBooking alert:', alertResult.error);
        }
      });
    }
    revalidatePath(SHALOM_PATH);
    revalidatePath(SHALOM_FRONT_PATH);
    return { success: true, id: bookingId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function deleteShalomBooking(id: string): Promise<{
  success: boolean;
  error?: string;
  otaImported?: boolean;
  pushedCancelToAirbnb?: boolean;
}> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: row, error: fetchError } = await db
      .from('shalom_bookings')
      .select('id, property_id, channel, check_in, check_out, ota_imported')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError) return { success: false, error: fetchError.message };
    if (!row) return { success: false, error: 'Booking not found' };

    const otaImported = Boolean(row.ota_imported);
    const channel = String(row.channel ?? '');
    const exportable =
      (SHALOM_ICAL_EXPORT_CHANNELS as readonly string[]).includes(channel) && !otaImported;

    let pushedCancelToAirbnb = false;
    if (exportable) {
      const propertyId = String(row.property_id);
      const { data: property, error: propertyError } = await db
        .from('shalom_properties')
        .select('settings')
        .eq('id', propertyId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (propertyError) return { success: false, error: propertyError.message };

      const settings = appendIcalCancellation(
        (property?.settings as Record<string, unknown> | undefined) ?? undefined,
        {
          uid: pearzenIcalUid(String(row.id)),
          checkIn: String(row.check_in).slice(0, 10),
          checkOut: String(row.check_out).slice(0, 10),
        },
      );

      const { error: settingsError } = await db
        .from('shalom_properties')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', propertyId)
        .eq('company_id', companyId);

      if (settingsError) return { success: false, error: settingsError.message };
      pushedCancelToAirbnb = true;
    }

    const { error } = await db
      .from('shalom_bookings')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return { success: false, error: error.message };
    revalidatePath(SHALOM_PATH);
    return { success: true, otaImported, pushedCancelToAirbnb };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

export async function deleteShalomProperty(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { error } = await db
      .from('shalom_properties')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return { success: false, error: error.message };
    revalidatePath(SHALOM_PATH);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Delete failed' };
  }
}

async function fetchOtaIcalText(url: string): Promise<string> {
  if (!isAllowedOtaIcalUrl(url)) {
    throw new Error('OTA calendar URL must be from Airbnb or Booking.com');
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'text/calendar,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.airbnb.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`OTA calendar fetch failed (${response.status})`);
  }

  return response.text();
}

function isMissingOtaColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42703' || /ota_ical_uid|ota_imported/i.test(error.message ?? '');
}

/** Pull reserved/blocked dates from Airbnb & Booking.com iCal feeds into shalom_bookings. */
export async function syncShalomPropertyFromOtas(propertyId: string): Promise<{
  success: boolean;
  imported: number;
  removed: number;
  errors: string[];
  feeds?: ShalomOtaFeedSummary[];
  properties?: ShalomPropertyRecord[];
}> {
  noStore();
  try {
    await requireExecutiveRole();
    const sessionCompanyId = await resolveCompanyId();
    if (!sessionCompanyId) {
      return { success: false, imported: 0, removed: 0, errors: ['No company context'] };
    }

    const db = createSupabaseServiceClient();
    const { data: property, error: propError } = await db
      .from('shalom_properties')
      .select('id, company_id, airbnb_ical_url, booking_ical_url')
      .eq('id', propertyId)
      .maybeSingle();

    if (propError || !property) {
      return {
        success: false,
        imported: 0,
        removed: 0,
        errors: [propError?.message ?? 'Property not found'],
      };
    }

    const companyId = String(property.company_id);
    if (companyId !== sessionCompanyId) {
      return {
        success: false,
        imported: 0,
        removed: 0,
        errors: ['Property not found for your company'],
      };
    }

    const feeds: { channel: 'AIRBNB' | 'BOOKING'; url: string }[] = [];
    const airbnbUrl = String(property.airbnb_ical_url ?? '').trim();
    const bookingUrl = String(property.booking_ical_url ?? '').trim();
    if (airbnbUrl) feeds.push({ channel: 'AIRBNB', url: airbnbUrl });
    if (bookingUrl) feeds.push({ channel: 'BOOKING', url: bookingUrl });

    if (feeds.length === 0) {
      return {
        success: false,
        imported: 0,
        removed: 0,
        errors: ['No Airbnb or Booking.com iCal URL saved on this property. Add one in Property Settings.'],
      };
    }

    let imported = 0;
    let removed = 0;
    const errors: string[] = [];
    const feedSummaries: ShalomOtaFeedSummary[] = [];

    const todayIso = new Date().toISOString().slice(0, 10);

    for (const feed of feeds) {
      try {
        const icsText = await fetchOtaIcalText(feed.url);
        if (!isIcalCalendarDocument(icsText)) {
          throw new Error('Response is not a valid iCal calendar');
        }

        const rawEventCount = countRawIcalEvents(icsText);
        const events = parseIcalEvents(icsText);
        if (rawEventCount > 0 && events.length === 0) {
          throw new Error(`Failed to parse ${rawEventCount} calendar event(s)`);
        }

        feedSummaries.push({
          channel: feed.channel,
          rawCount: rawEventCount,
          parsedCount: events.length,
          events: events.map((event) => {
            const { isBlock } = resolveOtaImport(event.summary, feed.channel, event.nights);
            return {
              checkIn: event.checkIn,
              checkOut: event.checkOut,
              summary: event.summary,
              isBlock,
            };
          }),
        });

        const activeUids = new Set<string>();

        for (const event of events) {
          activeUids.add(event.uid);
          const { isBlock, guestName } = resolveOtaImport(event.summary, feed.channel, event.nights);
          const row = {
            property_id: propertyId,
            company_id: companyId,
            guest_name: guestName,
            channel: isBlock ? ('BLOCKED' as const) : feed.channel,
            check_in: event.checkIn,
            check_out: event.checkOut,
            nights: event.nights,
            rate_per_night: 0,
            total_revenue: 0,
            paid: false,
            notes: isBlock
              ? `Synced via ${feed.channel} iCal — blocked / unavailable night.`
              : feed.channel === 'BOOKING'
                ? 'Synced via Booking.com iCal — occupied night (feed does not separate guest vs closed).'
                : 'Synced via Airbnb iCal — guest stay (no guest name in feed).',
            enriched: false,
            enriched_contact: '',
            ota_ical_uid: event.uid,
            ota_imported: true,
            updated_at: new Date().toISOString(),
          };

          const { data: existing, error: existingError } = await db
            .from('shalom_bookings')
            .select('id, enriched')
            .eq('property_id', propertyId)
            .eq('ota_ical_uid', event.uid)
            .maybeSingle();

          if (existingError && !isMissingOtaColumn(existingError)) {
            errors.push(`${feed.channel}: ${existingError.message}`);
            continue;
          }

          if (existing) {
            const updatePayload: Record<string, unknown> = {
              channel: row.channel,
              check_in: event.checkIn,
              check_out: event.checkOut,
              nights: event.nights,
              notes: row.notes,
              ota_imported: true,
              updated_at: row.updated_at,
            };
            if (!existing.enriched) {
              updatePayload.guest_name = guestName;
            }

            const { error: updateError } = await db
              .from('shalom_bookings')
              .update(updatePayload)
              .eq('id', existing.id);
            if (updateError && !isMissingOtaColumn(updateError)) {
              errors.push(`${feed.channel}: ${updateError.message}`);
              continue;
            }
            imported += 1;
            continue;
          }

          const { data: inserted, error: insertError } = await db
            .from('shalom_bookings')
            .insert(row)
            .select('id, channel')
            .maybeSingle();
          if (insertError) {
            if (isMissingOtaColumn(insertError)) {
              errors.push('OTA sync columns missing — apply Supabase migration 20260615210000_shalom_bookings_ota_ical_uid.');
              break;
            }
            errors.push(`${feed.channel}: ${insertError.message}`);
            continue;
          }
          imported += 1;
          if (inserted?.id && String(inserted.channel ?? row.channel) !== 'BLOCKED') {
            void notifyShalomBookingReceived(String(inserted.id)).then((alertResult) => {
              if (!alertResult.ok && alertResult.error) {
                console.error('syncShalomPropertyFromOtas alert:', alertResult.error);
              }
            });
          }
        }

        const { data: staleRows, error: staleError } = await db
          .from('shalom_bookings')
          .select('id, ota_ical_uid, channel, check_in, check_out')
          .eq('property_id', propertyId)
          .eq('company_id', companyId)
          .eq('ota_imported', true);

        if (staleError && !isMissingOtaColumn(staleError)) {
          errors.push(`${feed.channel}: ${staleError.message}`);
          continue;
        }

        const staleIds = (staleRows ?? [])
          .filter((row) => {
            const uid = String(row.ota_ical_uid ?? '');
            if (!uid || activeUids.has(uid)) return false;
            const checkIn = String(row.check_in ?? '').slice(0, 10);
            // Airbnb / Booking.com drop past nights from export — keep anything that has started.
            if (checkIn && checkIn <= todayIso) return false;
            return (
              row.channel === feed.channel ||
              row.channel === 'BLOCKED' ||
              otaUidMatchesFeed(uid, feed.channel)
            );
          })
          .map((row) => String(row.id));

        if (staleIds.length > 0) {
          const { error: deleteError } = await db
            .from('shalom_bookings')
            .delete()
            .in('id', staleIds)
            .eq('company_id', companyId);
          if (deleteError) {
            errors.push(`${feed.channel}: ${deleteError.message}`);
          } else {
            removed += staleIds.length;
          }
        }
      } catch (err) {
        errors.push(
          `${feed.channel}: ${err instanceof Error ? err.message : 'Calendar fetch failed'}`,
        );
      }
    }

    revalidatePath(SHALOM_PATH);
    const refreshed = await fetchShalomProperties();

    return {
      success: errors.length === 0,
      imported,
      removed,
      errors,
      feeds: feedSummaries,
      properties: refreshed.properties,
    };
  } catch (err) {
    return {
      success: false,
      imported: 0,
      removed: 0,
      errors: [err instanceof Error ? err.message : 'OTA sync failed'],
    };
  }
}

export async function updateShalomStayOpsSettingsAction(
  propertyId: string,
  input: {
    collectInquiryPhone?: string;
    damagePresets?: ShalomDamagePreset[];
    handoverRooms?: ShalomHandoverRoom[];
  },
): Promise<{
  success: boolean;
  collectInquiryPhone?: string;
  damagePresets?: ShalomDamagePreset[];
  handoverRooms?: ShalomHandoverRoom[];
  error?: string;
}> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    if (
      input.collectInquiryPhone == null &&
      input.damagePresets == null &&
      input.handoverRooms == null
    ) {
      return { success: false, error: 'Nothing to save.' };
    }

    const db = createSupabaseServiceClient();
    const { data: property, error: fetchError } = await db
      .from('shalom_properties')
      .select('settings')
      .eq('id', propertyId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError) {
      if (isMissingTable(fetchError)) {
        return { success: false, error: 'Shalom tables not applied yet.' };
      }
      return { success: false, error: fetchError.message };
    }
    if (!property) return { success: false, error: 'Property not found.' };

    const existingSettings =
      property.settings && typeof property.settings === 'object'
        ? (property.settings as Record<string, unknown>)
        : {};
    const stayOps = parseShalomStayOpsSettings(existingSettings);

    let nextPhone = stayOps.collectInquiryPhone;
    if (input.collectInquiryPhone != null) {
      const trimmed = input.collectInquiryPhone.trim();
      if (!trimmed) {
        nextPhone = '';
      } else {
        const normalized = normalizeCollectInquiryPhone(trimmed);
        const digits = normalized.replace(/\D/g, '');
        if (digits.length < 9) {
          return { success: false, error: 'Enter a valid phone number for caretakers to call.' };
        }
        nextPhone = normalized;
      }
    }

    let nextDamagePresets = stayOps.damagePresets;
    if (input.damagePresets != null) {
      const validated = sanitizeShalomDamagePresetsInput(input.damagePresets);
      if (!validated.ok) return { success: false, error: validated.error };
      nextDamagePresets = validated.presets;
    }

    let nextHandoverRooms = stayOps.handoverRooms;
    if (input.handoverRooms != null) {
      const validated = sanitizeShalomHandoverRoomsInput(input.handoverRooms);
      if (!validated.ok) return { success: false, error: validated.error };
      nextHandoverRooms = validated.rooms;
    }

    const settings = {
      ...existingSettings,
      collectInquiryPhone: nextPhone,
      damagePresets: nextDamagePresets,
      handoverRooms: nextHandoverRooms,
    };

    const { error: updateError } = await db
      .from('shalom_properties')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', propertyId)
      .eq('company_id', companyId);

    if (updateError) return { success: false, error: updateError.message };

    revalidatePath(SHALOM_PATH);
    return {
      success: true,
      collectInquiryPhone: nextPhone,
      damagePresets: nextDamagePresets,
      handoverRooms: nextHandoverRooms,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not save stay-ops settings.',
    };
  }
}

export async function updateShalomCollectInquiryPhoneAction(
  propertyId: string,
  collectInquiryPhone: string,
): Promise<{ success: boolean; phone?: string; error?: string }> {
  const result = await updateShalomStayOpsSettingsAction(propertyId, { collectInquiryPhone });
  return {
    success: result.success,
    phone: result.collectInquiryPhone,
    error: result.error,
  };
}

export async function updateShalomDamagePresetsAction(
  propertyId: string,
  damagePresets: ShalomDamagePreset[],
): Promise<{ success: boolean; damagePresets?: ShalomDamagePreset[]; error?: string }> {
  const result = await updateShalomStayOpsSettingsAction(propertyId, { damagePresets });
  return {
    success: result.success,
    damagePresets: result.damagePresets,
    error: result.error,
  };
}

export async function updateShalomHandoverRoomsAction(
  propertyId: string,
  handoverRooms: ShalomHandoverRoom[],
): Promise<{ success: boolean; handoverRooms?: ShalomHandoverRoom[]; error?: string }> {
  const result = await updateShalomStayOpsSettingsAction(propertyId, { handoverRooms });
  return {
    success: result.success,
    handoverRooms: result.handoverRooms,
    error: result.error,
  };
}

export async function getShalomGuestIdSignedUrlAction(
  bookingId: string,
): Promise<{ success: boolean; signedUrl?: string | null; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: booking, error } = await db
      .from('shalom_bookings')
      .select('id, guest_id_document_url')
      .eq('id', bookingId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return { success: false, error: 'Shalom stay-ops tables not applied yet.' };
      }
      return { success: false, error: error.message };
    }
    if (!booking) return { success: false, error: 'Booking not found.' };

    const signedUrl = await signShalomGuestIdRef(
      db,
      booking.guest_id_document_url ? String(booking.guest_id_document_url) : null,
    );
    return { success: true, signedUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load guest ID photo.',
    };
  }
}
