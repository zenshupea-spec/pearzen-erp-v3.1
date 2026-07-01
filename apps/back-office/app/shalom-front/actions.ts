'use server';

import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { parseReplacementCatalog } from '../../../../packages/replacement-catalog';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import { bookingOverlapsMonth, shalomMonthRange } from '../../lib/shalom-calendar';
import {
  mapShalomBookingStayOpsFromRow,
  parseDamageItems,
  parsePreHandoverPhotos,
  parseShalomStayOpsSettings,
  resolveHandoverRooms,
  resolveShalomDamagePresets,
  sortPreHandoverPhotos,
  type ShalomDamagePreset,
  type ShalomDamageRecordEntry,
  type ShalomHandoverRoom,
  type ShalomPreHandoverPhoto,
  type ShalomRecordedDamage,
} from '../../lib/shalom-stay-ops';
import {
  allocateShalomInvoiceReference,
  buildShalomStayInvoiceFromBooking,
  isValidShalomGuestInvoiceEmail,
  sendShalomStayInvoiceEmail,
} from '../../lib/shalom-stay-invoice';
import {
  findShalomEmployeeByEpf,
  getShalomPortalAuthRecord,
  isShalomEmployeeActive,
  normalizeShalomEpfNo,
  requireShalomSession,
  shalomEmployeeEpfKey,
  shalomFrontAuthEmail,
  shalomPortalLoginDateColombo,
  type ShalomEmployeeRow,
} from '../../lib/shalom-front-auth';
import {
  isShalomPortalOtpValid,
  burnShalomPortalOtpAfterLogin,
  revokeShalomPortalOtpCredentials,
} from '../../lib/shalom-front-auth-server';
import {
  parseShalomGuestIdStorageRef,
  removeShalomGuestIdObject,
  signShalomGuestIdRef,
  uploadShalomDamagePhotoBuffer,
  uploadShalomGuestIdBuffer,
  uploadShalomHandoverPhotoBuffer,
} from '../../../../packages/supabase/shalom-guest-id-storage';

export type ShalomFrontSession = {
  employee: ShalomEmployeeRow;
};

export type { ShalomFrontSession as ShalomFrontSessionType };

async function resolveShalomCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  return resolveCompanyIdForSession(supabase);
}

async function recordShalomPortalDailyLogin(
  service: ReturnType<typeof createSupabaseServiceClient>,
  epf: string,
  companyId: string,
): Promise<void> {
  const loginDate = shalomPortalLoginDateColombo();
  const { data: existing } = await service
    .from('shalom_portal_daily_logins')
    .select('id, login_count')
    .eq('epf_number', epf)
    .eq('login_date', loginDate)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing?.id) {
    await service
      .from('shalom_portal_daily_logins')
      .update({
        login_count: Number(existing.login_count ?? 0) + 1,
        updated_at: now,
      })
      .eq('id', existing.id);
    return;
  }

  await service.from('shalom_portal_daily_logins').insert({
    epf_number: epf,
    login_date: loginDate,
    company_id: companyId,
    login_count: 1,
    updated_at: now,
  });
}

