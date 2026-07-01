'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  bookingOverlapsRange,
  nightsInCalendarMonth,
  shalomMonthRange,
} from '../../lib/shalom-calendar';
import type { ShalomHostGlance, ShalomPropertyGlance } from './finance/finance-glance-types';

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /shalom_/i.test(error.message ?? '');
}

async function resolveCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

type GlanceBookingRow = {
  property_id: string;
  check_in: string;
  check_out: string;
  channel: string;
  paid: boolean;
  total_revenue: number;
  nights: number;
  enriched: boolean;
};

function isRevenueBooking(channel: string) {
  return channel !== 'BLOCKED' && channel !== 'AUTO_BLOCK';
}

function revenueInCalendarMonth(
  booking: GlanceBookingRow,
  year: number,
  month: number,
): number {
  const nightsInMonth = nightsInCalendarMonth(booking.check_in, booking.check_out, year, month);
  if (nightsInMonth <= 0) return 0;
  const totalNights = Math.max(booking.nights, 1);
  return Math.round((booking.total_revenue * nightsInMonth) / totalNights);
}

/** Lightweight Shalom portfolio metrics for Executive Vault — no full property/booking hydration. */
export async function fetchShalomHostGlance(
  year: number,
  month: number,
): Promise<ShalomHostGlance> {
  noStore();

  const { monthStart, monthEndExclusive, daysInMonth } = shalomMonthRange(year, month);
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAheadIso = weekAhead.toISOString().slice(0, 10);

  const empty: ShalomHostGlance = {
    properties: [],
    totalPaidRevenue: 0,
    totalPendingRevenue: 0,
    portfolioOccupancyPct: 0,
    totalBookedNights: 0,
    daysInMonth,
    checkInsToday: 0,
    checkInsNext7d: 0,
    unenrichedBookings: 0,
    tableReady: false,
  };

  try {
    const companyId = await resolveCompanyId();
    if (!companyId) return { ...empty, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: props, error: propError } = await db
      .from('shalom_properties')
      .select('id, name, occupancy_target_pct')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    if (isMissingTable(propError)) {
      return { ...empty, error: 'Shalom tables not applied yet.' };
    }
    if (propError) return { ...empty, error: propError.message };

    const properties = props ?? [];
    const propIds = properties.map((p) => p.id);
    if (propIds.length === 0) {
      return { ...empty, tableReady: true };
    }

    const { data: monthBookingRows, error: bookingError } = await db
      .from('shalom_bookings')
      .select('property_id, check_in, check_out, channel, paid, total_revenue, nights, enriched')
      .in('property_id', propIds)
      .lt('check_in', monthEndExclusive)
      .gt('check_out', monthStart);

    if (bookingError) {
      if (isMissingTable(bookingError)) {
        return { ...empty, error: 'Shalom tables not applied yet.' };
      }
      return { ...empty, error: bookingError.message };
    }

    const monthBookings: GlanceBookingRow[] = (monthBookingRows ?? []).map((row) => ({
      property_id: String(row.property_id),
      check_in: String(row.check_in).slice(0, 10),
      check_out: String(row.check_out).slice(0, 10),
      channel: String(row.channel ?? ''),
      paid: Boolean(row.paid),
      total_revenue: Number(row.total_revenue ?? 0),
      nights: Number(row.nights ?? 0),
      enriched: Boolean(row.enriched),
    }));

    const bookingsByProperty = new Map<string, GlanceBookingRow[]>();
    for (const booking of monthBookings) {
      if (
        !bookingOverlapsRange(
          { checkIn: booking.check_in, checkOut: booking.check_out },
          monthStart,
          monthEndExclusive,
        )
      ) {
        continue;
      }
      const list = bookingsByProperty.get(booking.property_id) ?? [];
      list.push(booking);
      bookingsByProperty.set(booking.property_id, list);
    }

    const [{ count: unenrichedBookings }, { data: arrivalRows }] = await Promise.all([
      db
        .from('shalom_bookings')
        .select('id', { count: 'exact', head: true })
        .in('property_id', propIds)
        .eq('channel', 'AIRBNB')
        .eq('enriched', false)
        .lte('total_revenue', 0),
      db
        .from('shalom_bookings')
        .select('check_in, channel')
        .in('property_id', propIds)
        .gte('check_in', today)
        .lte('check_in', weekAheadIso),
    ]);

    let checkInsToday = 0;
    let checkInsNext7d = 0;
    for (const row of arrivalRows ?? []) {
      const channel = String(row.channel ?? '');
      if (channel === 'BLOCKED' || channel === 'AUTO_BLOCK') continue;
      const checkIn = String(row.check_in).slice(0, 10);
      if (checkIn === today) checkInsToday += 1;
      if (checkIn > today && checkIn <= weekAheadIso) checkInsNext7d += 1;
    }

    let totalPaidRevenue = 0;
    let totalPendingRevenue = 0;
    let totalBookedNights = 0;

    const propertyGlances: ShalomPropertyGlance[] = properties.map((prop) => {
      const propBookings = bookingsByProperty.get(String(prop.id)) ?? [];
      const revenueBookings = propBookings.filter((b) => isRevenueBooking(b.channel));
      const paidRevenue = revenueBookings
        .filter((b) => b.paid)
        .reduce((sum, b) => sum + revenueInCalendarMonth(b, year, month), 0);
      const pendingRevenue = revenueBookings
        .filter((b) => !b.paid)
        .reduce((sum, b) => sum + revenueInCalendarMonth(b, year, month), 0);
      const bookedNights = revenueBookings.reduce(
        (sum, b) => sum + nightsInCalendarMonth(b.check_in, b.check_out, year, month),
        0,
      );
      const occupancyPct =
        daysInMonth > 0 ? Math.round((bookedNights / daysInMonth) * 100) : 0;

      totalPaidRevenue += paidRevenue;
      totalPendingRevenue += pendingRevenue;
      totalBookedNights += bookedNights;

      return {
        id: String(prop.id),
        name: String(prop.name ?? ''),
        occupancyPct,
        occupancyTarget: Number(prop.occupancy_target_pct ?? 60),
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
      unenrichedBookings: unenrichedBookings ?? 0,
      tableReady: true,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : 'Failed to load host portfolio data.',
    };
  }
}
