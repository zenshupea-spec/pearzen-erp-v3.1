'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import {
  guestNameFromOtaSummary,
  isAllowedOtaIcalUrl,
  parseIcalEvents,
} from './shalom/shalom-ical-import';

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
  bookings: ShalomBookingRecord[];
};

const SHALOM_PATH = '/executive/shalom';

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
  };
}

function rowToProperty(
  row: Record<string, unknown>,
  bookings: ShalomBookingRecord[],
): ShalomPropertyRecord {
  const ota = row.ota_channels;
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
    bookings,
  };
}

export async function fetchShalomProperties(): Promise<{
  properties: ShalomPropertyRecord[];
  tableReady: boolean;
  error?: string;
}> {
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
      list.push(rowToBooking(row as Record<string, unknown>));
      bookingsByProp.set(pid, list);
    }

    return {
      properties: (props ?? []).map((row) =>
        rowToProperty(row as Record<string, unknown>, bookingsByProp.get(String(row.id)) ?? []),
      ),
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

function monthBounds(year: number, month: number) {
  const mk = `${year}-${String(month).padStart(2, '0')}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    monthKey: mk,
    monthStart: `${mk}-01`,
    monthEnd: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
    daysInMonth: new Date(year, month, 0).getDate(),
  };
}

function bookingInMonth(booking: ShalomBookingRecord, monthKey: string) {
  return booking.checkIn.startsWith(monthKey) || booking.checkOut.startsWith(monthKey);
}

/** Portfolio-wide host metrics for the Executive Vault finance view. */
export async function fetchShalomHostGlance(
  year: number,
  month: number,
): Promise<ShalomHostGlance> {
  const empty: ShalomHostGlance = {
    properties: [],
    totalPaidRevenue: 0,
    totalPendingRevenue: 0,
    portfolioOccupancyPct: 0,
    totalBookedNights: 0,
    daysInMonth: monthBounds(year, month).daysInMonth,
    checkInsToday: 0,
    checkInsNext7d: 0,
    unenrichedBookings: 0,
    tableReady: false,
  };

  const { properties, tableReady, error } = await fetchShalomProperties();
  if (!tableReady) return { ...empty, error };

  const { monthKey, daysInMonth } = monthBounds(year, month);
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAheadIso = weekAhead.toISOString().slice(0, 10);

  let totalPaidRevenue = 0;
  let totalPendingRevenue = 0;
  let totalBookedNights = 0;
  let checkInsToday = 0;
  let checkInsNext7d = 0;
  let unenrichedBookings = 0;

  const propertyGlances: ShalomPropertyGlance[] = properties.map((prop) => {
    const monthBookings = prop.bookings.filter((b) => bookingInMonth(b, monthKey));
    const revenueBookings = monthBookings.filter((b) => b.channel !== 'BLOCKED' && b.channel !== 'AUTO_BLOCK');
    const paidRevenue = revenueBookings.filter((b) => b.paid).reduce((s, b) => s + b.totalRevenue, 0);
    const pendingRevenue = revenueBookings.filter((b) => !b.paid).reduce((s, b) => s + b.totalRevenue, 0);
    const bookedNights = revenueBookings.reduce((s, b) => s + b.nights, 0);
    const occupancyPct = daysInMonth > 0 ? Math.round((bookedNights / daysInMonth) * 100) : 0;

    for (const b of prop.bookings) {
      if (b.channel === 'BLOCKED' || b.channel === 'AUTO_BLOCK') continue;
      if (b.checkIn === today) checkInsToday += 1;
      if (b.checkIn > today && b.checkIn <= weekAheadIso) checkInsNext7d += 1;
      if (!b.enriched && b.channel === 'AIRBNB' && b.totalRevenue <= 0) unenrichedBookings += 1;
    }

    totalPaidRevenue += paidRevenue;
    totalPendingRevenue += pendingRevenue;
    totalBookedNights += bookedNights;

    return {
      id: prop.id,
      name: prop.name,
      occupancyPct,
      occupancyTarget: prop.occupancyTarget,
      paidRevenue,
      pendingRevenue,
      bookedNights,
    };
  });

  const portfolioOccupancyPct =
    properties.length > 0 && daysInMonth > 0
      ? Math.round((totalBookedNights / (daysInMonth * properties.length)) * 100)
      : 0;

  return {
    properties: propertyGlances,
    totalPaidRevenue,
    totalPendingRevenue,
    portfolioOccupancyPct,
    totalBookedNights,
    daysInMonth,
    checkInsToday,
    checkInsNext7d,
    unenrichedBookings,
    tableReady: true,
    error,
  };
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
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const row = {
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
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await db.from('shalom_bookings').update(row).eq('id', input.id);
      if (error) return { success: false, error: error.message };
      revalidatePath(SHALOM_PATH);
      return { success: true, id: input.id };
    }

    const { data, error } = await db.from('shalom_bookings').insert(row).select('id').single();
    if (error) return { success: false, error: error.message };
    revalidatePath(SHALOM_PATH);
    return { success: true, id: String(data.id) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function deleteShalomBooking(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { error } = await db
      .from('shalom_bookings')
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
    headers: { Accept: 'text/calendar,text/plain,*/*' },
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
  properties?: ShalomPropertyRecord[];
}> {
  try {
    await requireExecutiveRole();
    const companyId = await resolveCompanyId();
    if (!companyId) {
      return { success: false, imported: 0, removed: 0, errors: ['No company context'] };
    }

    const db = createSupabaseServiceClient();
    const { data: property, error: propError } = await db
      .from('shalom_properties')
      .select('id, airbnb_ical_url, booking_ical_url')
      .eq('id', propertyId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (propError || !property) {
      return {
        success: false,
        imported: 0,
        removed: 0,
        errors: [propError?.message ?? 'Property not found'],
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

    for (const feed of feeds) {
      try {
        const icsText = await fetchOtaIcalText(feed.url);
        const events = parseIcalEvents(icsText);
        const activeUids = new Set<string>();

        for (const event of events) {
          activeUids.add(event.uid);
          const guestName = guestNameFromOtaSummary(event.summary, feed.channel);
          const row = {
            property_id: propertyId,
            company_id: companyId,
            guest_name: guestName,
            channel: feed.channel,
            check_in: event.checkIn,
            check_out: event.checkOut,
            nights: event.nights,
            rate_per_night: 0,
            total_revenue: 0,
            paid: false,
            notes: 'Synced via OTA iCal — guest details not included in feed.',
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
              channel: feed.channel,
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

          const { error: insertError } = await db.from('shalom_bookings').insert(row);
          if (insertError) {
            if (isMissingOtaColumn(insertError)) {
              errors.push('OTA sync columns missing — apply Supabase migration 20260615210000_shalom_bookings_ota_ical_uid.');
              break;
            }
            errors.push(`${feed.channel}: ${insertError.message}`);
            continue;
          }
          imported += 1;
        }

        const { data: staleRows, error: staleError } = await db
          .from('shalom_bookings')
          .select('id, ota_ical_uid')
          .eq('property_id', propertyId)
          .eq('company_id', companyId)
          .eq('channel', feed.channel)
          .eq('ota_imported', true);

        if (staleError && !isMissingOtaColumn(staleError)) {
          errors.push(`${feed.channel}: ${staleError.message}`);
          continue;
        }

        const staleIds = (staleRows ?? [])
          .filter((row) => row.ota_ical_uid && !activeUids.has(String(row.ota_ical_uid)))
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