export async function authenticateShalomFrontStaff(formData: FormData) {
  const epfInput = normalizeShalomEpfNo((formData.get('epfNo') as string) ?? '');
  const password = ((formData.get('password') as string) ?? '').trim();

  if (!epfInput) return { success: false, error: 'EPF number is required.' };
  if (!password) return { success: false, error: 'PIN or OTP is required.' };

  const companyId = await resolveShalomCompanyId();
  const service = createSupabaseServiceClient();
  const employee = await findShalomEmployeeByEpf(service, epfInput, companyId);

  if (!employee) {
    return { success: false, error: 'EPF number not found on the master nominal roll.' };
  }
  if (!isShalomEmployeeActive(employee)) {
    return { success: false, error: 'This employee is not active.' };
  }

  const epf = shalomEmployeeEpfKey(employee) || epfInput;
  const authRecord = await getShalomPortalAuthRecord(service, epf);
  if (!authRecord || !authRecord.is_active) {
    return { success: false, error: 'Portal access not provisioned. Contact HR.' };
  }

  if (authRecord.needs_pin_setup) {
    if (!authRecord.current_otp_hash) {
      return {
        success: false,
        error: 'This OTP was already used. Ask HR for a new one.',
      };
    }

    const otpExpired = !isShalomPortalOtpActive(authRecord.otp_expires_at);
    const otpValid = isShalomPortalOtpValid(authRecord, password, epf);

    if (otpExpired && authRecord.current_otp_hash) {
      await revokeShalomPortalOtpCredentials(service, epf);
      return { success: false, error: 'Invalid or expired OTP. Ask HR for a new one.' };
    }

    if (!otpValid || otpExpired) {
      return { success: false, error: 'Invalid or expired OTP. Ask HR for a new one.' };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: shalomFrontAuthEmail(epf),
    password,
  });

  if (error) {
    return { success: false, error: 'Invalid credentials.' };
  }

  if (authRecord.needs_pin_setup) {
    await burnShalomPortalOtpAfterLogin(service, epf);
  }

  const employeeCompanyId = employee.company_id ?? companyId;
  if (!employeeCompanyId) {
    await supabase.auth.signOut();
    return { success: false, error: 'Employee is missing company context. Contact HR.' };
  }

  await service
    .from('shalom_portal_auth')
    .update({ last_login_at: new Date().toISOString() })
    .eq('epf_number', epf);

  await recordShalomPortalDailyLogin(service, epf, employeeCompanyId);

  return {
    success: true,
    needsPinSetup: authRecord.needs_pin_setup,
    staffName: employee.full_name ?? epf,
  };
}

export async function getShalomFrontSession(): Promise<ShalomFrontSession | null> {
  noStore();
  return requireShalomSession();
}

export async function signOutShalomFrontAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login/shalom-front');
}

export type ShalomFrontCalendarProperty = {
  id: string;
  name: string;
  location: string;
  collectInquiryPhone: string;
  damagePresets: ShalomDamagePreset[];
  handoverRooms: ShalomHandoverRoom[];
};

export type ShalomFrontCalendarBooking = {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  otaImported?: boolean;
  notes?: string;
  caretakerCollectLkr?: number | null;
  damages: ShalomRecordedDamage[];
  guestIdDocumentUrl: string | null;
  invoiceEmail: string | null;
  invoiceSentAt: string | null;
  invoiceReference: string | null;
  preHandoverPhotos: ShalomPreHandoverPhoto[];
  preHandoverVerifiedAt: string | null;
};

export type ShalomFrontCalendarData = {
  properties: ShalomFrontCalendarProperty[];
  bookings: ShalomFrontCalendarBooking[];
  loginDates: string[];
  tableReady: boolean;
  error?: string;
};

function isMissingShalomTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /shalom_/i.test(error.message ?? '');
}

function isMissingShalomPreHandoverColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return /pre_handover_photos|pre_handover_verified_at/i.test(error.message ?? '');
}

async function fetchCompanyReplacementCatalog(
  db: ReturnType<typeof createSupabaseServiceClient>,
  companyId: string,
) {
  const { data } = await db
    .from('md_settings')
    .select('replacement_catalog')
    .eq('company_id', companyId)
    .maybeSingle();

  return parseReplacementCatalog(
    (data as { replacement_catalog?: unknown } | null)?.replacement_catalog,
  );
}

const SHALOM_BOOKING_STAY_OPS_SELECT =
  'id, property_id, guest_name, channel, check_in, check_out, nights, ota_imported, notes, caretaker_collect_lkr, damage_items, guest_id_document_url, invoice_email, invoice_sent_at, invoice_reference';

const SHALOM_BOOKING_HANDOVER_SELECT =
  `${SHALOM_BOOKING_STAY_OPS_SELECT}, pre_handover_photos, pre_handover_verified_at`;

const SHALOM_BOOKING_ACCESS_SELECT =
  'id, property_id, company_id, guest_id_document_url, damage_items, pre_handover_photos, pre_handover_verified_at';

const SHALOM_BOOKING_ACCESS_SELECT_LEGACY =
  'id, property_id, company_id, guest_id_document_url, damage_items';

function mapBookingRow(
  row: Record<string, unknown>,
  propertyName: string,
): ShalomFrontCalendarBooking {
  const stayOps = mapShalomBookingStayOpsFromRow(row);
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    propertyName,
    guestName: String(row.guest_name ?? ''),
    channel: String(row.channel ?? 'DIRECT'),
    checkIn: String(row.check_in).slice(0, 10),
    checkOut: String(row.check_out).slice(0, 10),
    nights: Number(row.nights ?? 0),
    otaImported: Boolean(row.ota_imported),
    notes: row.notes ? String(row.notes) : undefined,
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

export async function getShalomFrontCalendarData(
  year: number,
  month: number,
): Promise<ShalomFrontCalendarData> {
  noStore();

  const session = await requireShalomSession();
  if (!session) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: 'Not signed in.' };
  }

  const epf = shalomEmployeeEpfKey(session.employee);
  if (!epf) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: 'Employee EPF not on file.' };
  }

  const companyId = session.employee.company_id ?? (await resolveShalomCompanyId());
  if (!companyId) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: 'No company context.' };
  }

  const db = createSupabaseServiceClient();

  const [{ data: directProps, error: directError }, { data: assignments, error: assignError }] =
    await Promise.all([
      db
        .from('shalom_properties')
        .select('id, name, location, caretaker_epf')
        .eq('company_id', companyId)
        .eq('caretaker_epf', epf),
      db
        .from('shalom_caretaker_property_assignments')
        .select('property_id')
        .eq('company_id', companyId)
        .eq('epf_number', epf),
    ]);

  if (isMissingShalomTable(directError) || isMissingShalomTable(assignError)) {
    return {
      properties: [],
      bookings: [],
      loginDates: [],
      tableReady: false,
      error: 'Shalom tables not applied yet.',
    };
  }
  if (directError) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: directError.message };
  }
  if (assignError) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: assignError.message };
  }

  const propertyIds = new Set<string>();
  for (const row of directProps ?? []) {
    propertyIds.add(String(row.id));
  }
  for (const row of assignments ?? []) {
    propertyIds.add(String(row.property_id));
  }

  const { monthStart, monthEndExclusive } = shalomMonthRange(year, month);

  const loadLoginDates = async (): Promise<string[]> => {
    const { data: loginRows, error: loginError } = await db
      .from('shalom_portal_daily_logins')
      .select('login_date')
      .eq('company_id', companyId)
      .eq('epf_number', epf)
      .gte('login_date', monthStart)
      .lt('login_date', monthEndExclusive);

    if (loginError) {
      if (isMissingShalomTable(loginError)) return [];
      return [];
    }

    return (loginRows ?? []).map((row) => String(row.login_date).slice(0, 10));
  };

  if (propertyIds.size === 0) {
    const loginDates = await loadLoginDates();
    return { properties: [], bookings: [], loginDates, tableReady: true };
  }

  const ids = [...propertyIds];
  const [{ data: properties, error: propertiesError }, replacementCatalog] = await Promise.all([
    db
      .from('shalom_properties')
      .select('id, name, location, settings')
      .eq('company_id', companyId)
      .in('id', ids)
      .order('name', { ascending: true }),
    fetchCompanyReplacementCatalog(db, companyId),
  ]);

  if (propertiesError) {
    return { properties: [], bookings: [], loginDates: [], tableReady: false, error: propertiesError.message };
  }

  const propertyRows: ShalomFrontCalendarProperty[] = (properties ?? []).map((row) => {
    const stayOps = parseShalomStayOpsSettings(
      (row as { settings?: unknown }).settings,
    );
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      location: String(row.location ?? ''),
      collectInquiryPhone: stayOps.collectInquiryPhone,
      damagePresets: resolveShalomDamagePresets(stayOps, replacementCatalog),
      handoverRooms: stayOps.handoverRooms,
    };
  });

  const propertyNameById = new Map(propertyRows.map((row) => [row.id, row.name]));

  let bookingRows: Record<string, unknown>[] | null = null;
  let bookingsError: { code?: string; message?: string } | null = null;

  const withHandover = await db
    .from('shalom_bookings')
    .select(SHALOM_BOOKING_HANDOVER_SELECT)
    .eq('company_id', companyId)
    .in('property_id', ids)
    .order('check_in', { ascending: true });
  bookingRows = (withHandover.data ?? []) as Record<string, unknown>[];
  bookingsError = withHandover.error;

  if (bookingsError && isMissingShalomPreHandoverColumn(bookingsError)) {
    const legacy = await db
      .from('shalom_bookings')
      .select(SHALOM_BOOKING_STAY_OPS_SELECT)
      .eq('company_id', companyId)
      .in('property_id', ids)
      .order('check_in', { ascending: true });
    bookingRows = (legacy.data ?? []) as Record<string, unknown>[];
    bookingsError = legacy.error;
  }

  const [bookings, loginDates] = await Promise.all([
    Promise.resolve(
      (bookingRows ?? [])
        .map((row) =>
          mapBookingRow(
            row as Record<string, unknown>,
            propertyNameById.get(String(row.property_id)) ?? 'Property',
          ),
        )
        .filter((booking) => bookingOverlapsMonth(booking, year, month)),
    ),
    loadLoginDates(),
  ]);

  if (bookingsError) {
    return { properties: propertyRows, bookings: [], loginDates: [], tableReady: false, error: bookingsError.message };
  }

  return {
    properties: propertyRows,
    bookings,
    loginDates,
    tableReady: true,
  };
}

async function resolveCaretakerPropertyIds(
  db: ReturnType<typeof createSupabaseServiceClient>,
  epf: string,
  companyId: string,
): Promise<Set<string>> {
  const [{ data: directProps }, { data: assignments }] = await Promise.all([
    db
      .from('shalom_properties')
      .select('id')
      .eq('company_id', companyId)
      .eq('caretaker_epf', epf),
    db
      .from('shalom_caretaker_property_assignments')
      .select('property_id')
      .eq('company_id', companyId)
      .eq('epf_number', epf),
  ]);

  const propertyIds = new Set<string>();
  for (const row of directProps ?? []) {
    propertyIds.add(String(row.id));
  }
  for (const row of assignments ?? []) {
    propertyIds.add(String(row.property_id));
  }
  return propertyIds;
}

type ShalomGuestIdBookingRow = {
  id: string;
  property_id: string;
  company_id: string;
  guest_id_document_url: string | null;
};

type CaretakerBookingRow = {
  id: string;
  property_id: string;
  company_id: string;
  guest_id_document_url: string | null;
  damage_items: unknown;
  pre_handover_photos: unknown;
  pre_handover_verified_at: string | null;
};

async function loadCaretakerBookingAccess(
  bookingId: string,
): Promise<
  | {
      ok: true;
      booking: CaretakerBookingRow;
      epf: string;
      db: ReturnType<typeof createSupabaseServiceClient>;
    }
  | { ok: false; error: string }
> {
  const session = await requireShalomSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const epf = shalomEmployeeEpfKey(session.employee);
  if (!epf) return { ok: false, error: 'Employee EPF not on file.' };

  const companyId = session.employee.company_id ?? (await resolveShalomCompanyId());
  if (!companyId) return { ok: false, error: 'No company context.' };

  const db = createSupabaseServiceClient();
  const propertyIds = await resolveCaretakerPropertyIds(db, epf, companyId);

  const { data: booking, error } = await db
    .from('shalom_bookings')
    .select(SHALOM_BOOKING_ACCESS_SELECT)
    .eq('id', bookingId)
    .eq('company_id', companyId)
    .maybeSingle();

  let resolvedBooking = booking;
  let resolvedError = error;

  if (resolvedError && isMissingShalomPreHandoverColumn(resolvedError)) {
    const legacy = await db
      .from('shalom_bookings')
      .select(SHALOM_BOOKING_ACCESS_SELECT_LEGACY)
      .eq('id', bookingId)
      .eq('company_id', companyId)
      .maybeSingle();
    resolvedBooking = legacy.data
      ? { ...legacy.data, pre_handover_photos: [], pre_handover_verified_at: null }
      : null;
    resolvedError = legacy.error;
  }

  if (resolvedError) {
    if (isMissingShalomTable(resolvedError)) {
      return { ok: false, error: 'Shalom stay-ops tables not applied yet.' };
    }
    return { ok: false, error: resolvedError.message };
  }
  if (!resolvedBooking) return { ok: false, error: 'Booking not found.' };
  if (!propertyIds.has(String(resolvedBooking.property_id))) {
    return { ok: false, error: 'You are not assigned to this property.' };
  }

  return {
    ok: true,
    booking: {
      id: String(resolvedBooking.id),
      property_id: String(resolvedBooking.property_id),
      company_id: String(resolvedBooking.company_id),
      guest_id_document_url: resolvedBooking.guest_id_document_url
        ? String(resolvedBooking.guest_id_document_url)
        : null,
      damage_items: resolvedBooking.damage_items,
      pre_handover_photos: resolvedBooking.pre_handover_photos,
      pre_handover_verified_at: resolvedBooking.pre_handover_verified_at
        ? String(resolvedBooking.pre_handover_verified_at)
        : null,
    },
    epf,
    db,
  };
}

async function loadPropertyHandoverRooms(
  db: ReturnType<typeof createSupabaseServiceClient>,
  propertyId: string,
  companyId: string,
): Promise<ShalomHandoverRoom[]> {
  const { data: property } = await db
    .from('shalom_properties')
    .select('settings')
    .eq('id', propertyId)
    .eq('company_id', companyId)
    .maybeSingle();

  const stayOps = parseShalomStayOpsSettings(
    (property as { settings?: unknown } | null)?.settings,
  );
  return resolveHandoverRooms(stayOps.handoverRooms);
}

async function loadCaretakerGuestIdBooking(
  bookingId: string,
): Promise<
  | { ok: true; booking: ShalomGuestIdBookingRow; db: ReturnType<typeof createSupabaseServiceClient> }
  | { ok: false; error: string }
> {
  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) return access;
  return {
    ok: true,
    booking: {
      id: access.booking.id,
      property_id: access.booking.property_id,
      company_id: access.booking.company_id,
      guest_id_document_url: access.booking.guest_id_document_url,
    },
    db: access.db,
  };
}

export async function recordShalomBookingDamagesAction(
  bookingId: string,
  entries: ShalomDamageRecordEntry[],
): Promise<{ success: boolean; damages?: ShalomRecordedDamage[]; error?: string }> {
  const normalizedEntries = entries
    .map((entry) => ({
      presetId: entry.presetId.trim(),
      photoUrl: entry.photoUrl.trim(),
    }))
    .filter((entry) => entry.presetId && entry.photoUrl);

  if (normalizedEntries.length === 0) {
    return { success: false, error: 'Choose at least one damage type with a photo.' };
  }

  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const { data: property, error: propertyError } = await access.db
    .from('shalom_properties')
    .select('settings')
    .eq('id', access.booking.property_id)
    .eq('company_id', access.booking.company_id)
    .maybeSingle();

  if (propertyError) {
    return { success: false, error: propertyError.message };
  }

  const stayOps = parseShalomStayOpsSettings(property?.settings);
  const replacementCatalog = await fetchCompanyReplacementCatalog(
    access.db,
    access.booking.company_id,
  );
  const damagePresets = resolveShalomDamagePresets(stayOps, replacementCatalog);
  const damages = parseDamageItems(access.booking.damage_items);
  const recordedAt = new Date().toISOString();
  const nextDamages = [...damages];

  for (const entry of normalizedEntries) {
    if (!parseShalomGuestIdStorageRef(entry.photoUrl)) {
      return { success: false, error: 'Each damage needs a photo.' };
    }

    const preset = damagePresets.find((row) => row.id === entry.presetId);
    if (!preset) {
      return { success: false, error: 'Damage type not found. Refresh and try again.' };
    }

    nextDamages.push({
      ...preset,
      recordedAt,
      recordedByEpf: access.epf,
      photoUrl: entry.photoUrl,
    });
  }

  const { error: updateError } = await access.db
    .from('shalom_bookings')
    .update({
      damage_items: nextDamages,
      updated_at: recordedAt,
    })
    .eq('id', access.booking.id)
    .eq('company_id', access.booking.company_id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath('/shalom-front');
  return { success: true, damages: nextDamages };
}

export async function uploadShalomDamagePhotoAction(
  bookingId: string,
  presetId: string,
  formData: FormData,
): Promise<{ success: boolean; photoUrl?: string; signedUrl?: string | null; error?: string }> {
  const presetKey = presetId.trim();
  if (!presetKey) return { success: false, error: 'Choose a damage type.' };

  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const payload = await readGuestIdUploadBuffer(formData);
  if (!payload.ok) return { success: false, error: payload.error };

  const upload = await uploadShalomDamagePhotoBuffer(access.db, {
    companyId: access.booking.company_id,
    bookingId: access.booking.id,
    buffer: payload.buffer,
  });
  if (!upload.success || !upload.storageRef) {
    return { success: false, error: upload.error ?? 'Upload failed.' };
  }

  const signedUrl = await signShalomGuestIdRef(access.db, upload.storageRef);
  return { success: true, photoUrl: upload.storageRef, signedUrl };
}

export async function uploadShalomHandoverPhotoAction(
  bookingId: string,
  roomId: string,
  formData: FormData,
): Promise<{
  success: boolean;
  signedUrl?: string | null;
  photos?: ShalomPreHandoverPhoto[];
  preHandoverVerifiedAt?: string | null;
  error?: string;
}> {
  const roomKey = roomId.trim();
  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const handoverRooms = await loadPropertyHandoverRooms(
    access.db,
    access.booking.property_id,
    access.booking.company_id,
  );
  const room = handoverRooms.find((row) => row.id === roomKey);
  if (!room) return { success: false, error: 'Unknown room.' };

  const payload = await readGuestIdUploadBuffer(formData);
  if (!payload.ok) return { success: false, error: payload.error };

  const existing = parsePreHandoverPhotos(access.booking.pre_handover_photos);
  const previousPhoto = existing.find((photo) => photo.id === room.id);

  const upload = await uploadShalomHandoverPhotoBuffer(access.db, {
    companyId: access.booking.company_id,
    bookingId: access.booking.id,
    buffer: payload.buffer,
  });
  if (!upload.success || !upload.storageRef) {
    return { success: false, error: upload.error ?? 'Upload failed.' };
  }

  const capturedAt = new Date().toISOString();
  const withoutRoom = existing.filter((photo) => photo.id !== room.id);
  const nextPhotos: ShalomPreHandoverPhoto[] = sortPreHandoverPhotos(
    [
      ...withoutRoom,
      {
        id: room.id,
        label: room.label,
        photoUrl: upload.storageRef,
        capturedAt,
        recordedByEpf: access.epf,
      },
    ],
    handoverRooms,
  );

  const allRoomsCaptured = handoverRooms.every((row) =>
    nextPhotos.some((photo) => photo.id === row.id),
  );
  const preHandoverVerifiedAt = allRoomsCaptured
    ? access.booking.pre_handover_verified_at ?? capturedAt
    : null;

  const { error: updateError } = await access.db
    .from('shalom_bookings')
    .update({
      pre_handover_photos: nextPhotos,
      pre_handover_verified_at: preHandoverVerifiedAt,
      updated_at: capturedAt,
    })
    .eq('id', access.booking.id)
    .eq('company_id', access.booking.company_id);

  if (updateError) {
    if (isMissingShalomPreHandoverColumn(updateError)) {
      return {
        success: false,
        error: 'Pre-handover photos are not enabled on this database yet. Ask HQ to apply the latest Shalom migration.',
      };
    }
    return { success: false, error: updateError.message };
  }

  if (previousPhoto?.photoUrl) {
    await removeShalomGuestIdObject(access.db, previousPhoto.photoUrl);
  }

  revalidatePath('/shalom-front');
  revalidatePath('/executive/shalom');

  const signedUrl = await signShalomGuestIdRef(access.db, upload.storageRef);
  return {
    success: true,
    signedUrl,
    photos: nextPhotos,
    preHandoverVerifiedAt,
  };
}

async function readGuestIdUploadBuffer(
  formData: FormData,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) {
      return { ok: false, error: 'Photo must be 2MB or smaller.' };
    }
    return { ok: true, buffer: Buffer.from(await file.arrayBuffer()) };
  }

  const dataUrl = formData.get('dataUrl');
  if (typeof dataUrl === 'string') {
    const match = dataUrl.match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/i);
    if (match?.[1]) {
      const buffer = Buffer.from(match[1], 'base64');
      if (buffer.length > 2_000_000) {
        return { ok: false, error: 'Photo must be 2MB or smaller.' };
      }
      if (buffer.length > 0) return { ok: true, buffer };
    }
  }

  return { ok: false, error: 'Choose a photo to upload.' };
}

export async function uploadShalomGuestIdAction(
  bookingId: string,
  formData: FormData,
): Promise<{ success: boolean; signedUrl?: string | null; guestIdDocumentUrl?: string; error?: string }> {
  const access = await loadCaretakerGuestIdBooking(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const payload = await readGuestIdUploadBuffer(formData);
  if (!payload.ok) return { success: false, error: payload.error };

  const upload = await uploadShalomGuestIdBuffer(access.db, {
    companyId: access.booking.company_id,
    bookingId: access.booking.id,
    buffer: payload.buffer,
    replaceStoredRef: access.booking.guest_id_document_url,
  });
  if (!upload.success || !upload.storageRef) {
    return { success: false, error: upload.error ?? 'Upload failed.' };
  }

  const { error: updateError } = await access.db
    .from('shalom_bookings')
    .update({
      guest_id_document_url: upload.storageRef,
      updated_at: new Date().toISOString(),
    })
    .eq('id', access.booking.id)
    .eq('company_id', access.booking.company_id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const signedUrl = await signShalomGuestIdRef(access.db, upload.storageRef);
  revalidatePath('/shalom-front');
  return { success: true, signedUrl, guestIdDocumentUrl: upload.storageRef };
}

export async function getShalomFrontGuestIdSignedUrlAction(
  bookingId: string,
): Promise<{ success: boolean; signedUrl?: string | null; error?: string }> {
  const access = await loadCaretakerGuestIdBooking(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const signedUrl = await signShalomGuestIdRef(
    access.db,
    access.booking.guest_id_document_url,
  );
  return { success: true, signedUrl };
}

type ShalomInvoiceBookingRow = {
  guest_name: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  caretaker_collect_lkr: unknown;
  damage_items: unknown;
  invoice_reference: string | null;
};

export async function generateShalomStayInvoiceAction(
  bookingId: string,
): Promise<{
  success: boolean;
  reference?: string;
  html?: string;
  text?: string;
  totalLkr?: number;
  error?: string;
}> {
  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) return { success: false, error: access.error };

  const { data: booking, error: bookingError } = await access.db
    .from('shalom_bookings')
    .select(
      'guest_name, check_in, check_out, nights, caretaker_collect_lkr, damage_items, invoice_reference',
    )
    .eq('id', access.booking.id)
    .eq('company_id', access.booking.company_id)
    .maybeSingle();

  if (bookingError) {
    if (isMissingShalomTable(bookingError)) {
      return { success: false, error: 'Shalom stay-ops tables not applied yet.' };
    }
    return { success: false, error: bookingError.message };
  }
  if (!booking) return { success: false, error: 'Booking not found.' };

  const invoiceBooking = booking as ShalomInvoiceBookingRow;
  const stayOps = mapShalomBookingStayOpsFromRow({
    caretaker_collect_lkr: invoiceBooking.caretaker_collect_lkr,
    damage_items: invoiceBooking.damage_items,
    invoice_reference: invoiceBooking.invoice_reference,
  });

  const { data: property, error: propertyError } = await access.db
    .from('shalom_properties')
    .select('name')
    .eq('id', access.booking.property_id)
    .eq('company_id', access.booking.company_id)
    .maybeSingle();

  if (propertyError) return { success: false, error: propertyError.message };

  const reference = allocateShalomInvoiceReference(stayOps.invoiceReference);
  const issuedAt = new Date().toISOString();
  const invoice = buildShalomStayInvoiceFromBooking({
    reference,
    issuedAt,
    propertyName: property?.name ? String(property.name) : 'Shalom property',
    guestName: invoiceBooking.guest_name?.trim() || 'Guest',
    checkIn: invoiceBooking.check_in ? String(invoiceBooking.check_in) : '',
    checkOut: invoiceBooking.check_out ? String(invoiceBooking.check_out) : '',
    nights: Number(invoiceBooking.nights) > 0 ? Number(invoiceBooking.nights) : 0,
    collectLkr: stayOps.caretakerCollectLkr,
  });

  if (!stayOps.invoiceReference) {
    const { error: updateError } = await access.db
      .from('shalom_bookings')
      .update({
        invoice_reference: reference,
        updated_at: issuedAt,
      })
      .eq('id', access.booking.id)
      .eq('company_id', access.booking.company_id);

    if (updateError) return { success: false, error: updateError.message };
    revalidatePath('/shalom-front');
    revalidatePath('/executive/shalom');
  }

  return {
    success: true,
    reference: invoice.reference,
    html: invoice.html,
    text: invoice.text,
    totalLkr: invoice.totalLkr,
  };
}

export async function sendShalomStayInvoiceAction(
  bookingId: string,
  email?: string,
): Promise<{
  success: boolean;
  reference?: string;
  totalLkr?: number;
  emailed?: boolean;
  email?: string;
  invoiceSentAt?: string;
  error?: string;
}> {
  const trimmedEmail = email?.trim() ?? '';
  if (trimmedEmail && !isValidShalomGuestInvoiceEmail(trimmedEmail)) {
    return { success: false, error: 'Enter a valid guest email address.' };
  }

  const generated = await generateShalomStayInvoiceAction(bookingId);
  if (!generated.success) {
    return { success: false, error: generated.error };
  }

  if ((generated.totalLkr ?? 0) <= 0) {
    return {
      success: false,
      error: 'No stay amount on this booking. Ask MD to set the caretaker collect amount first.',
    };
  }

  const reference = generated.reference!;
  const issuedAt = new Date().toISOString();
  let emailed = false;
  let invoiceSentAt: string | undefined;

  if (trimmedEmail) {
    const sendResult = await sendShalomStayInvoiceEmail({
      to: trimmedEmail,
      reference,
      html: generated.html!,
      text: generated.text!,
    });

    if (!sendResult.ok) {
      return { success: false, error: sendResult.error ?? 'Could not send invoice email.' };
    }

    emailed = sendResult.emailed;
    if (emailed) {
      invoiceSentAt = issuedAt;
    }
  }

  const access = await loadCaretakerBookingAccess(bookingId);
  if (!access.ok) {
    return {
      success: true,
      reference,
      totalLkr: generated.totalLkr,
      emailed,
      email: trimmedEmail || undefined,
      invoiceSentAt,
    };
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: issuedAt,
  };
  if (trimmedEmail) {
    updatePayload.invoice_email = trimmedEmail;
  }
  if (invoiceSentAt) {
    updatePayload.invoice_sent_at = invoiceSentAt;
  }

  if (trimmedEmail || invoiceSentAt) {
    const { error: updateError } = await access.db
      .from('shalom_bookings')
      .update(updatePayload)
      .eq('id', access.booking.id)
      .eq('company_id', access.booking.company_id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath('/shalom-front');
    revalidatePath('/executive/shalom');
  }

  return {
    success: true,
    reference,
    totalLkr: generated.totalLkr,
    emailed,
    email: trimmedEmail || undefined,
    invoiceSentAt,
  };
}
